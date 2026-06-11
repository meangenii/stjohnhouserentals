import { getAdminIdToken } from './adminAuth'
import { getJson } from './api'

let mediaLibraryPromise = null

function decodeValue(value) {
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

export function normalizeAdminMediaSearchValue(value) {
  return decodeValue(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeTimestampValue(value) {
  if (!value) {
    return ''
  }

  if (typeof value === 'string') {
    return value.trim()
  }

  if (typeof value?.toDate === 'function') {
    const date = value.toDate()
    return Number.isNaN(date.getTime()) ? '' : date.toISOString()
  }

  if (typeof value?.seconds === 'number') {
    return new Date(value.seconds * 1000).toISOString()
  }

  if (typeof value?._seconds === 'number') {
    return new Date(value._seconds * 1000).toISOString()
  }

  return ''
}

function getStorageFolderPath(storagePath) {
  const candidate = String(storagePath ?? '').trim()

  if (!candidate.includes('/')) {
    return ''
  }

  return candidate.slice(0, candidate.lastIndexOf('/'))
}

function humanizeFolderSegment(segment) {
  return decodeValue(segment)
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function buildMediaLibrary(rawEntries = [], rawFolders = [], { bucket = '', generatedAt = '' } = {}) {
  const entries = rawEntries
    .filter((entry) => entry?.managedUrl)
    .map((entry) => {
      const fileName = decodeValue(entry.fileName)
      const ownerKey = decodeValue(entry.ownerKey)
      const ownerName = decodeValue(entry.ownerName)
      const storagePath = decodeValue(entry.storagePath)
      const folderPath = getStorageFolderPath(storagePath)
      const managedUrl = String(entry.managedUrl ?? '').trim()
      const ownerType = String(entry.ownerType ?? '').trim()
      const bytes = Number(entry.bytes ?? 0) || 0
      const contentType = String(entry.contentType ?? '').trim()

      return {
        alt: decodeValue(entry.alt),
        bytes,
        contentType,
        id: String(entry.mediaId ?? storagePath ?? managedUrl).trim(),
        fileName,
        folderName: humanizeFolderSegment(folderPath.split('/').at(-1) ?? ''),
        folderPath,
        managedUrl,
        ownerKey,
        ownerName,
        ownerType,
        storagePath,
        title: decodeValue(entry.title),
        updatedAt: normalizeTimestampValue(entry.updatedAt ?? entry.migratedAt),
        searchText: normalizeAdminMediaSearchValue(
          [fileName, ownerKey, ownerName, ownerType, folderPath, storagePath, managedUrl, contentType].filter(Boolean).join(' '),
        ),
      }
    })
    .sort((left, right) => {
      const leftSortKey = [left.folderPath, left.ownerType, left.ownerName, left.ownerKey, left.fileName].join(' ')
      const rightSortKey = [right.folderPath, right.ownerType, right.ownerName, right.ownerKey, right.fileName].join(' ')
      return leftSortKey.localeCompare(rightSortKey)
    })
  const folderMap = new Map()
  const manualFolderMap = new Map(
    rawFolders
      .map((folder) => {
        const folderPath = String(folder?.path ?? '').trim()

        if (!folderPath) {
          return null
        }

        return {
          id: String(folder?.id ?? folderPath).trim(),
          name: decodeValue(folder?.name),
          parentPath: String(folder?.parentPath ?? '').trim(),
          path: folderPath,
        }
      })
      .filter(Boolean)
      .map((folder) => [folder.path, folder]),
  )

  entries.forEach((entry) => {
    const pathSegments = String(entry.folderPath ?? '')
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean)

    pathSegments.forEach((_, index) => {
      const path = pathSegments.slice(0, index + 1).join('/')
      const parentPath = index > 0 ? pathSegments.slice(0, index).join('/') : ''
      const folder =
        folderMap.get(path) ??
        {
          childPaths: new Set(),
          depth: index + 1,
          directItemCount: 0,
          itemCount: 0,
          ownerKeys: new Set(),
          ownerNames: new Set(),
          ownerTypes: new Set(),
          parentPath,
          path,
        }

      folder.itemCount += 1

      if (entry.ownerType) {
        folder.ownerTypes.add(entry.ownerType)
      }

      if (entry.ownerKey) {
        folder.ownerKeys.add(entry.ownerKey)
      }

      if (entry.ownerName) {
        folder.ownerNames.add(entry.ownerName)
      }

      if (index === pathSegments.length - 1) {
        folder.directItemCount += 1
      }

      folderMap.set(path, folder)

      if (parentPath) {
        const parentFolder =
          folderMap.get(parentPath) ??
          {
            childPaths: new Set(),
            depth: index,
            directItemCount: 0,
            itemCount: 0,
            ownerKeys: new Set(),
            ownerNames: new Set(),
            ownerTypes: new Set(),
            parentPath: index > 1 ? pathSegments.slice(0, index - 1).join('/') : '',
            path: parentPath,
          }

        parentFolder.childPaths.add(path)
        folderMap.set(parentPath, parentFolder)
      }
    })
  })

  manualFolderMap.forEach((manualFolder) => {
    const pathSegments = String(manualFolder.path ?? '')
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean)

    pathSegments.forEach((segment, index) => {
      const path = pathSegments.slice(0, index + 1).join('/')
      const parentPath = index > 0 ? pathSegments.slice(0, index).join('/') : ''
      const existingFolder =
        folderMap.get(path) ??
        {
          childPaths: new Set(),
          depth: index + 1,
          directItemCount: 0,
          itemCount: 0,
          ownerKeys: new Set(),
          ownerNames: new Set(),
          ownerTypes: new Set(),
          parentPath,
          path,
        }

      if (index === pathSegments.length - 1 && manualFolder.name) {
        existingFolder.manualName = manualFolder.name
      }

      folderMap.set(path, existingFolder)

      if (parentPath) {
        const parentFolder =
          folderMap.get(parentPath) ??
          {
            childPaths: new Set(),
            depth: index,
            directItemCount: 0,
            itemCount: 0,
            ownerKeys: new Set(),
            ownerNames: new Set(),
            ownerTypes: new Set(),
            parentPath: index > 1 ? pathSegments.slice(0, index - 1).join('/') : '',
            path: parentPath,
          }

        parentFolder.childPaths.add(path)
        folderMap.set(parentPath, parentFolder)
      }

      if (index < pathSegments.length - 1 && !manualFolderMap.has(path)) {
        manualFolderMap.set(path, {
          id: path,
          name: humanizeFolderSegment(segment),
          parentPath,
          path,
        })
      }
    })
  })

  const folders = Array.from(folderMap.values())
    .map((folder) => {
      const ownerName = folder.ownerNames.size === 1 ? Array.from(folder.ownerNames)[0] : ''
      const ownerKey = folder.ownerKeys.size === 1 ? Array.from(folder.ownerKeys)[0] : ''
      const manualFolder = manualFolderMap.get(folder.path)

      return {
        childFolderCount: folder.childPaths.size,
        depth: folder.depth,
        directItemCount: folder.directItemCount,
        itemCount: folder.itemCount,
        name: manualFolder?.name || folder.manualName || ownerName || humanizeFolderSegment(folder.path.split('/').at(-1) ?? ''),
        ownerKey,
        ownerName,
        ownerTypes: Array.from(folder.ownerTypes).sort((left, right) => left.localeCompare(right)),
        parentPath: folder.parentPath,
        path: folder.path,
        searchText: normalizeAdminMediaSearchValue(
          [folder.path, ownerName, ownerKey, ...folder.ownerTypes].filter(Boolean).join(' '),
        ),
      }
    })
    .sort((left, right) => left.path.localeCompare(right.path))
  const rootFolders = folders.filter((folder) => !folder.parentPath)
  const browserRootPath =
    rootFolders.length === 1 && rootFolders[0].path === 'media'
      ? 'media'
      : rootFolders.length === 1
        ? rootFolders[0].path
        : ''

  return {
    bucket,
    browserRootPath,
    entries,
    folders,
    generatedAt,
    ownerTypes: [...new Set(entries.map((entry) => entry.ownerType).filter(Boolean))],
  }
}

async function loadAdminMediaLibraryFromApi() {
  const authToken = await getAdminIdToken()

  if (!authToken) {
    throw new Error('Sign in to Firebase before opening the live media library.')
  }

  const payload = await getJson('/admin/media/library', { authToken })
  return buildMediaLibrary(payload?.entries ?? [], payload?.folders ?? [], {
    bucket: String(payload?.bucket ?? '').trim(),
    generatedAt: String(payload?.generatedAt ?? '').trim(),
  })
}

async function loadAdminMediaLibraryFromManifest() {
  const { mediaCatalog } = await import('../../shared/mediaCatalog.js')
  return buildMediaLibrary(Object.values(mediaCatalog?.itemsByLegacyKey ?? {}), [], {
    bucket: String(mediaCatalog?.bucket ?? '').trim(),
    generatedAt: String(mediaCatalog?.generatedAt ?? '').trim(),
  })
}

export function resetAdminMediaLibraryCache() {
  mediaLibraryPromise = null
}

export async function loadAdminMediaLibrary() {
  if (!mediaLibraryPromise) {
    mediaLibraryPromise = loadAdminMediaLibraryFromApi()
      .catch(async () => {
        return loadAdminMediaLibraryFromManifest()
      })
  }

  return mediaLibraryPromise
}
