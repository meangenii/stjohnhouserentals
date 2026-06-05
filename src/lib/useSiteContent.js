import { useContext, useEffect, useState } from 'react'
import { resolveContentAssets } from './contentAssets'
import {
  fetchSiteShellContent,
  fetchStructuredPageContent,
  getSiteContentSourceMode,
  readSiteShellContent,
  readStructuredPageContent,
} from './siteContentRepository'
import { SiteContentPreviewContext } from './siteContentPreview'

export function useSiteShellContent() {
  const previewState = useContext(SiteContentPreviewContext)
  const sourceMode = getSiteContentSourceMode()
  const localContent = readSiteShellContent()
  const [remoteState, setRemoteState] = useState(() => ({ sourceMode: 'local', content: null }))
  const previewContent = previewState?.siteShell ? resolveContentAssets(previewState.siteShell) : null

  useEffect(() => {
    let cancelled = false

    if (previewContent || sourceMode === 'local') {
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
  }, [previewContent, sourceMode])

  if (previewContent) {
    return previewContent
  }

  if (sourceMode !== 'local' && remoteState.sourceMode === sourceMode && remoteState.content) {
    return remoteState.content
  }

  return localContent
}

export function useStructuredPageContent(key) {
  const previewState = useContext(SiteContentPreviewContext)
  const sourceMode = getSiteContentSourceMode()
  const localContent = readStructuredPageContent(key)
  const [remoteState, setRemoteState] = useState(() => ({ cacheKey: '', content: null }))
  const cacheKey = `${sourceMode}:${key}`
  const previewContent = previewState?.pages?.[key] ? resolveContentAssets(previewState.pages[key]) : null

  useEffect(() => {
    let cancelled = false

    if (previewContent || sourceMode === 'local') {
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
  }, [cacheKey, key, previewContent, sourceMode])

  if (previewContent) {
    return previewContent
  }

  if (sourceMode !== 'local' && remoteState.cacheKey === cacheKey && remoteState.content) {
    return remoteState.content
  }

  return localContent
}
