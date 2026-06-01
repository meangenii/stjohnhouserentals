import { useEffect, useState } from 'react'
import { ListingCard } from '../components/ListingCard'
import { getContentImageSrc } from '../lib/contentAssets'
import { listPropertySummaries } from '../lib/propertyRepository'
import { useStructuredPageContent } from '../lib/useSiteContent'

function buildListingItem(property, actionLabel) {
  return {
    actionLabel,
    item: {
      name: property.name,
      path: property.path,
      rate: property.price,
      summary: property.shortDescription || property.facts.join(' | '),
      image: property.heroImage
        ? {
            url: getContentImageSrc(property.heroImage, { width: 720, height: 480, mode: 'fit' }),
            alt: property.heroImage.alt || property.name,
          }
        : null,
    },
  }
}

export function HouseRentalsPage() {
  const page = useStructuredPageContent('houseRentals')
  const [state, setState] = useState({ status: 'loading', properties: [] })
  const visibleProperties = Array.isArray(state.properties)
    ? state.properties.filter(
        (property) =>
          property &&
          typeof property.slug === 'string' &&
          typeof property.name === 'string' &&
          typeof property.path === 'string',
      )
    : []

  useEffect(() => {
    let cancelled = false

    listPropertySummaries()
      .then((properties) => {
        if (!cancelled) {
          setState({ status: 'ready', properties })
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            status: 'error',
            properties: [],
            message: error instanceof Error ? error.message : 'Unable to load rentals.',
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <article className="snapshot-page">
      <div className="snapshot-page-inner">
        <div className="snapshot-flow">
          <p>{page.intro.eyebrow}</p>
          <h1>{page.title}</h1>
          <p>{page.intro.lead}</p>
          <h2>{page.intro.title}</h2>
          {page.intro.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        {state.status === 'error' ? <p className="admin-empty">{state.message}</p> : null}

        {state.status === 'loading' ? <p className="admin-empty">Loading house rentals...</p> : null}

        {state.status === 'ready' ? (
          <section className="snapshot-listings" aria-label={page.directory.title}>
            <div className="snapshot-listing-grid">
              {visibleProperties.map((property) => {
                const listing = buildListingItem(property, page.directory.actionLabel)
                return <ListingCard actionLabel={listing.actionLabel} item={listing.item} key={property.slug} />
              })}
            </div>
          </section>
        ) : state.status === 'ready' ? (
          <p className="admin-empty">Property listings are unavailable right now.</p>
        ) : null}
      </div>
    </article>
  )
}
