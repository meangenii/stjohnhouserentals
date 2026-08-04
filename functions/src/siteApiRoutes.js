function decodeDocumentId(value = '') {
  try {
    const decoded = decodeURIComponent(String(value ?? '').trim())
    return decoded && !/[\\/]/.test(decoded) ? decoded : ''
  } catch {
    return ''
  }
}

function matchDocumentId(path = '', pattern) {
  const match = String(path ?? '').match(pattern)

  if (!match) {
    return null
  }

  const documentId = decodeDocumentId(match[1])
  return documentId || null
}

function matchAdminStructuredPageDocumentPath(path = '') {
  return matchDocumentId(path, /^admin\/content\/pages\/([^/]+)\/?$/)
}

function matchAdminStructuredPagePublishPath(path = '') {
  return matchDocumentId(path, /^admin\/content\/pages\/([^/]+)\/publish\/?$/)
}

function matchAdminStructuredPageRevisionListPath(path = '') {
  return matchDocumentId(path, /^admin\/content\/pages\/([^/]+)\/revisions\/?$/)
}

module.exports = {
  matchAdminStructuredPageDocumentPath,
  matchAdminStructuredPagePublishPath,
  matchAdminStructuredPageRevisionListPath,
}
