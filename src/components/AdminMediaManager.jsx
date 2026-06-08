import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { loadAdminMediaLibrary, normalizeAdminMediaSearchValue } from '../lib/adminMediaLibrary'
import { buildRemoteImageUrl } from '../lib/remoteImage'

const MAX_VISIBLE_MEDIA_ITEMS = 48

function humanizeOwnerType(ownerType) {
  return String(ownerType ?? '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function formatItemCountLabel(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function getFolderMatchScore(folder, normalizedPreferredFolderPath) {
  let score = 0

  if (normalizedPreferredFolderPath && folder.path === normalizedPreferredFolderPath) {
    score += 24
  }

  return score
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
      // Fall through to the legacy copy path.
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

export function AdminMediaManager({
  currentUrl = '',
  disabled = false,
  onClear,
  onSelect,
  preferredOwnerKey = '',
  preferredOwnerName = '',
  preferredOwnerType = '',
  title = 'Media Library',
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [folderPathFilter, setFolderPathFilter] = useState('auto')
  const [ownerTypeFilter, setOwnerTypeFilter] = useState(preferredOwnerType || 'all')
  const [copyStatus, setCopyStatus] = useState('')
  const [libraryState, setLibraryState] = useState({
    bucket: '',
    browserRootPath: '',
    entries: [],
    error: '',
    folders: [],
    generatedAt: '',
    ownerTypes: [],
    status: 'idle',
  })
  const deferredQuery = useDeferredValue(query)
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

    if (
      preferredFolder &&
      (effectiveOwnerTypeFilter === 'all' || preferredFolder.ownerTypes.includes(effectiveOwnerTypeFilter))
    ) {
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

    if (effectiveOwnerTypeFilter !== 'all' && !folder.ownerTypes.includes(effectiveOwnerTypeFilter)) {
      return fallbackFolderPath
    }

    return folderPathFilter
  }, [effectiveOwnerTypeFilter, fallbackFolderPath, folderIndex, folderPathFilter, libraryState.folders.length])
  const currentFolder = effectiveFolderPathFilter ? folderIndex.get(effectiveFolderPathFilter) ?? null : null
  const folderBreadcrumbs = useMemo(
    () => buildFolderBreadcrumbs(folderIndex, effectiveFolderPathFilter, libraryState.browserRootPath),
    [effectiveFolderPathFilter, folderIndex, libraryState.browserRootPath],
  )
  const visibleFolders = useMemo(() => {
    if (libraryState.status !== 'ready') {
      return []
    }

    return libraryState.folders
      .filter((folder) => folder.parentPath === effectiveFolderPathFilter)
      .filter((folder) => effectiveOwnerTypeFilter === 'all' || folder.ownerTypes.includes(effectiveOwnerTypeFilter))
      .sort((left, right) => {
        const rightScore = getFolderMatchScore(right, preferredFolderPath)
        const leftScore = getFolderMatchScore(left, preferredFolderPath)

        if (leftScore !== rightScore) {
          return rightScore - leftScore
        }

        return left.name.localeCompare(right.name) || left.path.localeCompare(right.path)
      })
  }, [
    effectiveFolderPathFilter,
    effectiveOwnerTypeFilter,
    libraryState.folders,
    libraryState.status,
    preferredFolderPath,
  ])

  useEffect(() => {
    if (!open || libraryState.status !== 'loading') {
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
  }, [libraryState.status, open])

  const filteredMedia = useMemo(() => {
    if (libraryState.status !== 'ready') {
      return { totalMatches: 0, visibleEntries: [] }
    }

    const queryTokens = normalizedQuery ? normalizedQuery.split(/\s+/).filter(Boolean) : []
    const filteredEntries = libraryState.entries
      .filter((entry) => {
        if (effectiveOwnerTypeFilter !== 'all' && entry.ownerType !== effectiveOwnerTypeFilter) {
          return false
        }

        if (
          effectiveFolderPathFilter &&
          entry.folderPath !== effectiveFolderPathFilter &&
          !entry.folderPath.startsWith(`${effectiveFolderPathFilter}/`)
        ) {
          return false
        }

        if (queryTokens.length === 0) {
          return true
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

        const leftSortKey = [left.ownerName, left.ownerKey, left.fileName].join(' ')
        const rightSortKey = [right.ownerName, right.ownerKey, right.fileName].join(' ')
        return leftSortKey.localeCompare(rightSortKey)
      })

    return {
      totalMatches: filteredEntries.length,
      visibleEntries: filteredEntries.slice(0, MAX_VISIBLE_MEDIA_ITEMS),
    }
  }, [
    libraryState.entries,
    libraryState.status,
    effectiveFolderPathFilter,
    normalizedCurrentUrl,
    normalizedPreferredOwnerKey,
    normalizedPreferredOwnerName,
    normalizedQuery,
    effectiveOwnerTypeFilter,
    preferredOwnerType,
  ])

  async function handleCopy(value) {
    const copied = await copyText(value)
    setCopyStatus(copied ? 'Copied URL.' : 'Unable to copy the URL.')
  }

  function handleSelect(entry) {
    onSelect(entry.managedUrl, entry)
    setCopyStatus('')
    setOpen(false)
  }

  function handleOpenFolder(folderPath) {
    setFolderPathFilter(folderPath || libraryState.browserRootPath || '')
  }

  function handleStepUpFolder() {
    if (!currentFolder) {
      return
    }

    setFolderPathFilter(currentFolder.parentPath || libraryState.browserRootPath || '')
  }

  function handleToggleOpen() {
    const nextOpen = !open

    if (nextOpen && libraryState.status === 'idle') {
      setLibraryState((currentState) => ({ ...currentState, status: 'loading', error: '' }))
    }

    setOpen(nextOpen)
  }

  return (
    <div className="admin-media-manager">
      <div className="admin-inline-actions">
        <button
          aria-expanded={open}
          className="button-link button-link--ghost admin-action"
          disabled={disabled}
          type="button"
          onClick={handleToggleOpen}
        >
          {open ? 'Hide media library' : 'Browse media library'}
        </button>
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

      {copyStatus ? <p className="admin-note">{copyStatus}</p> : null}

      {open ? (
        <section className="admin-media-manager-panel">
          <div className="admin-media-manager-header">
            <div>
              <h6>{title}</h6>
              <p>Browse managed Firebase Storage images by folder and insert a URL into this field.</p>
            </div>
            {libraryState.generatedAt ? (
              <span className="admin-media-manager-meta">Manifest updated {new Date(libraryState.generatedAt).toLocaleDateString()}</span>
            ) : null}
          </div>

          <div className="admin-media-manager-toolbar">
            <label className="admin-field admin-field--wide">
              <span>Search</span>
              <input
                placeholder="Search by file name, property, page, or storage path"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label className="admin-field">
              <span>Owner Type</span>
              <select value={effectiveOwnerTypeFilter} onChange={(event) => setOwnerTypeFilter(event.target.value)}>
                <option value="all">All media</option>
                {libraryState.ownerTypes.map((ownerType) => (
                  <option key={ownerType} value={ownerType}>
                    {humanizeOwnerType(ownerType)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {libraryState.status === 'loading' ? <p className="admin-empty">Loading the media library...</p> : null}
          {libraryState.status === 'error' ? <p className="admin-empty">{libraryState.error}</p> : null}

          {libraryState.status === 'ready' ? (
            <>
              <section className="admin-media-folder-browser">
                <div className="admin-media-folder-header">
                  <div className="admin-media-folder-breadcrumbs" aria-label="Media folder path">
                    {folderBreadcrumbs.map((breadcrumb) => {
                      const isActive = breadcrumb.path === effectiveFolderPathFilter

                      return (
                        <button
                          className={`button-link button-link--ghost admin-action${
                            isActive ? ' admin-media-folder-breadcrumb--active' : ''
                          }`.trim()}
                          key={breadcrumb.path || 'all-media'}
                          type="button"
                          onClick={() => handleOpenFolder(breadcrumb.path)}
                        >
                          {breadcrumb.label}
                        </button>
                      )
                    })}
                  </div>

                  <div className="admin-inline-actions">
                    {currentFolder?.parentPath ? (
                      <button className="button-link button-link--ghost admin-action" type="button" onClick={handleStepUpFolder}>
                        Up one folder
                      </button>
                    ) : null}
                    {effectiveFolderPathFilter ? (
                      <button className="button-link button-link--ghost admin-action" type="button" onClick={() => handleCopy(effectiveFolderPathFilter)}>
                        Copy folder path
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="admin-media-manager-summary">
                  <span>
                    {currentFolder
                      ? `${currentFolder.name} | ${formatItemCountLabel(currentFolder.itemCount, 'image')} | ${formatItemCountLabel(currentFolder.childFolderCount, 'subfolder')}`
                      : `All media | ${formatItemCountLabel(libraryState.entries.length, 'image')}`}
                  </span>
                  {effectiveFolderPathFilter ? <strong>{effectiveFolderPathFilter}</strong> : null}
                </div>

                {visibleFolders.length > 0 ? (
                  <div className="admin-media-folder-grid">
                    {visibleFolders.map((folder) => {
                      const isSuggested = preferredFolderPath && folder.path === preferredFolderPath

                      return (
                        <article className="admin-media-folder-card" key={folder.path}>
                          <div className="admin-media-card-topline">
                            <strong>{folder.name}</strong>
                            {isSuggested ? <span className="admin-chip">Suggested</span> : null}
                          </div>
                          <p>
                            {formatItemCountLabel(folder.itemCount, 'image')}
                            {folder.childFolderCount > 0 ? ` | ${formatItemCountLabel(folder.childFolderCount, 'subfolder')}` : ''}
                          </p>
                          <code className="admin-media-card-path">{folder.path}</code>
                          <div className="admin-inline-actions">
                            <button className="button-link button-link--ghost admin-action" type="button" onClick={() => handleOpenFolder(folder.path)}>
                              Open folder
                            </button>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                ) : (
                  <p className="admin-note">No subfolders in the current location.</p>
                )}
              </section>

              <div className="admin-media-manager-summary">
                <span>
                  Showing {filteredMedia.visibleEntries.length} of {filteredMedia.totalMatches} matching images
                </span>
                {libraryState.bucket ? <strong>{libraryState.bucket}</strong> : null}
              </div>

              {filteredMedia.visibleEntries.length > 0 ? (
                <div className="admin-media-manager-grid">
                  {filteredMedia.visibleEntries.map((entry) => {
                    const isSelected = entry.managedUrl === normalizedCurrentUrl

                    return (
                      <article className={`admin-media-card${isSelected ? ' admin-media-card--selected' : ''}`.trim()} key={entry.id}>
                        <div className="admin-media-card-preview">
                          <img
                            alt={entry.fileName || entry.ownerName || 'Managed media item'}
                            loading="lazy"
                            src={buildRemoteImageUrl(entry.managedUrl, { width: 560, height: 360, mode: 'fit' }) || entry.managedUrl}
                          />
                        </div>

                        <div className="admin-media-card-body">
                          <div className="admin-media-card-topline">
                            <strong>{entry.fileName || 'Untitled image'}</strong>
                            {isSelected ? <span className="admin-chip">Selected</span> : null}
                          </div>

                          <p>{entry.ownerName || entry.ownerKey || 'Unassigned media item'}</p>

                          <div className="admin-chip-row admin-chip-row--compact">
                            {entry.ownerType ? <span className="admin-chip">{humanizeOwnerType(entry.ownerType)}</span> : null}
                            {entry.ownerKey ? <span className="admin-chip">{entry.ownerKey}</span> : null}
                            {entry.folderName ? <span className="admin-chip">{entry.folderName}</span> : null}
                          </div>

                          <code className="admin-media-card-path">{entry.storagePath}</code>

                          <div className="admin-inline-actions">
                            <button className="button-link button-link--ghost admin-action" disabled={disabled} type="button" onClick={() => handleSelect(entry)}>
                              {isSelected ? 'Use again' : 'Use image'}
                            </button>
                            <button className="button-link button-link--ghost admin-action" type="button" onClick={() => handleCopy(entry.managedUrl)}>
                              Copy URL
                            </button>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              ) : (
                <p className="admin-empty">No media items matched the current search.</p>
              )}
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
