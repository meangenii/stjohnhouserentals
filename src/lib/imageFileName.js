function decodeFileNameSegment(value = '') {
  const candidate = String(value ?? '').trim()

  if (!candidate) {
    return ''
  }

  try {
    return decodeURIComponent(candidate)
  } catch {
    return candidate
  }
}

function getFileNameFromPath(value = '') {
  const candidate = String(value ?? '').trim()

  if (!candidate) {
    return ''
  }

  const withoutQuery = candidate.split(/[?#]/)[0] ?? ''
  const fileName = withoutQuery.split('/').filter(Boolean).pop() ?? ''

  return decodeFileNameSegment(fileName)
}

function getFileNameFromFirebaseUrl(value = '') {
  const candidate = String(value ?? '').trim()
  const encodedStoragePath = candidate.match(/\/o\/([^?]+)/)?.[1] ?? ''

  if (!encodedStoragePath) {
    return ''
  }

  return getFileNameFromPath(decodeFileNameSegment(encodedStoragePath))
}

export function getImageFileName(image = {}) {
  const directFileName = String(image?.fileName || image?.originalFileName || '').trim()

  if (directFileName) {
    return directFileName
  }

  return (
    getFileNameFromPath(image?.storagePath) ||
    getFileNameFromFirebaseUrl(image?.managedUrl ?? image?.url) ||
    getFileNameFromPath(image?.managedUrl ?? image?.url)
  )
}
