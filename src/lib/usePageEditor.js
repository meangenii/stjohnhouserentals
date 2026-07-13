import { useContext } from 'react'
import { SiteContentPreviewContext } from './siteContentPreview'

export function usePageEditor() {
  const previewState = useContext(SiteContentPreviewContext)
  return previewState?.pageEditor ?? null
}

export function appendPathItem(pageEditor, path, currentArray, item) {
  pageEditor?.updatePath(path, (latestArray) => [...(Array.isArray(latestArray) ? latestArray : currentArray), item])
}

export function removePathItem(pageEditor, path, currentArray, index) {
  pageEditor?.updatePath(path, (latestArray) =>
    (Array.isArray(latestArray) ? latestArray : currentArray).filter((_, entryIndex) => entryIndex !== index),
  )
}
