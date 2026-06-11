import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { createAdminMediaFolder, uploadAdminMediaFile } from '../lib/adminMediaApi'
import { loadAdminMediaLibrary, normalizeAdminMediaSearchValue, resetAdminMediaLibraryCache } from '../lib/adminMediaLibrary'
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

function folderMatchesOwnerType(folder, ownerTypeFilter) {
  if (ownerTypeFilter === 'all') {
    return true
  }

  if (!Array.isArray(folder.ownerTypes) || folder.ownerTypes.length === 0) {
    return true
  }

  return folder.ownerTypes.includes(ownerTypeFilter)
}

function buildFolderTree(childFoldersByParent, parentPath, expandedFolderPaths, activePath, onOpenFolder, onToggleFolder) {
  const childFolders = childFoldersByParent.get(parentPath) ?? []

  return childFolders.map((folder) => {
    const isExpanded = expandedFolderPaths.has(folder.path)
    const isActive = folder.path === activePath
    const hasChildren = folder.childFolderCount > 0

    return (
      <div className="admin-media-tree-node" key={folder.path}>
        <div className={`admin-media-tree-row${isActive ? ' admin-media-tree-row--active' : ''}`.trim()}>
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
            {buildFolderTree(childFoldersByParent, folder.path, expandedFolderPaths, activePath, onOpenFolder, onToggleFolder)}
          </div>
        ) : null}
      </div>
    )
  })
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
  const [open, setOpen] = useState(defaultOpen || !showToggle)
  const [query, setQuery] = useState('')
  const [folderPathFilter, setFolderPathFilter] = useState('auto')
  const [ownerTypeFilter, setOwnerTypeFilter] = useState(preferredOwnerType || 'all')
  const [copyStatus, setCopyStatus] = useState('')
  const [actionFeedback, setActionFeedback] = useState('')
  const [actionStatus, setActionStatus] = useState('idle')
  const [showCreateFolderForm, setShowCreateFolderForm] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [selectedEntryId, setSelectedEntryId] = useState('')
  const [expandedFolderPaths, setExpandedFolderPaths] = useState(() => new Set())
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
  const deferredQuery = useDeferredValue(query)
  const isOpen = showToggle ? open : true
  const normalizedQuery = normalizeAdminMediaSearchValue(deferredQuery)
  const normalizedCurrentUrl = String(currentUrl ?? '').trim()
  const normalizedPreferredOwnerKey = normalizeAdminMediaSearchValue(preferredOwnerKey)
  const normalizedPreferredOwnerName = normalizeAdminMediaSearchValue(preferredOwnerName)
  const effectiveOwnerTypeFilter =
    ownerTypeFilter !== 'all' && !libraryState.ownerTypes.includes(ownerTypeFilter) ? 'all' : ownerTypeFilter
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

    if (preferredFolder && folderMatchesOwnerType(preferredFolder, effectiveOwnerTypeFilter)) {
      return preferredFolderPath
    }

    return libraryState.browserRootPath || ''
  }, [effectiveOwnerTypeFilter, folderIndex, libraryState.browserRootPath, preferredFolderPath])
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

    if (!folderMatchesOwnerType(folder, effectiveOwnerTypeFilter)) {
      return fallbackFolderPath
    }

    return folderPathFilter
  }, [effectiveOwnerTypeFilter, fallbackFolderPath, folderIndex, folderPathFilter, libraryState.folders.length])
  const currentFolder = effectiveFolderPathFilter ? folderIndex.get(effectiveFolderPathFilter) ?? null : null
  const folderBreadcrumbs = useMemo(
    () => buildFolderBreadcrumbs(folderIndex, effectiveFolderPathFilter, libraryState.browserRootPath),
    [effectiveFolderPathFilter, folderIndex, libraryState.browserRootPath],
  )
  const selectedFolderPath = effectiveFolderPathFilter || libraryState.browserRootPath || ''

  const treeFolders = useMemo(
    () => libraryState.folders.filter((folder) => folderMatchesOwnerType(folder, effectiveOwnerTypeFilter)),
    [effectiveOwnerTypeFilter, libraryState.folders],
  )
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

    loadAdminMediaLibrary()
      .then((library) => {
        if (cancelled) {
          return
        }

        setLibraryState({
          ...library,
          error: '',
          status: 'ready',
        })
      })
      .catch((error) => {
        if (!cancelled) {
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
  }, [isOpen, libraryState.status])
  const effectiveExpandedFolderPaths = useMemo(() => {
    const nextPaths = new Set(expandedFolderPaths)
    ;[libraryState.browserRootPath, effectiveFolderPathFilter, preferredFolderPath].forEach((folderPath) => {
      collectAncestorPaths(folderPath).forEach((ancestorPath) => {
        nextPaths.add(ancestorPath)
      })
    })
    return nextPaths
  }, [effectiveFolderPathFilter, expandedFolderPaths, libraryState.browserRootPath, preferredFolderPath])

  const queryTokens = useMemo(
    () => (normalizedQuery ? normalizedQuery.split(/\s+/).filter(Boolean) : []),
    [normalizedQuery],
  )
  const filteredFolders = useMemo(() => {
    const candidateFolders = treeFolders.filter((folder) => {
      if (!matchesPathOrDescendant(folder.path, effectiveFolderPathFilter)) {
        return false
      }

      if (folder.path === effectiveFolderPathFilter) {
        return false
      }

      if (queryTokens.length === 0) {
        return folder.parentPath === effectiveFolderPathFilter
      }

      return queryTokens.every((token) => folder.searchText.includes(token))
    })

    return candidateFolders.sort((left, right) => left.name.localeCompare(right.name) || left.path.localeCompare(right.path))
  }, [effectiveFolderPathFilter, queryTokens, treeFolders])
  const filteredEntries = useMemo(() => {
    if (libraryState.status !== 'ready') {
      return []
    }

    return libraryState.entries
      .filter((entry) => {
        if (effectiveOwnerTypeFilter !== 'all' && entry.ownerType !== effectiveOwnerTypeFilter) {
          return false
        }

        if (!matchesPathOrDescendant(entry.folderPath, effectiveFolderPathFilter)) {
          return false
        }

        if (queryTokens.length === 0) {
          return entry.folderPath === effectiveFolderPathFilter
        }

        return queryTokens.every((token) => entry.searchText.includes(token))
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
    effectiveOwnerTypeFilter,
    libraryState.entries,
    libraryState.status,
    normalizedCurrentUrl,
    normalizedPreferredOwnerKey,
    normalizedPreferredOwnerName,
    preferredOwnerType,
    queryTokens,
  ])
  const libraryStatusSummary = `${formatItemCountLabel(filteredFolders.length, 'folder')} | ${formatItemCountLabel(
    filteredEntries.length,
    'image',
  )}`

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

    if (nextFolderPath !== undefined) {
      setFolderPathFilter(nextFolderPath)
    }

    if (nextSelectedId) {
      setSelectedEntryId(nextSelectedId)
    }

    resetAdminMediaLibraryCache()
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

  function handleToggleOpen() {
    if (!showToggle) {
      return
    }

    const nextOpen = !open

    if (nextOpen && libraryState.status === 'idle') {
      setLibraryState((currentState) => ({ ...currentState, error: '', status: 'loading' }))
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

  async function handleUploadSelection(event) {
    const files = Array.from(event.target.files ?? []).filter((file) => file instanceof File)

    if (files.length === 0) {
      return
    }

    setActionFeedback('')
    setActionStatus('saving')

    try {
      const uploads = []

      for (const file of files) {
        const result = await uploadAdminMediaFile({
          file,
          folderPath: effectiveFolderPathFilter || libraryState.browserRootPath || 'media',
          ownerKey: preferredOwnerKey,
          ownerName: preferredOwnerName,
          ownerType: preferredOwnerType,
        })

        uploads.push(result?.media)
      }

      const firstUploadedMediaId = String(uploads[0]?.id ?? '').trim()

      setActionFeedback(
        files.length === 1 ? `Uploaded ${files[0].name}.` : `Uploaded ${files.length} images to the current folder.`,
      )
      setActionStatus('success')
      refreshLibrary({
        nextFolderPath: effectiveFolderPathFilter || libraryState.browserRootPath || 'media',
        nextSelectedId: firstUploadedMediaId,
      })
    } catch (error) {
      setActionFeedback(error instanceof Error ? error.message : 'Unable to upload the selected images.')
      setActionStatus('error')
    } finally {
      if (event.target) {
        event.target.value = ''
      }
    }
  }

  function handleSelectEntry(entry) {
    setSelectedEntryId(entry.id)
  }

  function handleUseEntry(entry) {
    if (!onSelect) {
      return
    }

    onSelect(entry.managedUrl, entry)
    setCopyStatus('')

    if (showToggle) {
      setOpen(false)
    }
  }

  const toolbarBusy = disabled || actionStatus === 'saving'

  return (
    <div className="admin-media-manager">
      {showToggle || normalizedCurrentUrl ? (
        <div className="admin-inline-actions">
          {showToggle ? (
            <button
              aria-expanded={open}
              className="button-link button-link--ghost admin-action"
              disabled={disabled}
              type="button"
              onClick={handleToggleOpen}
            >
              {open ? 'Hide media library' : 'Browse media library'}
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
        <p className={`admin-feedback admin-feedback--${actionStatus === 'error' ? 'error' : actionStatus === 'saving' ? 'saving' : 'idle'}`}>
          {actionFeedback}
        </p>
      ) : null}

      {isOpen ? (
        <section className="admin-media-manager-panel">
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
                disabled={toolbarBusy}
                type="button"
                onClick={() => refreshLibrary({ nextFolderPath: effectiveFolderPathFilter })}
              >
                Refresh
              </button>
              <button
                className="button-link button-link--ghost admin-action"
                disabled={toolbarBusy}
                type="button"
                onClick={() => setShowCreateFolderForm((currentValue) => !currentValue)}
              >
                {showCreateFolderForm ? 'Cancel folder' : 'New folder'}
              </button>
              <button
                className="button-link button-link--ghost admin-action"
                disabled={toolbarBusy}
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                Upload
              </button>
            </div>

            <label className="admin-field admin-media-field">
              <span>Type</span>
              <select value={effectiveOwnerTypeFilter} onChange={(event) => setOwnerTypeFilter(event.target.value)}>
                <option value="all">All media</option>
                {libraryState.ownerTypes.map((ownerType) => (
                  <option key={ownerType} value={ownerType}>
                    {humanizeOwnerType(ownerType)}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field admin-field--wide admin-media-field admin-media-field--search">
              <span>Search</span>
              <input
                placeholder="Search files, folders, or owner names"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <input ref={fileInputRef} accept="image/*" hidden multiple type="file" onChange={handleUploadSelection} />
          </div>

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
                  <button className="button-link button-link--ghost admin-action" disabled={toolbarBusy} type="submit">
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
                      handleOpenFolder,
                      handleToggleFolder,
                    )}
                  </div>
                </aside>

                <div className="admin-media-browser">
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
                    </div>
                  </div>

                  <div className="admin-media-list-shell">
                    <table className="admin-media-list">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Date Modified</th>
                          <th>Type</th>
                          <th>Size</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredFolders.map((folder) => (
                          <tr className="admin-media-list-row admin-media-list-row--folder" key={folder.path} onDoubleClick={() => handleOpenFolder(folder.path)}>
                            <td>
                              <button className="admin-media-list-name" type="button" onClick={() => handleOpenFolder(folder.path)}>
                                <span className="admin-media-list-icon admin-media-list-icon--folder" />
                                <span>{folder.name}</span>
                              </button>
                            </td>
                            <td></td>
                            <td>File folder</td>
                            <td>{formatItemCountLabel(folder.itemCount, 'item')}</td>
                          </tr>
                        ))}

                        {filteredEntries.map((entry) => {
                          const isSelected = entry.id === effectiveSelectedEntryId || entry.managedUrl === normalizedCurrentUrl

                          return (
                            <tr
                              className={`admin-media-list-row${isSelected ? ' admin-media-list-row--selected' : ''}`.trim()}
                              key={entry.id}
                              onClick={() => handleSelectEntry(entry)}
                              onDoubleClick={() => handleUseEntry(entry)}
                            >
                              <td>
                                <button className="admin-media-list-name admin-media-list-name--file" type="button" onClick={() => handleSelectEntry(entry)}>
                                  <img
                                    alt={entry.fileName || entry.ownerName || 'Managed media item'}
                                    className="admin-media-list-thumb"
                                    loading="lazy"
                                    src={buildRemoteImageUrl(entry.managedUrl, { width: 120, height: 90, mode: 'fit' }) || entry.managedUrl}
                                  />
                                  <span>{entry.fileName || 'Untitled image'}</span>
                                </button>
                              </td>
                              <td>{formatModifiedDate(entry.updatedAt)}</td>
                              <td>{entry.contentType ? entry.contentType.replace('image/', '').toUpperCase() : 'Image'}</td>
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
