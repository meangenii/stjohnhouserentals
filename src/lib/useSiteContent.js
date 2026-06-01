import { useEffect, useState } from 'react'
import {
  fetchSiteShellContent,
  fetchStructuredPageContent,
  getSiteContentSourceMode,
  readSiteShellContent,
  readStructuredPageContent,
} from './siteContentRepository'

export function useSiteShellContent() {
  const sourceMode = getSiteContentSourceMode()
  const localContent = readSiteShellContent()
  const [remoteState, setRemoteState] = useState(() => ({ sourceMode: 'local', content: null }))

  useEffect(() => {
    let cancelled = false

    if (sourceMode === 'local') {
      return undefined
    }

    fetchSiteShellContent()
      .then((nextContent) => {
        if (!cancelled && nextContent) {
          setRemoteState({ sourceMode, content: nextContent })
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [sourceMode])

  if (sourceMode !== 'local' && remoteState.sourceMode === sourceMode && remoteState.content) {
    return remoteState.content
  }

  return localContent
}

export function useStructuredPageContent(key) {
  const sourceMode = getSiteContentSourceMode()
  const localContent = readStructuredPageContent(key)
  const [remoteState, setRemoteState] = useState(() => ({ cacheKey: '', content: null }))
  const cacheKey = `${sourceMode}:${key}`

  useEffect(() => {
    let cancelled = false

    if (sourceMode === 'local') {
      return undefined
    }

    fetchStructuredPageContent(key)
      .then((nextContent) => {
        if (!cancelled && nextContent) {
          setRemoteState({ cacheKey, content: nextContent })
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [cacheKey, key, sourceMode])

  if (sourceMode !== 'local' && remoteState.cacheKey === cacheKey && remoteState.content) {
    return remoteState.content
  }

  return localContent
}
