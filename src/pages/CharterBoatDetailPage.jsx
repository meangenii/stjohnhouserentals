import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { normalizeSiteHtml } from '../lib/normalizeSiteHtml'
import { getCharterBySlug } from '../lib/charterRepository'
import { buildRemoteImageUrl } from '../lib/remoteImage'

export function CharterBoatDetailPage() {
  const { slug = '' } = useParams()
  const [state, setState] = useState({ status: 'loading' })

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

  const { charter } = state

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
            {charter.shortDescription ? <p>{charter.shortDescription}</p> : null}
          </div>
        )}
      </div>
    </article>
  )
}
