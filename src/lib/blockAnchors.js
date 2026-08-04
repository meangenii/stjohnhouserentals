export const MAX_BLOCK_ANCHOR_LENGTH = 64
export const MAX_BLOCK_EDITOR_LABEL_LENGTH = 80

const BLOCK_ANCHOR_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const RESERVED_BLOCK_ANCHOR_IDS = new Set(['main-content', 'root'])
const RESERVED_BLOCK_ANCHOR_PREFIXES = ['admin-', 'site-']

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function normalizeBlockAnchorId(value = '') {
  let anchorId = String(value ?? '')
    .trim()
    .replace(/^#+/, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (anchorId && !/^[a-z]/.test(anchorId)) {
    anchorId = `section-${anchorId}`
  }

  if (isReservedBlockAnchorId(anchorId)) {
    anchorId = `section-${anchorId}`
  }

  return anchorId.slice(0, MAX_BLOCK_ANCHOR_LENGTH).replace(/-+$/g, '')
}

export function getRenderableBlockAnchorId(value = '') {
  if (typeof value !== 'string') {
    return ''
  }

  const anchorId = value.trim()
  return anchorId.length <= MAX_BLOCK_ANCHOR_LENGTH && BLOCK_ANCHOR_PATTERN.test(anchorId) && !isReservedBlockAnchorId(anchorId) ? anchorId : ''
}

function isReservedBlockAnchorId(anchorId) {
  return RESERVED_BLOCK_ANCHOR_IDS.has(anchorId) || RESERVED_BLOCK_ANCHOR_PREFIXES.some((prefix) => anchorId.startsWith(prefix))
}

function collectAnchorIssues(blocks, path, issues, seenAnchors) {
  if (!Array.isArray(blocks)) {
    return
  }

  blocks.forEach((block, index) => {
    if (!isPlainObject(block)) {
      return
    }

    const blockPath = [...path, index]

    if (Object.prototype.hasOwnProperty.call(block, 'editorLabel')) {
      if (typeof block.editorLabel !== 'string') {
        issues.push({ code: 'invalid-editor-label', message: 'Editor label must be text.', path: [...blockPath, 'editorLabel'] })
      } else if (block.editorLabel.trim().length > MAX_BLOCK_EDITOR_LABEL_LENGTH) {
        issues.push({
          code: 'editor-label-too-long',
          message: `Editor label must be ${MAX_BLOCK_EDITOR_LABEL_LENGTH} characters or fewer.`,
          path: [...blockPath, 'editorLabel'],
        })
      }
    }

    if (Object.prototype.hasOwnProperty.call(block, 'anchorId')) {
      if (typeof block.anchorId !== 'string') {
        issues.push({ code: 'invalid-block-anchor', message: 'Section anchor must be text.', path: [...blockPath, 'anchorId'] })
      } else {
        const anchorId = block.anchorId.trim()

        if (anchorId.length > MAX_BLOCK_ANCHOR_LENGTH) {
          issues.push({
            code: 'block-anchor-too-long',
            message: `Section anchor must be ${MAX_BLOCK_ANCHOR_LENGTH} characters or fewer.`,
            path: [...blockPath, 'anchorId'],
          })
        } else if (anchorId && !BLOCK_ANCHOR_PATTERN.test(anchorId)) {
          issues.push({
            code: 'invalid-block-anchor',
            message: 'Section anchor must start with a lowercase letter and contain only lowercase letters, numbers, and single hyphens.',
            path: [...blockPath, 'anchorId'],
          })
        } else if (anchorId && isReservedBlockAnchorId(anchorId)) {
          issues.push({
            code: 'reserved-block-anchor',
            message: `Section anchor "${anchorId}" is reserved by the site interface.`,
            path: [...blockPath, 'anchorId'],
          })
        } else if (anchorId && seenAnchors.has(anchorId)) {
          issues.push({
            code: 'duplicate-block-anchor',
            message: `Section anchor "${anchorId}" is already used by another block.`,
            path: [...blockPath, 'anchorId'],
          })
        } else if (anchorId) {
          seenAnchors.add(anchorId)
        }
      }
    }

    if (block.type === 'group' && Array.isArray(block.items)) {
      block.items.forEach((item, itemIndex) => {
        collectAnchorIssues(item?.blocks, [...blockPath, 'items', itemIndex, 'blocks'], issues, seenAnchors)
      })
    }

    if (block.type === 'row' && Array.isArray(block.columns)) {
      block.columns.forEach((column, columnIndex) => {
        collectAnchorIssues(column?.blocks, [...blockPath, 'columns', columnIndex, 'blocks'], issues, seenAnchors)
      })
    }
  })
}

export function validateBlockAnchorSettings(blocks) {
  const issues = []
  collectAnchorIssues(blocks, ['blocks'], issues, new Set())
  return issues
}
