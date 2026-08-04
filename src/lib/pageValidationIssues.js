function copyPath(path) {
  return Array.isArray(path) ? [...path] : []
}

export function parseValidationIssuePath(value = '') {
  const source = String(value ?? '').trim().replace(/^page(?:\.|$)/, '')
  const path = []
  const segmentPattern = /(?:^|\.)([A-Za-z0-9_$-]+)|\[(\d+)\]/g
  let match

  while ((match = segmentPattern.exec(source))) {
    path.push(match[2] == null ? match[1] : Number(match[2]))
  }

  return path
}

export function getValidationIssuePath(issue) {
  return Array.isArray(issue?.pathSegments) ? copyPath(issue.pathSegments) : parseValidationIssuePath(issue?.path)
}

export function getPageValidationIssues(validation) {
  if (!validation?.applies) {
    return []
  }

  return [
    ...(Array.isArray(validation.errors) ? validation.errors.map((issue) => ({ ...issue, severity: 'error' })) : []),
    ...(Array.isArray(validation.warnings) ? validation.warnings.map((issue) => ({ ...issue, severity: 'warning' })) : []),
  ]
}

function isPathPrefix(prefix, path) {
  return prefix.length <= path.length && prefix.every((segment, index) => segment === path[index])
}

export function getValidationIssuesForPath(issues, path, { includeDescendants = false } = {}) {
  const targetPath = copyPath(path)

  return (Array.isArray(issues) ? issues : []).filter((issue) => {
    const issuePath = getValidationIssuePath(issue)
    const exactMatch = issuePath.length === targetPath.length && isPathPrefix(targetPath, issuePath)
    return exactMatch || (includeDescendants && isPathPrefix(targetPath, issuePath))
  })
}

export function findValidationIssueOwner(issue, entries = []) {
  const issuePath = getValidationIssuePath(issue)

  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry?.selectionId && isPathPrefix(copyPath(entry.path), issuePath))
    .sort((left, right) => right.path.length - left.path.length)[0] ?? null
}

export function mapValidationIssuesToEntries(validation, entries = []) {
  const issueMap = new Map()

  getPageValidationIssues(validation).forEach((issue) => {
    const owner = findValidationIssueOwner(issue, entries)

    if (!owner) {
      return
    }

    const current = issueMap.get(owner.selectionId) ?? { errors: [], warnings: [] }
    current[issue.severity === 'error' ? 'errors' : 'warnings'].push(issue)
    issueMap.set(owner.selectionId, current)
  })

  return issueMap
}

export function getPageLevelValidationIssues(validation, entries = []) {
  return getPageValidationIssues(validation).filter((issue) => !findValidationIssueOwner(issue, entries))
}

export function getValidationIssueInspectorTab(issue, entry) {
  const issuePath = getValidationIssuePath(issue)
  const relativePath = issuePath.slice(copyPath(entry?.path).length)
  const rootField = relativePath[0]

  if (rootField === 'style') {
    return 'style'
  }

  if (rootField === 'responsive' || rootField === 'visibility') {
    return 'responsive'
  }

  if (entry?.kind === 'row-column' && rootField === 'width') {
    return 'layout'
  }

  if (entry?.kind === 'block' && entry?.type === 'row' && rootField === 'columns') {
    return 'layout'
  }

  if (['anchorId', 'editorLabel', 'hidden', 'id', 'type'].includes(rootField)) {
    return 'settings'
  }

  return 'content'
}
