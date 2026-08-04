import { BLOCK_PAGE_CONTENT_MODEL, BLOCK_TYPES, getBlockDefinitionVersion } from './blockContract.js'

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value))
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pathToString(path = []) {
  return path.reduce((label, segment) => {
    if (typeof segment === 'number') {
      return `${label}[${segment}]`
    }

    return `${label}.${segment}`
  }, 'page')
}

function makeIssue(code, message, pathSegments) {
  return {
    code,
    message,
    path: pathToString(pathSegments),
    pathSegments: [...pathSegments],
  }
}

function migrateVersionZeroToOne(block) {
  return {
    ...block,
    version: 1,
  }
}

export const BLOCK_MIGRATION_STEPS = Object.freeze(
  Object.fromEntries(
    BLOCK_TYPES.map((type) => [
      type,
      Object.freeze({
        0: migrateVersionZeroToOne,
      }),
    ]),
  ),
)

function readBlockVersion(block, currentVersion) {
  if (block.version == null || block.version === '') {
    return currentVersion
  }

  const version = Number(block.version)
  return Number.isInteger(version) && version >= 0 ? version : null
}

export function migrateBlockRecord(block, { expectedType = '', path = [] } = {}) {
  const pathSegments = Array.isArray(path) ? [...path] : []

  if (!isPlainObject(block)) {
    return {
      block,
      errors: [makeIssue('invalid-block', 'Block must be an object before it can be migrated.', pathSegments)],
      migrated: false,
      migrations: [],
      supported: false,
    }
  }

  const workingBlock = cloneValue(block)
  const type = String(workingBlock.type ?? '').trim()
  const supported = BLOCK_TYPES.includes(type)
  const errors = []
  const migrations = []

  if (!supported) {
    return {
      block: workingBlock,
      errors,
      migrated: false,
      migrations,
      supported: false,
    }
  }

  const currentVersion = getBlockDefinitionVersion(type)

  if (expectedType && type !== expectedType) {
    errors.push(
      makeIssue(
        'block-migration-type-mismatch',
        `Expected block type "${expectedType}" but received "${type}".`,
        [...pathSegments, 'type'],
      ),
    )
  }

  let version = readBlockVersion(workingBlock, currentVersion)

  if (version == null) {
    errors.push(
      makeIssue(
        'invalid-block-version',
        `Block version must be a whole number from 0 to ${currentVersion}.`,
        [...pathSegments, 'version'],
      ),
    )
    return { block: workingBlock, errors, migrated: false, migrations, supported }
  }

  if (version > currentVersion) {
    errors.push(
      makeIssue(
        'unsupported-block-version',
        `Block version ${version} is newer than the supported version ${currentVersion}.`,
        [...pathSegments, 'version'],
      ),
    )
    return { block: workingBlock, errors, migrated: false, migrations, supported }
  }

  workingBlock.version = version

  while (version < currentVersion) {
    const migrate = BLOCK_MIGRATION_STEPS[type]?.[version]

    if (typeof migrate !== 'function') {
      errors.push(
        makeIssue(
          'missing-block-migration',
          `No migration is registered for ${type} block version ${version}.`,
          [...pathSegments, 'version'],
        ),
      )
      break
    }

    const fromVersion = version
    const nextBlock = migrate(cloneValue(workingBlock))
    const nextVersion = isPlainObject(nextBlock) ? readBlockVersion(nextBlock, currentVersion) : null

    if (!isPlainObject(nextBlock) || nextVersion !== fromVersion + 1) {
      errors.push(
        makeIssue(
          'invalid-block-migration-result',
          `The ${type} migration from version ${fromVersion} did not produce version ${fromVersion + 1}.`,
          [...pathSegments, 'version'],
        ),
      )
      break
    }

    Object.keys(workingBlock).forEach((key) => delete workingBlock[key])
    Object.assign(workingBlock, nextBlock)
    version = nextVersion
    migrations.push({
      fromVersion,
      path: pathToString(pathSegments),
      pathSegments: [...pathSegments],
      toVersion: nextVersion,
      type,
    })
  }

  return {
    block: workingBlock,
    errors,
    migrated: migrations.length > 0,
    migrations,
    supported,
  }
}

function migrateBlockArray(blocks, path, report) {
  if (!Array.isArray(blocks)) {
    return blocks
  }

  return blocks.map((block, index) => {
    const blockPath = [...path, index]
    const result = migrateBlockRecord(block, { path: blockPath })
    const migratedBlock = result.block

    report.errors.push(...result.errors)
    report.migrations.push(...result.migrations)

    if (!isPlainObject(migratedBlock)) {
      return migratedBlock
    }

    if (migratedBlock.type === 'group' && Array.isArray(migratedBlock.items)) {
      migratedBlock.items = migratedBlock.items.map((item, itemIndex) => {
        if (!isPlainObject(item)) {
          return item
        }

        return {
          ...item,
          blocks: migrateBlockArray(item.blocks, [...blockPath, 'items', itemIndex, 'blocks'], report),
        }
      })
    }

    if (migratedBlock.type === 'row' && Array.isArray(migratedBlock.columns)) {
      migratedBlock.columns = migratedBlock.columns.map((column, columnIndex) => {
        if (!isPlainObject(column)) {
          return column
        }

        return {
          ...column,
          blocks: migrateBlockArray(column.blocks, [...blockPath, 'columns', columnIndex, 'blocks'], report),
        }
      })
    }

    return migratedBlock
  })
}

export function migrateBlockPageDraft(page) {
  if (!isPlainObject(page) || String(page.contentModel ?? '').trim() !== BLOCK_PAGE_CONTENT_MODEL) {
    return {
      applies: false,
      errors: [],
      migrated: false,
      migrations: [],
      page,
    }
  }

  const migratedPage = cloneValue(page)
  const report = { errors: [], migrations: [] }
  migratedPage.blocks = migrateBlockArray(migratedPage.blocks, ['blocks'], report)

  return {
    applies: true,
    errors: report.errors,
    migrated: report.migrations.length > 0,
    migrations: report.migrations,
    page: migratedPage,
  }
}
