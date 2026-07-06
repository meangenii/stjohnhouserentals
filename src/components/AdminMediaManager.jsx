import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createAdminMediaFolder,
  deleteAdminMediaFile,
  deleteAdminMediaFiles,
  deleteAdminMediaFolder,
  moveAdminMediaFiles,
  uploadAdminMediaFile,
} from '../lib/adminMediaApi'
import { loadAdminMediaLibrary, normalizeAdminMediaSearchValue } from '../lib/adminMediaLibrary'
import { buildRemoteImageUrl } from '../lib/remoteImage'

function humanizeOwnerType(ownerType) {
  return String(ownerType ?? '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function formatItemCountLabel(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function formatBytes(value) {
  const bytes = Number(value ?? 0)

  if (!Number.isFinite(bytes) || bytes <= 0) {
    return ''
  }

  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function normalizeDimension(value) {
  const dimension = Number.parseInt(String(value ?? '').trim(), 10)

  return Number.isFinite(dimension) && dimension > 0 ? dimension : 0
}

function formatDimensions(value) {
  const width = normalizeDimension(value?.width)
  const height = normalizeDimension(value?.height)

  return width && height ? `${width} x ${height}` : ''
}

function formatModifiedDate(value) {
  const candidate = String(value ?? '').trim()

  if (!candidate) {
    return ''
  }

  const date = new Date(candidate)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleDateString()
}

function matchesPathOrDescendant(candidatePath, rootPath) {
  if (!rootPath) {
    return true
  }

  return candidatePath === rootPath || candidatePath.startsWith(`${rootPath}/`)
}

function collectAncestorPaths(folderPath) {
  const segments = String(folderPath ?? '').split('/').filter(Boolean)
  const paths = []

  for (let index = 0; index < segments.length; index += 1) {
    paths.push(segments.slice(0, index + 1).join('/'))
  }

  return paths
}

function getEntryMatchScore(entry, preferredOwnerKey, preferredOwnerName, preferredOwnerType, normalizedCurrentUrl) {
  let score = 0

  if (normalizedCurrentUrl && entry.managedUrl === normalizedCurrentUrl) {
    score += 40
  }

  if (preferredOwnerType && entry.ownerType === preferredOwnerType) {
    score += 12
  }

  if (preferredOwnerKey && entry.searchText.includes(preferredOwnerKey)) {
    score += 8
  }

  if (preferredOwnerName && entry.searchText.includes(preferredOwnerName)) {
    score += 8
  }

  return score
}

function getPreferredFolderPath(entries, preferredOwnerType, normalizedPreferredOwnerKey, normalizedPreferredOwnerName) {
  const preferredEntry = entries.find((entry) => {
    if (preferredOwnerType && entry.ownerType !== preferredOwnerType) {
      return false
    }

    if (normalizedPreferredOwnerKey && normalizeAdminMediaSearchValue(entry.ownerKey) === normalizedPreferredOwnerKey) {
      return true
    }

    if (normalizedPreferredOwnerName && normalizeAdminMediaSearchValue(entry.ownerName) === normalizedPreferredOwnerName) {
      return true
    }

    return false
  })

  return preferredEntry?.folderPath ?? ''
}

function buildFolderBreadcrumbs(folderIndex, folderPath, browserRootPath) {
  const breadcrumbs = [{ label: 'All media', path: browserRootPath || '' }]

  if (!folderPath || folderPath === browserRootPath) {
    return breadcrumbs
  }

  const rootDepth = browserRootPath ? browserRootPath.split('/').filter(Boolean).length : 0
  const pathSegments = folderPath.split('/').filter(Boolean)

  for (let index = Math.max(1, rootDepth + 1); index <= pathSegments.length; index += 1) {
    const path = pathSegments.slice(0, index).join('/')
    const folder = folderIndex.get(path)

    if (!folder || path === browserRootPath) {
      continue
    }

    breadcrumbs.push({
      label: folder.name,
      path,
    })
  }

  return breadcrumbs
}

async function copyText(value) {
  const candidate = String(value ?? '').trim()

  if (!candidate) {
    return false
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(candidate)
      return true
    } catch {
      // Fall back to the legacy copy path.
    }
  }

  if (typeof document === 'undefined') {
    return false
  }

  const input = document.createElement('textarea')
  input.value = candidate
  input.setAttribute('readonly', '')
  input.style.position = 'absolute'
  input.style.left = '-9999px'
  document.body.appendChild(input)
  input.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(input)
  }
}

