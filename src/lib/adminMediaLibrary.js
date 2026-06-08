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

export async function loadAdminMediaLibrary() {
  if (!mediaLibraryPromise) {
    mediaLibraryPromise = import('../../shared/mediaCatalog.js').then(({ mediaCatalog }) => {
      const entries = Object.values(mediaCatalog?.itemsByLegacyKey ?? {})
        .filter((entry) => entry?.managedUrl)
        .map((entry) => {
          const fileName = decodeValue(entry.fileName)
          const ownerKey = decodeValue(entry.ownerKey)
          const ownerName = decodeValue(entry.ownerName)
          const storagePath = decodeValue(entry.storagePath)
          const folderPath = getStorageFolderPath(storagePath)
          const managedUrl = String(entry.managedUrl ?? '').trim()
          const ownerType = String(entry.ownerType ?? '').trim()

          return {
            id: String(entry.mediaId ?? storagePath ?? managedUrl).trim(),
            fileName,
            folderName: humanizeFolderSegment(folderPath.split('/').at(-1) ?? ''),
            folderPath,
            managedUrl,
            ownerKey,
            ownerName,
            ownerType,
            storagePath,
            searchText: normalizeAdminMediaSearchValue(
              [fileName, ownerKey, ownerName, ownerType, folderPath, storagePath, managedUrl].filter(Boolean).join(' '),
            ),
          }
        })
        .sort((left, right) => {
          const leftSortKey = [left.folderPath, left.ownerType, left.ownerName, left.ownerKey, left.fileName].join(' ')
          const rightSortKey = [right.folderPath, right.ownerType, right.ownerName, right.ownerKey, right.fileName].join(' ')
          return leftSortKey.localeCompare(rightSortKey)
        })
      const folderMap = new Map()

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

      const folders = Array.from(folderMap.values())
        .map((folder) => {
          const ownerName = folder.ownerNames.size === 1 ? Array.from(folder.ownerNames)[0] : ''
          const ownerKey = folder.ownerKeys.size === 1 ? Array.from(folder.ownerKeys)[0] : ''

          return {
            childFolderCount: folder.childPaths.size,
            depth: folder.depth,
            directItemCount: folder.directItemCount,
            itemCount: folder.itemCount,
            name: ownerName || humanizeFolderSegment(folder.path.split('/').at(-1) ?? ''),
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
        bucket: String(mediaCatalog?.bucket ?? '').trim(),
        browserRootPath,
        entries,
        folders,
        generatedAt: String(mediaCatalog?.generatedAt ?? '').trim(),
        ownerTypes: [...new Set(entries.map((entry) => entry.ownerType).filter(Boolean))],
      }
    })
  }

  return mediaLibraryPromise
}
