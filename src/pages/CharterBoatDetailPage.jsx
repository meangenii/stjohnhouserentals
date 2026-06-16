import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { RichTextValue } from '../components/RichTextValue'
import { DEFAULT_SITE_DESCRIPTION, useDocumentMeta } from '../lib/documentMeta'
import { normalizeSiteHtml } from '../lib/normalizeSiteHtml'
import { getCharterBySlug } from '../lib/charterRepository'
import { buildRemoteImageUrl } from '../lib/remoteImage'

export function CharterBoatDetailPage() {
  const { slug = '' } = useParams()
  const [state, setState] = useState({ status: 'loading' })
  const charter = state.status === 'ready' ? state.charter : null
  const documentTitle =
    state.status === 'not-found'
      ? 'Charter Not Found'
      : state.status === 'error'
        ? 'Charter Unavailable'
        : charter?.pageTitle || charter?.name || 'Charter Boat'
  const documentDescription = charter?.shortDescription || DEFAULT_SITE_DESCRIPTION

  useDocumentMeta({ title: documentTitle, description: documentDescription, priority: 1 })

  useEffect(() => {
    let cancelled = false

    getCharterBySlug(slug)
      .then((charter) => {
        if (cancelled) {
          return
        }

        if (!charter) {
          setState({ status: 'not-found' })
          return
        }

        setState({ status: 'ready', charter })
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown charter load error',
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [slug])

  if (state.status === 'loading') {
    return (
      <section className="page-section property-page property-page--status">
        <h1>Loading charter...</h1>
      </section>
    )
  }

  if (state.status === 'error') {
    return (
      <section className="page-section property-page property-page--status">
        <h1>Charter unavailable</h1>
        <p>{state.message}</p>
      </section>
    )
  }

  if (state.status === 'not-found') {
    return (
      <section className="page-section property-page property-page--status">
        <h1>Charter not found</h1>
      </section>
    )
  }

  return (
    <article className="snapshot-page">
      <div className="snapshot-page-inner">
        {charter.heroImage?.url ? (
          <div className="detail-hero">
            <img
              alt={charter.heroImage.alt || charter.name}
              className="detail-hero-image"
              decoding="async"
              loading="eager"
              src={buildRemoteImageUrl(charter.heroImage, { width: 1400, height: 960, mode: 'fit' })}
            />
          </div>
        ) : null}

        {charter.contentHtml ? (
          <div className="snapshot-flow" dangerouslySetInnerHTML={{ __html: normalizeSiteHtml(charter.contentHtml) }} />
        ) : (
          <div className="snapshot-flow">
            <h1>{charter.name}</h1>
            {charter.shortDescription ? <RichTextValue as="p" value={charter.shortDescription} /> : null}
          </div>
        )}
      </div>
    </article>
  )
}