function buildFolderTree(
  childFoldersByParent,
  parentPath,
  expandedFolderPaths,
  activePath,
  uploadHoverFolderPath,
  onOpenFolder,
  onToggleFolder,
  onFolderUploadDragEnter,
  onFolderUploadDragOver,
  onFolderUploadDragLeave,
  onFolderUploadDrop,
) {
  const childFolders = childFoldersByParent.get(parentPath) ?? []

  return childFolders.map((folder) => {
    const isExpanded = expandedFolderPaths.has(folder.path)
    const isActive = folder.path === activePath
    const hasChildren = folder.childFolderCount > 0
    const isDropActive = uploadHoverFolderPath === folder.path

    return (
      <div className="admin-media-tree-node" key={folder.path}>
        <div
          className={`admin-media-tree-row${isActive ? ' admin-media-tree-row--active' : ''}${
            isDropActive ? ' admin-media-tree-row--drop-active' : ''
          }`.trim()}
          onDragEnter={(event) => onFolderUploadDragEnter(event, folder.path)}
          onDragLeave={(event) => onFolderUploadDragLeave(event, folder.path)}
          onDragOver={(event) => onFolderUploadDragOver(event, folder.path)}
          onDrop={(event) => onFolderUploadDrop(event, folder.path)}
        >
          <button
            aria-label={isExpanded ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
            className="admin-media-tree-toggle"
            disabled={!hasChildren}
            type="button"
            onClick={() => onToggleFolder(folder.path)}
          >
            {hasChildren ? (isExpanded ? '-' : '+') : ''}
          </button>
          <button className="admin-media-tree-button" type="button" onClick={() => onOpenFolder(folder.path)}>
            <span className="admin-media-tree-name">
              <span className="admin-media-list-icon admin-media-list-icon--folder" />
              <span className="admin-media-tree-label">{folder.name}</span>
            </span>
          </button>
        </div>
        {hasChildren && isExpanded ? (
          <div className="admin-media-tree-children">
            {buildFolderTree(
              childFoldersByParent,
              folder.path,
              expandedFolderPaths,
              activePath,
              uploadHoverFolderPath,
              onOpenFolder,
              onToggleFolder,
              onFolderUploadDragEnter,
              onFolderUploadDragOver,
              onFolderUploadDragLeave,
              onFolderUploadDrop,
            )}
          </div>
        ) : null}
      </div>
    )
  })
}

function buildUploadFeedback(files, uploads) {
  const uploadCount = files.length
  const avifConversionCount = uploads.filter((upload) => upload?.wasConvertedToAvif).length

  if (uploadCount === 1) {
    if (avifConversionCount === 1) {
      return `Uploaded ${files[0].name} and converted it to AVIF.`
    }

    return `Uploaded ${files[0].name}.`
  }

  if (avifConversionCount > 0) {
    return `Uploaded ${uploadCount} images to the current folder and converted ${avifConversionCount} to AVIF.`
  }

  return `Uploaded ${uploadCount} images to the current folder.`
}

function getUploadFileLabel(file, index = 0) {
  return String(file?.name ?? '').trim() || `Image ${index + 1}`
}

function summarizeUploadFailures(failures = []) {
  const fileLabels = failures.map((failure) => String(failure?.fileName ?? '').trim()).filter(Boolean)

  if (fileLabels.length === 0) {
    return ''
  }

  if (fileLabels.length === 1) {
    return fileLabels[0]
  }

  if (fileLabels.length === 2) {
    return `${fileLabels[0]} and ${fileLabels[1]}`
  }

  return `${fileLabels.slice(0, 2).join(', ')}, and ${fileLabels.length - 2} more`
}

function buildUploadBatchFeedback(files, uploads, failures = []) {
  const attemptedCount = files.length
  const uploadCount = uploads.length
  const failureCount = failures.length
  const avifConversionCount = uploads.filter((upload) => upload?.wasConvertedToAvif).length

  if (failureCount === 0) {
    return buildUploadFeedback(files, uploads)
  }

  if (uploadCount === 0) {
    if (failureCount === 1) {
      return `Unable to upload ${failures[0]?.fileName || 'the selected image'}: ${failures[0]?.message || 'Unknown upload error'}.`
    }

    return `Unable to upload ${failureCount} images. First error: ${failures[0]?.message || 'Unknown upload error'}.`
  }

  let message = `Uploaded ${uploadCount} of ${attemptedCount} images`

  if (avifConversionCount > 0) {
    message += ` and converted ${avifConversionCount} to AVIF`
  }

  message += `. ${failureCount} failed`

  const failedFileSummary = summarizeUploadFailures(failures)

  if (failedFileSummary) {
    message += ` (${failedFileSummary})`
  }

  return `${message}.`
}

function buildUploadProgressMessage(progress) {
  const totalCount = Number(progress?.totalCount ?? 0)
  const completedCount = Number(progress?.completedCount ?? 0)
  const currentFileName = String(progress?.currentFileName ?? '').trim()

  if (totalCount <= 0) {
    return 'Uploading media...'
  }

  if (totalCount === 1) {
    return currentFileName ? `Uploading ${currentFileName}...` : 'Uploading 1 image...'
  }

  const currentIndex = Math.min(totalCount, Math.max(completedCount + 1, 1))
  return `Uploading image ${currentIndex} of ${totalCount}${currentFileName ? `: ${currentFileName}` : ''}...`
}

function isFileDragEvent(event) {
  return Array.from(event?.dataTransfer?.types ?? []).includes('Files')
}

function collectDraggedFiles(dataTransfer) {
  return Array.from(dataTransfer?.files ?? []).filter((file) => file instanceof File)
}

const MEDIA_SELECTION_DRAG_TYPE = 'application/x-genericcms-media-selection'

function isMediaSelectionDragEvent(event) {
  return Array.from(event?.dataTransfer?.types ?? []).includes(MEDIA_SELECTION_DRAG_TYPE)
}

function getDraggedMediaIds(dataTransfer) {
  const rawValue = String(dataTransfer?.getData?.(MEDIA_SELECTION_DRAG_TYPE) ?? '').trim()

  if (!rawValue) {
    return []
  }

  try {
    const parsedValue = JSON.parse(rawValue)
    return [...new Set((Array.isArray(parsedValue) ? parsedValue : []).map((value) => String(value ?? '').trim()).filter(Boolean))]
  } catch {
    return []
  }
}

function getLibraryDragKind(event) {
  if (isFileDragEvent(event)) {
    return 'upload'
  }

  if (isMediaSelectionDragEvent(event)) {
    return 'move'
  }

  return ''
}

export function AdminMediaManager({
  currentUrl = '',
  defaultOpen = false,
  disabled = false,
  onClear,
  onSelect,
  preferredOwnerKey = '',
  preferredOwnerName = '',
  preferredOwnerType = '',
  showToggle = true,
  title = 'Media Library',
}) {
  const fileInputRef = useRef(null)
  // Track nested dragenter/dragleave events so the upload highlight does not flicker across child elements.
  const uploadDragDepthRef = useRef(0)
  const shouldForceRefreshOnLoadRef = useRef(defaultOpen || !showToggle)
  const latestLibraryLoadIdRef = useRef(0)
  const [open, setOpen] = useState(defaultOpen || !showToggle)
  const [folderPathFilter, setFolderPathFilter] = useState('auto')
  const [copyStatus, setCopyStatus] = useState('')
  const [actionFeedback, setActionFeedback] = useState('')
  const [actionStatus, setActionStatus] = useState('idle')
  const [uploadProgress, setUploadProgress] = useState({
    active: false,
    completedCount: 0,
    currentFileName: '',
    folderPath: '',
    totalCount: 0,
  })
  const [showCreateFolderForm, setShowCreateFolderForm] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [selectedEntryId, setSelectedEntryId] = useState('')
  const [selectedEntryIds, setSelectedEntryIds] = useState([])
  const [expandedFolderPaths, setExpandedFolderPaths] = useState(() => new Set())
  const [isUploadDragActive, setIsUploadDragActive] = useState(false)
  const [uploadHoverFolderPath, setUploadHoverFolderPath] = useState('')
  const [measuredDimensionsById, setMeasuredDimensionsById] = useState({})
  const [libraryLoadVersion, setLibraryLoadVersion] = useState(0)
  const [libraryState, setLibraryState] = useState({
    bucket: '',
    browserRootPath: '',
    entries: [],
    error: '',
    folders: [],
    generatedAt: '',
    ownerTypes: [],
    status: defaultOpen || !showToggle ? 'loading' : 'idle',
  })
  const isOpen = showToggle ? open : true
  const normalizedCurrentUrl = String(currentUrl ?? '').trim()
  const normalizedPreferredOwnerKey = normalizeAdminMediaSearchValue(preferredOwnerKey)
  const normalizedPreferredOwnerName = normalizeAdminMediaSearchValue(preferredOwnerName)
  const folderIndex = useMemo(
    () => new Map(libraryState.folders.map((folder) => [folder.path, folder])),
    [libraryState.folders],
  )
  const preferredFolderPath = useMemo(
    () =>
      libraryState.status === 'ready'
        ? getPreferredFolderPath(
            libraryState.entries,
            preferredOwnerType,
            normalizedPreferredOwnerKey,
            normalizedPreferredOwnerName,
          )
        : '',
    [
      libraryState.entries,
      libraryState.status,
      normalizedPreferredOwnerKey,
      normalizedPreferredOwnerName,
      preferredOwnerType,
    ],
  )
  const fallbackFolderPath = useMemo(() => {
    const preferredFolder = preferredFolderPath ? folderIndex.get(preferredFolderPath) : null

    if (preferredFolder) {
      return preferredFolderPath
    }

    return libraryState.browserRootPath || ''
  }, [folderIndex, libraryState.browserRootPath, preferredFolderPath])
  const effectiveFolderPathFilter = useMemo(() => {
    if (!libraryState.folders.length) {
      return ''
    }

    if (folderPathFilter === 'auto') {
      return fallbackFolderPath
    }

    const folder = folderIndex.get(folderPathFilter)

    if (!folder) {
      return fallbackFolderPath
    }

    return folderPathFilter
  }, [fallbackFolderPath, folderIndex, folderPathFilter, libraryState.folders.length])
  const currentFolder = effectiveFolderPathFilter ? folderIndex.get(effectiveFolderPathFilter) ?? null : null
  const folderBreadcrumbs = useMemo(
    () => buildFolderBreadcrumbs(folderIndex, effectiveFolderPathFilter, libraryState.browserRootPath),
    [effectiveFolderPathFilter, folderIndex, libraryState.browserRootPath],
  )
  const selectedFolderPath = effectiveFolderPathFilter || libraryState.browserRootPath || ''
  const selectedEntryIdSet = useMemo(() => new Set(selectedEntryIds), [selectedEntryIds])

  const treeFolders = libraryState.folders
  const childFoldersByParent = useMemo(() => {
    const folderGroups = new Map()

    treeFolders.forEach((folder) => {
      const key = folder.parentPath || ''

      if (!folderGroups.has(key)) {
        folderGroups.set(key, [])
      }

      folderGroups.get(key).push(folder)
    })

    folderGroups.forEach((folders) => {
      folders.sort((left, right) => left.name.localeCompare(right.name) || left.path.localeCompare(right.path))
    })

    return folderGroups
  }, [treeFolders])

  useEffect(() => {
    if (!isOpen || libraryState.status !== 'loading') {
      return undefined
    }

    let cancelled = false
    const loadId = latestLibraryLoadIdRef.current + 1
    latestLibraryLoadIdRef.current = loadId
    const forceRefresh = shouldForceRefreshOnLoadRef.current
    shouldForceRefreshOnLoadRef.current = false

    loadAdminMediaLibrary({ forceRefresh })
      .then((library) => {
        if (cancelled || loadId !== latestLibraryLoadIdRef.current) {
          return
        }

        setLibraryState({
          ...library,
          error: '',
          status: 'ready',
        })
      })
      .catch((error) => {
        if (!cancelled && loadId === latestLibraryLoadIdRef.current) {
          setLibraryState({
            bucket: '',
            browserRootPath: '',
            entries: [],
            error: error instanceof Error ? error.message : 'Unable to load the media library.',
            folders: [],
            generatedAt: '',
            ownerTypes: [],
            status: 'error',
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, libraryLoadVersion, libraryState.status])
  const effectiveExpandedFolderPaths = useMemo(() => {
    const nextPaths = new Set(expandedFolderPaths)
    ;[libraryState.browserRootPath, effectiveFolderPathFilter, preferredFolderPath].forEach((folderPath) => {
      collectAncestorPaths(folderPath).forEach((ancestorPath) => {
        nextPaths.add(ancestorPath)
      })
    })
    return nextPaths
  }, [effectiveFolderPathFilter, expandedFolderPaths, libraryState.browserRootPath, preferredFolderPath])

  const filteredFolders = useMemo(() => {
    const candidateFolders = treeFolders.filter((folder) => {
      if (!matchesPathOrDescendant(folder.path, effectiveFolderPathFilter)) {
        return false
      }

      if (folder.path === effectiveFolderPathFilter) {
        return false
      }

      return folder.parentPath === effectiveFolderPathFilter
    })

    return candidateFolders.sort((left, right) => left.name.localeCompare(right.name) || left.path.localeCompare(right.path))
  }, [effectiveFolderPathFilter, treeFolders])
  const filteredEntries = useMemo(() => {
    if (libraryState.status !== 'ready') {
      return []
    }

    return libraryState.entries
      .filter((entry) => {
        if (!matchesPathOrDescendant(entry.folderPath, effectiveFolderPathFilter)) {
          return false
        }

        return entry.folderPath === effectiveFolderPathFilter
      })
      .sort((left, right) => {
        const rightScore = getEntryMatchScore(
          right,
          normalizedPreferredOwnerKey,
          normalizedPreferredOwnerName,
          preferredOwnerType,
          normalizedCurrentUrl,
        )
        const leftScore = getEntryMatchScore(
          left,
          normalizedPreferredOwnerKey,
          normalizedPreferredOwnerName,
          preferredOwnerType,
          normalizedCurrentUrl,
        )

        if (leftScore !== rightScore) {
          return rightScore - leftScore
        }

        return left.fileName.localeCompare(right.fileName) || left.storagePath.localeCompare(right.storagePath)
      })
  }, [
    effectiveFolderPathFilter,
    libraryState.entries,
    libraryState.status,
    normalizedCurrentUrl,
    normalizedPreferredOwnerKey,
    normalizedPreferredOwnerName,
    preferredOwnerType,
  ])
  const libraryStatusSummary = `${formatItemCountLabel(filteredFolders.length, 'folder')} | ${formatItemCountLabel(
    filteredEntries.length,
    'image',
  )}`
  const selectedEntries = useMemo(
    () => libraryState.entries.filter((entry) => selectedEntryIdSet.has(entry.id)),
    [libraryState.entries, selectedEntryIdSet],
  )
  const visibleSelectedEntries = useMemo(
    () => filteredEntries.filter((entry) => selectedEntryIdSet.has(entry.id)),
    [filteredEntries, selectedEntryIdSet],
  )
  const allVisibleEntriesSelected = filteredEntries.length > 0 && visibleSelectedEntries.length === filteredEntries.length
  const canMoveSelectedToCurrentFolder = selectedEntries.length > 0 && selectedEntries.some((entry) => entry.folderPath !== selectedFolderPath)

  const effectiveSelectedEntryId = useMemo(() => {
    if (libraryState.status !== 'ready') {
      return ''
    }

    const selectedByUrl = normalizedCurrentUrl
      ? libraryState.entries.find((entry) => entry.managedUrl === normalizedCurrentUrl)?.id ?? ''
      : ''
    const stillVisible = filteredEntries.find((entry) => entry.id === selectedEntryId)?.id ?? ''
    return selectedByUrl || stillVisible || filteredEntries[0]?.id || ''
  }, [filteredEntries, libraryState.entries, libraryState.status, normalizedCurrentUrl, selectedEntryId])

  const selectedEntry = useMemo(
    () => filteredEntries.find((entry) => entry.id === effectiveSelectedEntryId) ?? null,
    [effectiveSelectedEntryId, filteredEntries],
  )

  function refreshLibrary(options = {}) {
    const nextFolderPath = options.nextFolderPath
    const nextSelectedId = options.nextSelectedId ?? ''
    const nextSelectedEntryIds = Array.isArray(options.nextSelectedEntryIds)
      ? [...new Set(options.nextSelectedEntryIds.map((value) => String(value ?? '').trim()).filter(Boolean))]
      : null

    if (nextFolderPath !== undefined) {
      setFolderPathFilter(nextFolderPath)
    }

    setSelectedEntryId(nextSelectedId)

    if (nextSelectedEntryIds) {
      setSelectedEntryIds(nextSelectedEntryIds)
    }

    shouldForceRefreshOnLoadRef.current = true
    setLibraryLoadVersion((currentVersion) => currentVersion + 1)
    setLibraryState((currentState) => ({
      ...currentState,
      error: '',
      status: 'loading',
    }))
  }

  async function handleCopy(value) {
    const copied = await copyText(value)
    setCopyStatus(copied ? 'Copied.' : 'Unable to copy.')
  }

  useEffect(() => {
    if (libraryState.status !== 'ready') {
      return
    }

    const validEntryIds = new Set(libraryState.entries.map((entry) => entry.id))

    setSelectedEntryIds((currentIds) => {
      const nextIds = currentIds.filter((entryId) => validEntryIds.has(entryId))
      return nextIds.length === currentIds.length ? currentIds : nextIds
    })
  }, [libraryState.entries, libraryState.status])

  function handleToggleOpen() {
    if (!showToggle) {
      return
    }

    const nextOpen = !open

    if (nextOpen) {
      refreshLibrary()
    }

    setOpen(nextOpen)
  }

  function handleOpenFolder(folderPath) {
    setFolderPathFilter(folderPath || libraryState.browserRootPath || '')
  }

  function handleToggleFolder(folderPath) {
    setExpandedFolderPaths((currentPaths) => {
      const nextPaths = new Set(currentPaths)

      if (nextPaths.has(folderPath)) {
        nextPaths.delete(folderPath)
      } else {
        nextPaths.add(folderPath)
      }

      return nextPaths
    })
  }

  async function handleCreateFolderSubmit(event) {
    event.preventDefault()

    if (!newFolderName.trim()) {
      setActionFeedback('Enter a folder name before creating a folder.')
      setActionStatus('error')
      return
    }

    setActionFeedback('')
    setActionStatus('saving')

    try {
      const result = await createAdminMediaFolder({
        folderName: newFolderName,
        parentPath: effectiveFolderPathFilter || libraryState.browserRootPath || 'media',
      })

      const createdFolderPath = String(result?.folder?.path ?? '').trim()

      setExpandedFolderPaths((currentPaths) => {
        const nextPaths = new Set(currentPaths)
        collectAncestorPaths(createdFolderPath).forEach((folderPath) => nextPaths.add(folderPath))
        return nextPaths
      })
      setShowCreateFolderForm(false)
      setNewFolderName('')
      setActionFeedback(`Created folder: ${result?.folder?.name || 'New folder'}.`)
      setActionStatus('success')
      refreshLibrary({ nextFolderPath: createdFolderPath || effectiveFolderPathFilter })
    } catch (error) {
      setActionFeedback(error instanceof Error ? error.message : 'Unable to create the folder.')
      setActionStatus('error')
    }
  }

  function resetUploadDragState() {
    uploadDragDepthRef.current = 0
    setIsUploadDragActive(false)
    setUploadHoverFolderPath('')
  }

  function handleToggleEntrySelection(entryId, shouldSelect) {
    const normalizedEntryId = String(entryId ?? '').trim()

    if (!normalizedEntryId) {
      return
    }

    setSelectedEntryIds((currentIds) => {
      const nextIds = new Set(currentIds)

      if (shouldSelect) {
        nextIds.add(normalizedEntryId)
      } else {
        nextIds.delete(normalizedEntryId)
      }

      return Array.from(nextIds)
    })
  }

  function handleToggleSelectAllVisible() {
    const visibleEntryIds = filteredEntries.map((entry) => entry.id)

    if (!visibleEntryIds.length) {
      return
    }

    setSelectedEntryIds((currentIds) => {
      const nextIds = new Set(currentIds)

      if (visibleEntryIds.every((entryId) => nextIds.has(entryId))) {
        visibleEntryIds.forEach((entryId) => nextIds.delete(entryId))
      } else {
        visibleEntryIds.forEach((entryId) => nextIds.add(entryId))
      }

      return Array.from(nextIds)
    })
  }

  function handleClearSelectedEntries() {
    setSelectedEntryIds([])
  }

  async function uploadFiles(files, options = {}) {
    const showEmptyFeedback = options.showEmptyFeedback ?? true
    const targetFolderPath = String(options.folderPath ?? '').trim() || selectedFolderPath || libraryState.browserRootPath || 'media'

    if (files.length === 0) {
      if (showEmptyFeedback) {
        setActionFeedback('Drop or choose at least one image file to upload.')
        setActionStatus('error')
      }

      return
    }

    if (libraryState.status !== 'ready') {
      setActionFeedback('Wait for the current media library refresh to finish before uploading.')
      setActionStatus('error')
      return
    }

    setActionFeedback('')
    setActionStatus('saving')
    setUploadProgress({
      active: true,
      completedCount: 0,
      currentFileName: files[0]?.name ?? '',
      folderPath: targetFolderPath,
      totalCount: files.length,
    })

    try {
      const uploads = []
      const failures = []

      for (const [fileIndex, file] of files.entries()) {
        setUploadProgress((currentProgress) => ({
          ...currentProgress,
          completedCount: fileIndex,
          currentFileName: file.name,
        }))
        setActionFeedback(
          buildUploadProgressMessage({
            completedCount: fileIndex,
            currentFileName: file.name,
            totalCount: files.length,
          }),
        )

        try {
          const result = await uploadAdminMediaFile({
            file,
            folderPath: targetFolderPath,
            ownerKey: preferredOwnerKey,
            ownerName: preferredOwnerName,
            ownerType: preferredOwnerType,
          })

          uploads.push(result?.media)
        } catch (error) {
          failures.push({
            fileName: getUploadFileLabel(file, fileIndex),
            message: error instanceof Error ? error.message : 'Unknown upload error',
          })
        }
      }

      const firstUploadedMediaId = String(uploads[0]?.id ?? '').trim()

      setActionFeedback(buildUploadBatchFeedback(files, uploads, failures))

      if (uploads.length > 0) {
        setActionStatus(failures.length > 0 ? 'warning' : 'success')
        refreshLibrary({
          nextFolderPath: targetFolderPath,
          nextSelectedId: firstUploadedMediaId,
          nextSelectedEntryIds: [],
        })
      } else {
        setActionStatus('error')
      }
    } finally {
      setUploadProgress({
        active: false,
        completedCount: 0,
        currentFileName: '',
        folderPath: '',
        totalCount: 0,
      })
    }
  }

  async function handleUploadSelection(event) {
    const input = event.target
    const files = collectDraggedFiles(input?.files)

    if (files.length === 0) {
      return
    }

    try {
      await uploadFiles(files, { folderPath: selectedFolderPath, showEmptyFeedback: false })
    } finally {
      if (input) {
        input.value = ''
      }
    }
  }

  function handleUploadDropZoneClick() {
    if (libraryMutationBusy) {
      return
    }

    fileInputRef.current?.click()
  }

  function handleUploadDragEnter(event) {
    const dragKind = getLibraryDragKind(event)

    if (!dragKind) {
      return
    }

    event.preventDefault()
    uploadDragDepthRef.current += 1

    if (!libraryMutationBusy) {
      setIsUploadDragActive(true)
    }
  }

  function handleUploadDragOver(event) {
    const dragKind = getLibraryDragKind(event)

    if (!dragKind) {
      return
    }

    event.preventDefault()

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = libraryMutationBusy ? 'none' : dragKind === 'move' ? 'move' : 'copy'
    }

    if (!libraryMutationBusy) {
      setIsUploadDragActive(true)
    }
  }

  function handleUploadDragLeave(event) {
    if (!getLibraryDragKind(event)) {
      return
    }

    event.preventDefault()
    uploadDragDepthRef.current = Math.max(0, uploadDragDepthRef.current - 1)

    if (uploadDragDepthRef.current === 0) {
      setIsUploadDragActive(false)
      setUploadHoverFolderPath('')
    }
  }

  async function handleUploadDrop(event) {
    const dragKind = getLibraryDragKind(event)

    if (!dragKind) {
      return
    }

    event.preventDefault()

    try {
      if (dragKind === 'move') {
        await moveMediaSelectionToFolder(getDraggedMediaIds(event.dataTransfer), selectedFolderPath)
        return
      }

      const files = collectDraggedFiles(event.dataTransfer)
      await uploadFiles(files, { folderPath: selectedFolderPath })
    } finally {
      resetUploadDragState()
    }
  }

  function handleFolderUploadDragEnter(event, folderPath) {
    const dragKind = getLibraryDragKind(event)

    if (!dragKind) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = libraryMutationBusy ? 'none' : dragKind === 'move' ? 'move' : 'copy'
    }

    if (!libraryMutationBusy) {
      setIsUploadDragActive(true)
      setUploadHoverFolderPath(folderPath)
    }
  }

  function handleFolderUploadDragOver(event, folderPath) {
    const dragKind = getLibraryDragKind(event)

    if (!dragKind) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = libraryMutationBusy ? 'none' : dragKind === 'move' ? 'move' : 'copy'
    }

    if (!libraryMutationBusy) {
      setIsUploadDragActive(true)
      setUploadHoverFolderPath(folderPath)
    }
  }

  function handleFolderUploadDragLeave(event, folderPath) {
    if (!getLibraryDragKind(event)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    if (event.currentTarget?.contains(event.relatedTarget)) {
      return
    }

    setUploadHoverFolderPath((currentPath) => (currentPath === folderPath ? '' : currentPath))
  }

  async function handleFolderUploadDrop(event, folderPath) {
    const dragKind = getLibraryDragKind(event)

    if (!dragKind) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    try {
      if (dragKind === 'move') {
        await moveMediaSelectionToFolder(getDraggedMediaIds(event.dataTransfer), folderPath)
        return
      }

      const files = collectDraggedFiles(event.dataTransfer)
      await uploadFiles(files, { folderPath })
    } finally {
      resetUploadDragState()
    }
  }

  async function moveMediaSelectionToFolder(mediaIds, folderPath) {
    const normalizedMediaIds = [...new Set((Array.isArray(mediaIds) ? mediaIds : []).map((value) => String(value ?? '').trim()).filter(Boolean))]
    const targetFolderPath = String(folderPath ?? '').trim() || selectedFolderPath || libraryState.browserRootPath || 'media'
    const selectedEntriesToMove = libraryState.entries.filter((entry) => normalizedMediaIds.includes(entry.id))

    if (!normalizedMediaIds.length) {
      setActionFeedback('Choose at least one image before moving it.')
      setActionStatus('error')
      return
    }

    if (libraryState.status !== 'ready') {
      setActionFeedback('Wait for the current media library refresh to finish before moving images.')
      setActionStatus('error')
      return
    }

    if (selectedEntriesToMove.length === 0) {
      setActionFeedback('The selected images are no longer available in the media library.')
      setActionStatus('error')
      return
    }

    if (selectedEntriesToMove.every((entry) => entry.folderPath === targetFolderPath)) {
      setActionFeedback(`The selected images are already in ${targetFolderPath}.`)
      setActionStatus('error')
      return
    }

    setActionFeedback('')
    setActionStatus('saving')

    try {
      const result = await moveAdminMediaFiles({
        folderPath: targetFolderPath,
        mediaIds: normalizedMediaIds,
      })
      const moveResult = result?.result ?? {}
      const movedEntries = Array.isArray(moveResult.moved) ? moveResult.moved : []
      const skippedCount = Number(moveResult.skippedCount ?? 0) || 0
      const nextSelectedEntryIds = [...new Set([...normalizedMediaIds, ...movedEntries.map((entry) => entry.id)])]
      const firstMovedEntryId = String(nextSelectedEntryIds[0] ?? '').trim()

      setExpandedFolderPaths((currentPaths) => {
        const nextPaths = new Set(currentPaths)
        collectAncestorPaths(targetFolderPath).forEach((pathValue) => nextPaths.add(pathValue))
        return nextPaths
      })
      setActionFeedback(
        movedEntries.length > 0
          ? `Moved ${formatItemCountLabel(movedEntries.length, 'image')} to ${targetFolderPath}.${skippedCount ? ` ${skippedCount} already there.` : ''}`
          : `No images were moved.${skippedCount ? ` ${skippedCount} already there.` : ''}`,
      )
      setActionStatus('success')
      refreshLibrary({
        nextFolderPath: targetFolderPath,
        nextSelectedId: firstMovedEntryId,
        nextSelectedEntryIds,
      })
    } catch (error) {
      setActionFeedback(error instanceof Error ? error.message : 'Unable to move the selected images.')
      setActionStatus('error')
    }
  }

  async function handleDeleteEntry(entry) {
    if (!entry?.id) {
      return
    }

    const confirmationMessage = `Delete ${entry.fileName || 'this image'} from the media library? This removes the stored file.`

    if (!window.confirm(confirmationMessage)) {
      return
    }

    setActionFeedback('')
    setActionStatus('saving')

    try {
      await deleteAdminMediaFile(entry.id)

      if (entry.managedUrl === normalizedCurrentUrl) {
        onClear?.()
      }

      setActionFeedback(`Deleted ${entry.fileName || 'the selected image'}.`)
      setActionStatus('success')
      setSelectedEntryId('')
      setSelectedEntryIds((currentIds) => currentIds.filter((entryId) => entryId !== entry.id))
      refreshLibrary({
        nextFolderPath: effectiveFolderPathFilter || libraryState.browserRootPath || 'media',
        nextSelectedId: '',
        nextSelectedEntryIds: selectedEntryIds.filter((entryId) => entryId !== entry.id),
      })
    } catch (error) {
      setActionFeedback(error instanceof Error ? error.message : 'Unable to delete the selected image.')
      setActionStatus('error')
    }
  }

  async function handleDeleteSelectedEntries() {
    if (selectedEntries.length === 0) {
      return
    }

    const confirmationMessage = `Delete ${formatItemCountLabel(selectedEntries.length, 'selected image')} from the media library? This removes the stored files.`

    if (!window.confirm(confirmationMessage)) {
      return
    }

    setActionFeedback('')
    setActionStatus('saving')

    try {
      await deleteAdminMediaFiles(selectedEntries.map((entry) => entry.id))

      if (selectedEntries.some((entry) => entry.managedUrl === normalizedCurrentUrl)) {
        onClear?.()
      }

      setActionFeedback(`Deleted ${formatItemCountLabel(selectedEntries.length, 'image')}.`)
      setActionStatus('success')
      setSelectedEntryId('')
      refreshLibrary({
        nextFolderPath: effectiveFolderPathFilter || libraryState.browserRootPath || 'media',
        nextSelectedId: '',
        nextSelectedEntryIds: [],
      })
    } catch (error) {
      setActionFeedback(error instanceof Error ? error.message : 'Unable to delete the selected images.')
      setActionStatus('error')
    }
  }

  async function handleDeleteFolder(folder) {
    if (!folder?.path) {
      return
    }

    const confirmationMessage = `Delete the "${folder.name}" folder and everything inside it (${formatItemCountLabel(
      folder.itemCount,
      'item',
    )})? This cannot be undone.`

    if (!window.confirm(confirmationMessage)) {
      return
    }

    setActionFeedback('')
    setActionStatus('saving')

    try {
      await deleteAdminMediaFolder(folder.path)

      setActionFeedback(`Deleted the "${folder.name}" folder and its contents.`)
      setActionStatus('success')
      setSelectedEntryId('')
      setSelectedEntryIds([])
      refreshLibrary({
        nextFolderPath: folder.parentPath || libraryState.browserRootPath || '',
        nextSelectedId: '',
        nextSelectedEntryIds: [],
      })
    } catch (error) {
      setActionFeedback(error instanceof Error ? error.message : 'Unable to delete the selected folder.')
      setActionStatus('error')
    }
  }

  function handleSelectEntry(entry) {
    setSelectedEntryId(entry.id)
  }

  function handleEntryDragStart(event, entry) {
    if (!event.dataTransfer || libraryMutationBusy || !entry?.id) {
      return
    }

    const dragEntryIds = selectedEntryIdSet.has(entry.id) && selectedEntryIds.length > 0 ? selectedEntryIds : [entry.id]

    setSelectedEntryId(entry.id)
    setSelectedEntryIds(dragEntryIds)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(MEDIA_SELECTION_DRAG_TYPE, JSON.stringify(dragEntryIds))
    event.dataTransfer.setData('text/plain', `${dragEntryIds.length} media item${dragEntryIds.length === 1 ? '' : 's'}`)
  }

  function handleEntryDragEnd() {
    resetUploadDragState()
  }

  function getEntryDimensions(entry) {
    const measuredDimensions = measuredDimensionsById[entry?.id] ?? {}

    return {
      height: normalizeDimension(entry?.height) || normalizeDimension(measuredDimensions.height),
      width: normalizeDimension(entry?.width) || normalizeDimension(measuredDimensions.width),
    }
  }

  function getEntryWithDimensions(entry) {
    const dimensions = getEntryDimensions(entry)

    if (!dimensions.width || !dimensions.height) {
      return entry
    }

    return {
      ...entry,
      height: dimensions.height,
      width: dimensions.width,
    }
  }

  function handlePreviewImageLoad(entry, event) {
    if (!entry?.id || (normalizeDimension(entry.width) && normalizeDimension(entry.height))) {
      return
    }

    const width = normalizeDimension(event.currentTarget.naturalWidth)
    const height = normalizeDimension(event.currentTarget.naturalHeight)

    if (!width || !height) {
      return
    }

    setMeasuredDimensionsById((currentDimensions) => {
      const currentEntryDimensions = currentDimensions[entry.id]

      if (currentEntryDimensions?.width === width && currentEntryDimensions?.height === height) {
        return currentDimensions
      }

      return {
        ...currentDimensions,
        [entry.id]: { height, width },
      }
    })
  }

  function handleUseEntry(entry) {
    if (!onSelect) {
      return
    }

    onSelect(entry.managedUrl, getEntryWithDimensions(entry))
    setCopyStatus('')

    if (showToggle) {
      setOpen(false)
    }
  }

  const actionBusy = disabled || actionStatus === 'saving'
  const libraryMutationBusy = actionBusy || libraryState.status !== 'ready'

  return (
    <div className="admin-media-manager">
      {showToggle || normalizedCurrentUrl ? (
        <div className="admin-inline-actions">
          {showToggle ? (
            <button
              aria-expanded={open}
              className={`button-link ${onSelect ? 'button-link--secondary admin-media-picker-toggle' : 'button-link--ghost'} admin-action`}
              disabled={disabled}
              type="button"
              onClick={handleToggleOpen}
            >
              {open
                ? 'Close media library'
                : normalizedCurrentUrl
                  ? 'Replace image from media library'
                  : 'Choose image from media library'}
            </button>
          ) : null}
          {normalizedCurrentUrl ? (
            <>
              <a className="button-link button-link--ghost admin-action" href={normalizedCurrentUrl} rel="noreferrer" target="_blank">
                Open image
              </a>
              <button className="button-link button-link--ghost admin-action" type="button" onClick={() => handleCopy(normalizedCurrentUrl)}>
                Copy URL
              </button>
              {onClear ? (
                <button className="button-link button-link--ghost admin-action" disabled={disabled} type="button" onClick={onClear}>
                  Clear image
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {copyStatus ? <p className="admin-note">{copyStatus}</p> : null}
      {actionFeedback ? (
        <p
          className={`admin-feedback admin-feedback--${
            actionStatus === 'error' ? 'error' : actionStatus === 'saving' ? 'saving' : actionStatus === 'warning' ? 'warning' : 'idle'
          }`}
        >
          {actionFeedback}
        </p>
      ) : null}

      {isOpen ? (
        <section aria-busy={uploadProgress.active} className="admin-media-manager-panel">
          {uploadProgress.active ? (
            <div className="admin-media-upload-modal-shell" role="presentation">
              <div
                aria-label="Uploading media"
                aria-live="polite"
                aria-modal="true"
                className="admin-media-upload-modal"
                role="dialog"
              >
                <span aria-hidden="true" className="admin-media-upload-spinner" />
                <strong>Uploading media...</strong>
                <p>{buildUploadProgressMessage(uploadProgress)}</p>
                <p className="admin-media-upload-modal-detail">
                  Saving into <strong>{uploadProgress.folderPath || selectedFolderPath || libraryState.browserRootPath || 'media'}</strong>
                </p>
              </div>
            </div>
          ) : null}

          {title || libraryState.generatedAt ? (
            <div className="admin-media-manager-header">
              {title ? <h6>{title}</h6> : <span />}
              {libraryState.generatedAt ? (
                <span className="admin-media-manager-meta">Library updated {new Date(libraryState.generatedAt).toLocaleDateString()}</span>
              ) : null}
            </div>
          ) : null}

          <div className="admin-media-manager-toolbar admin-media-manager-toolbar--explorer">
            <div className="admin-inline-actions admin-media-toolbar-actions">
              <button
                className="button-link button-link--ghost admin-action"
                disabled={libraryMutationBusy}
                type="button"
                onClick={() => setShowCreateFolderForm((currentValue) => !currentValue)}
              >
                {showCreateFolderForm ? 'Cancel folder' : 'New folder'}
              </button>
              <button
                className="button-link button-link--ghost admin-action"
                disabled={libraryMutationBusy}
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                Upload
              </button>
            </div>
            <input
              ref={fileInputRef}
              accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.svg,.avif"
              disabled={libraryMutationBusy}
              hidden
              multiple
              type="file"
              onChange={handleUploadSelection}
            />
          </div>

          <button
            aria-disabled={libraryMutationBusy}
            className={`admin-media-dropzone${
              isUploadDragActive ? ' admin-media-dropzone--active' : ''
            }${libraryMutationBusy ? ' admin-media-dropzone--disabled' : ''}`.trim()}
            type="button"
            onDragEnter={handleUploadDragEnter}
            onDragLeave={handleUploadDragLeave}
            onDragOver={handleUploadDragOver}
            onDrop={handleUploadDrop}
            onClick={handleUploadDropZoneClick}
          >
            <strong>Drag and drop images to upload</strong>
            <span>
              {libraryMutationBusy
                ? 'Wait for the current media refresh or upload to finish before dropping files.'
                : `Drop files here or in the selected folder area to upload into ${selectedFolderPath || libraryState.browserRootPath || 'media'}, or click here to browse.`}
            </span>
          </button>

          {showCreateFolderForm ? (
            <form className="admin-media-create-folder" onSubmit={handleCreateFolderSubmit}>
              <label className="admin-field admin-field--wide admin-media-field">
                <span>Folder Name</span>
                <input
                  placeholder="Example: Beach House Gallery"
                  value={newFolderName}
                  onChange={(event) => setNewFolderName(event.target.value)}
                />
              </label>
              <div className="admin-media-create-folder-actions">
                <p className="admin-note admin-media-inline-note">
                  Create in <strong>{effectiveFolderPathFilter || libraryState.browserRootPath || 'media'}</strong>
                </p>
                <div className="admin-inline-actions">
                  <button className="button-link button-link--ghost admin-action" disabled={libraryMutationBusy} type="submit">
                    Create folder
                  </button>
                </div>
              </div>
            </form>
          ) : null}

          {libraryState.status === 'loading' ? <p className="admin-empty">Loading the media library...</p> : null}
          {libraryState.status === 'error' ? <p className="admin-empty">{libraryState.error}</p> : null}

          {libraryState.status === 'ready' ? (
            <>
              <div className="admin-media-explorer">
                <aside className="admin-media-sidebar">
                  <div className="admin-media-sidebar-header">
                    <strong>Folders</strong>
                    <button
                      className={`admin-media-tree-button admin-media-tree-button--root${
                        !effectiveFolderPathFilter || effectiveFolderPathFilter === libraryState.browserRootPath ? ' admin-media-tree-button--active' : ''
                      }`.trim()}
                      type="button"
                      onClick={() => handleOpenFolder(libraryState.browserRootPath || '')}
                    >
                      <span className="admin-media-tree-name">
                        <span className="admin-media-list-icon admin-media-list-icon--folder" />
                        <span className="admin-media-tree-label">All media</span>
                      </span>
                    </button>
                  </div>

                  <div className="admin-media-tree">
                    {buildFolderTree(
                      childFoldersByParent,
                      libraryState.browserRootPath || '',
                      effectiveExpandedFolderPaths,
                      effectiveFolderPathFilter,
                      uploadHoverFolderPath,
                      handleOpenFolder,
                      handleToggleFolder,
                      handleFolderUploadDragEnter,
                      handleFolderUploadDragOver,
                      handleFolderUploadDragLeave,
                      handleFolderUploadDrop,
                    )}
                  </div>
                </aside>

                <div
                  className={`admin-media-browser${isUploadDragActive ? ' admin-media-browser--drop-active' : ''}`.trim()}
                  onDragEnter={handleUploadDragEnter}
                  onDragLeave={handleUploadDragLeave}
                  onDragOver={handleUploadDragOver}
                  onDrop={handleUploadDrop}
                >
                  <div className="admin-media-folder-header">
                    <div className="admin-media-addressbar">
                      <span className="admin-media-addressbar-label">Address</span>
                      <div className="admin-media-folder-breadcrumbs admin-media-addressbar-path" aria-label="Media folder path">
                        {folderBreadcrumbs.map((breadcrumb) => {
                          const isActive = breadcrumb.path === effectiveFolderPathFilter

                          return (
                            <span className="admin-media-addressbar-step" key={breadcrumb.path || 'all-media'}>
                              <button
                                className={`admin-media-addressbar-segment${
                                  isActive ? ' admin-media-addressbar-segment--active' : ''
                                }`.trim()}
                                type="button"
                                onClick={() => handleOpenFolder(breadcrumb.path)}
                              >
                                {breadcrumb.label}
                              </button>
                            </span>
                          )
                        })}
                      </div>
                    </div>

                    <div className="admin-media-folder-meta">
                      <p className="admin-media-folder-status">
                        {libraryStatusSummary}
                        {currentFolder?.name ? ` | ${currentFolder.name}` : ''}
                        {libraryState.bucket ? ` | ${libraryState.bucket}` : ''}
                      </p>
                      {selectedFolderPath ? (
                        <button className="button-link button-link--ghost admin-action" type="button" onClick={() => handleCopy(selectedFolderPath)}>
                          Copy path
                        </button>
                      ) : null}
                      {currentFolder && currentFolder.path !== libraryState.browserRootPath ? (
                        <button
                          className="button-link button-link--ghost admin-action"
                          disabled={libraryMutationBusy}
                          type="button"
                          onClick={() => handleDeleteFolder(currentFolder)}
                        >
                          Delete folder
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {selectedEntries.length > 0 ? (
                    <div className="admin-media-bulk-actions">
                      <span className="admin-media-bulk-summary">{formatItemCountLabel(selectedEntries.length, 'image')} selected</span>
                      <div className="admin-inline-actions">
                        <button
                          className="button-link button-link--ghost admin-action"
                          disabled={libraryMutationBusy || !canMoveSelectedToCurrentFolder}
                          type="button"
                          onClick={() => moveMediaSelectionToFolder(selectedEntries.map((entry) => entry.id), selectedFolderPath)}
                        >
                          Move selected here
                        </button>
                        <button className="button-link button-link--ghost admin-action" disabled={libraryMutationBusy} type="button" onClick={handleDeleteSelectedEntries}>
                          Delete selected
                        </button>
                        <button className="button-link button-link--ghost admin-action" disabled={libraryMutationBusy} type="button" onClick={handleClearSelectedEntries}>
                          Clear selection
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <p className="admin-note admin-media-inline-note admin-media-browser-note">
                    Drag and drop images here to upload into <strong>{selectedFolderPath || libraryState.browserRootPath || 'media'}</strong>. You can also drag selected images onto any folder below to move them there.
                  </p>

                  <div className="admin-media-list-shell">
                    <table className="admin-media-list">
                      <thead>
                        <tr>
                          <th className="admin-media-list-select-cell">
                            <input
                              aria-label={allVisibleEntriesSelected ? 'Clear visible image selection' : 'Select all visible images'}
                              checked={allVisibleEntriesSelected}
                              disabled={filteredEntries.length === 0 || libraryMutationBusy}
                              type="checkbox"
                              onChange={handleToggleSelectAllVisible}
                            />
                          </th>
                          <th>Name</th>
                          <th>Date Modified</th>
                          <th>Type</th>
                          <th>Dimensions</th>
                          <th>Size</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredFolders.map((folder) => (
                          <tr
                            className={`admin-media-list-row admin-media-list-row--folder${
                              uploadHoverFolderPath === folder.path ? ' admin-media-list-row--drop-active' : ''
                            }`.trim()}
                            key={folder.path}
                            onDoubleClick={() => handleOpenFolder(folder.path)}
                            onDragEnter={(event) => handleFolderUploadDragEnter(event, folder.path)}
                            onDragLeave={(event) => handleFolderUploadDragLeave(event, folder.path)}
                            onDragOver={(event) => handleFolderUploadDragOver(event, folder.path)}
                            onDrop={(event) => handleFolderUploadDrop(event, folder.path)}
                          >
                            <td className="admin-media-list-select-cell"></td>
                            <td>
                              <div className="admin-media-list-cell admin-media-list-cell--folder">
                                <button className="admin-media-list-name" type="button" onClick={() => handleOpenFolder(folder.path)}>
                                  <span className="admin-media-list-icon admin-media-list-icon--folder" />
                                  <span>{folder.name}</span>
                                </button>
                                <button
                                  className="button-link button-link--ghost admin-media-list-inline-action"
                                  disabled={libraryMutationBusy}
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    handleDeleteFolder(folder)
                                  }}
                                  onDoubleClick={(event) => event.stopPropagation()}
                                >
                                  Delete folder
                                </button>
                              </div>
                            </td>
                            <td></td>
                            <td>File folder</td>
                            <td></td>
                            <td>{formatItemCountLabel(folder.itemCount, 'item')}</td>
                          </tr>
                        ))}

                        {filteredEntries.map((entry) => {
                          const isSelected = entry.id === effectiveSelectedEntryId || entry.managedUrl === normalizedCurrentUrl
                          const isBulkSelected = selectedEntryIdSet.has(entry.id)
                          const dimensionsLabel = formatDimensions(getEntryDimensions(entry))

                          return (
                            <tr
                              className={`admin-media-list-row${isSelected || isBulkSelected ? ' admin-media-list-row--selected' : ''}`.trim()}
                              draggable={!libraryMutationBusy}
                              key={entry.id}
                              onClick={() => handleSelectEntry(entry)}
                              onDragEnd={handleEntryDragEnd}
                              onDragStart={(event) => handleEntryDragStart(event, entry)}
                              onDoubleClick={() => handleUseEntry(entry)}
                            >
                              <td className="admin-media-list-select-cell">
                                <input
                                  aria-label={`Select ${entry.fileName || 'image'}`}
                                  checked={isBulkSelected}
                                  disabled={libraryMutationBusy}
                                  type="checkbox"
                                  onChange={(event) => handleToggleEntrySelection(entry.id, event.target.checked)}
                                  onClick={(event) => event.stopPropagation()}
                                  onDoubleClick={(event) => event.stopPropagation()}
                                />
                              </td>
                              <td>
                                <button className="admin-media-list-name admin-media-list-name--file" type="button" onClick={() => handleSelectEntry(entry)}>
                                  <img
                                    alt={entry.fileName || entry.ownerName || 'Managed media item'}
                                    className="admin-media-list-thumb"
                                    loading="lazy"
                                    onLoad={(event) => handlePreviewImageLoad(entry, event)}
                                    src={buildRemoteImageUrl(entry.managedUrl, { width: 120, height: 90, mode: 'fit' }) || entry.managedUrl}
                                  />
                                  <span>{entry.fileName || 'Untitled image'}</span>
                                </button>
                              </td>
                              <td>{formatModifiedDate(entry.updatedAt)}</td>
                              <td>{entry.contentType ? entry.contentType.replace('image/', '').toUpperCase() : 'Image'}</td>
                              <td>{dimensionsLabel || '--'}</td>
                              <td>{formatBytes(entry.bytes) || '--'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>

                    {filteredFolders.length === 0 && filteredEntries.length === 0 ? (
                      <p className="admin-empty">No folders or images matched the current view.</p>
                    ) : null}
                  </div>

                  {selectedEntry ? (
                    <section className="admin-media-details">
                      <div className="admin-media-details-thumb">
                        <img
                          alt={selectedEntry.fileName || selectedEntry.ownerName || 'Selected media item'}
                          loading="lazy"
                          onLoad={(event) => handlePreviewImageLoad(selectedEntry, event)}
                          src={buildRemoteImageUrl(selectedEntry.managedUrl, { width: 220, height: 160, mode: 'fit' }) || selectedEntry.managedUrl}
                        />
                      </div>
                      <div className="admin-media-details-copy">
                        <div className="admin-media-card-topline">
                          <strong>{selectedEntry.fileName || 'Untitled image'}</strong>
                          {selectedEntry.managedUrl === normalizedCurrentUrl ? <span className="admin-chip">Selected</span> : null}
                        </div>
                        <p className="admin-media-details-meta">
                          {selectedEntry.contentType ? selectedEntry.contentType.replace('image/', '').toUpperCase() : 'Image'}
                          {formatDimensions(getEntryDimensions(selectedEntry)) ? ` | ${formatDimensions(getEntryDimensions(selectedEntry))}` : ''}
                          {selectedEntry.bytes ? ` | ${formatBytes(selectedEntry.bytes)}` : ''}
                          {selectedEntry.updatedAt ? ` | ${formatModifiedDate(selectedEntry.updatedAt)}` : ''}
                        </p>
                        <p className="admin-media-details-meta">
                          {selectedEntry.ownerName || selectedEntry.ownerKey ? `Owner: ${selectedEntry.ownerName || selectedEntry.ownerKey}` : 'Owner: Unassigned'}
                          {selectedEntry.ownerType ? ` | ${humanizeOwnerType(selectedEntry.ownerType)}` : ''}
                          {selectedEntry.folderPath ? ` | Folder: ${selectedEntry.folderPath}` : ''}
                        </p>
                        <code className="admin-media-card-path">{selectedEntry.storagePath}</code>
                      </div>
                      <div className="admin-inline-actions admin-media-details-actions">
                        {onSelect ? (
                          <button className="button-link button-link--ghost admin-action" disabled={disabled} type="button" onClick={() => handleUseEntry(selectedEntry)}>
                            Use image
                          </button>
                        ) : null}
                        <a className="button-link button-link--ghost admin-action" href={selectedEntry.managedUrl} rel="noreferrer" target="_blank">
                          Open
                        </a>
                        <button className="button-link button-link--ghost admin-action" type="button" onClick={() => handleCopy(selectedEntry.managedUrl)}>
                          Copy URL
                        </button>
                        <button
                          className="button-link button-link--ghost admin-action"
                          disabled={libraryMutationBusy}
                          type="button"
                          onClick={() => handleDeleteEntry(selectedEntry)}
                        >
                          Delete image
                        </button>
                      </div>
                    </section>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
