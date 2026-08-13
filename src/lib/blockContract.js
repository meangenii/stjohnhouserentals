import blockContract from '../../shared/blockContract.json' with { type: 'json' }

function readPositiveInteger(value, label) {
  const number = Number(value)

  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`Shared block contract ${label} must be a positive integer.`)
  }

  return number
}

function readStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Shared block contract ${label} must be a non-empty array.`)
  }

  const values = value.map((entry) => String(entry ?? '').trim())

  if (values.some((entry) => !entry) || new Set(values).size !== values.length) {
    throw new Error(`Shared block contract ${label} must contain unique non-empty strings.`)
  }

  return Object.freeze(values)
}

function readContentSchemas(value, blockTypes) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Shared block contract blockContentSchemas must be an object.')
  }

  const schemaTypes = Object.keys(value)
  const missing = blockTypes.filter((type) => !schemaTypes.includes(type))
  const unsupported = schemaTypes.filter((type) => !blockTypes.includes(type))

  if (missing.length > 0 || unsupported.length > 0) {
    throw new Error('Shared block contract blockContentSchemas must exactly match supportedBlockTypes.')
  }

  return Object.freeze(value)
}

function readOptionGroups(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Shared block contract ${label} must be an object.`)
  }

  return Object.freeze(value)
}

function readElementStyleTargets(value, blockTypes) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Shared block contract blockElementStyleTargets must be an object.')
  }

  const targetTypes = Object.keys(value)
  const missing = blockTypes.filter((type) => !targetTypes.includes(type))
  const unsupported = targetTypes.filter((type) => !blockTypes.includes(type))

  if (missing.length > 0 || unsupported.length > 0) {
    throw new Error('Shared block contract blockElementStyleTargets must exactly match supportedBlockTypes.')
  }

  return Object.freeze(
    Object.fromEntries(
      blockTypes.map((type) => {
        const targets = value[type]

        if (!Array.isArray(targets)) {
          throw new Error(`Shared block contract blockElementStyleTargets.${type} must be an array.`)
        }

        const normalizedTargets = targets.map((target, index) => {
          const id = String(target?.id ?? '').trim()
          const label = String(target?.label ?? '').trim()

          if (!id || !label) {
            throw new Error(`Shared block contract blockElementStyleTargets.${type}[${index}] requires id and label.`)
          }

          return Object.freeze({ id, label })
        })
        const targetIds = normalizedTargets.map((target) => target.id)

        if (new Set(targetIds).size !== targetIds.length) {
          throw new Error(`Shared block contract blockElementStyleTargets.${type} must contain unique ids.`)
        }

        return [type, Object.freeze(normalizedTargets)]
      }),
    ),
  )
}

function readBlockVersions(value, blockTypes) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Shared block contract blockVersions must be an object.')
  }

  const versionTypes = Object.keys(value)
  const missing = blockTypes.filter((type) => !versionTypes.includes(type))
  const unsupported = versionTypes.filter((type) => !blockTypes.includes(type))

  if (missing.length > 0 || unsupported.length > 0) {
    throw new Error('Shared block contract blockVersions must exactly match supportedBlockTypes.')
  }

  return Object.freeze(
    Object.fromEntries(blockTypes.map((type) => [type, readPositiveInteger(value[type], `blockVersions.${type}`)])),
  )
}

export const BLOCK_PAGE_CONTENT_MODEL = String(blockContract.blockPageContentModel ?? '').trim()
export const BLOCK_DEFINITION_VERSION = readPositiveInteger(blockContract.currentBlockVersion, 'currentBlockVersion')
export const BLOCK_TYPES = readStringArray(blockContract.supportedBlockTypes, 'supportedBlockTypes')
export const BLOCK_VERSIONS = readBlockVersions(blockContract.blockVersions, BLOCK_TYPES)
export const BLOCK_CONTENT_SCHEMAS = readContentSchemas(blockContract.blockContentSchemas, BLOCK_TYPES)
export const BLOCK_ELEMENT_STYLE_TARGETS = readElementStyleTargets(blockContract.blockElementStyleTargets, BLOCK_TYPES)
export const BLOCK_STYLE_OPTIONS = readOptionGroups(blockContract.blockStyleOptions, 'blockStyleOptions')
export const BLOCK_RESPONSIVE_OPTIONS = readOptionGroups(blockContract.blockResponsiveOptions, 'blockResponsiveOptions')
export const STRUCTURAL_BLOCK_TYPES = readStringArray(blockContract.structuralBlockTypes, 'structuralBlockTypes')
export const MAX_STRUCTURAL_NESTING_DEPTH = readPositiveInteger(
  blockContract.maxStructuralNestingDepth,
  'maxStructuralNestingDepth',
)
export const MAX_ROW_COLUMNS = readPositiveInteger(blockContract.maxRowColumns, 'maxRowColumns')
export const MAX_ROW_COLUMN_WIDTH = readPositiveInteger(blockContract.maxRowColumnWidth, 'maxRowColumnWidth')

export function getBlockDefinitionVersion(type) {
  return BLOCK_VERSIONS[String(type ?? '').trim()] ?? BLOCK_DEFINITION_VERSION
}

if (!BLOCK_PAGE_CONTENT_MODEL) {
  throw new Error('Shared block contract blockPageContentModel is required.')
}

if (STRUCTURAL_BLOCK_TYPES.some((type) => !BLOCK_TYPES.includes(type))) {
  throw new Error('Shared block contract structuralBlockTypes must be included in supportedBlockTypes.')
}

export function assertExactBlockTypeKeys(actualTypes, label) {
  const actual = new Set(Array.from(actualTypes ?? [], (type) => String(type ?? '').trim()).filter(Boolean))
  const missing = BLOCK_TYPES.filter((type) => !actual.has(type))
  const unsupported = [...actual].filter((type) => !BLOCK_TYPES.includes(type))

  if (missing.length === 0 && unsupported.length === 0) {
    return
  }

  const details = [
    missing.length > 0 ? `missing: ${missing.join(', ')}` : '',
    unsupported.length > 0 ? `unsupported: ${unsupported.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('; ')

  throw new Error(`${label} does not match the shared block contract (${details}).`)
}
