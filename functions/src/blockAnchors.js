const MAX_BLOCK_ANCHOR_LENGTH = 64
const MAX_BLOCK_EDITOR_LABEL_LENGTH = 80

const BLOCK_ANCHOR_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const RESERVED_BLOCK_ANCHOR_IDS = new Set(['main-content', 'root'])
const RESERVED_BLOCK_ANCHOR_PREFIXES = ['admin-', 'site-']

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
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

function validateBlockAnchorSettings(blocks) {
  const issues = []
  collectAnchorIssues(blocks, ['blocks'], issues, new Set())
  return issues
}

module.exports = {
  MAX_BLOCK_ANCHOR_LENGTH,
  MAX_BLOCK_EDITOR_LABEL_LENGTH,
  validateBlockAnchorSettings,
}
