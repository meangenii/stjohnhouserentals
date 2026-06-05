import { useEffect, useState } from 'react'
import { EditableText } from '../components/AdminInlinePageEdit'
import { ListingCard } from '../components/ListingCard'
import { getContentImageSrc } from '../lib/contentAssets'
import { listPropertySummaries } from '../lib/propertyRepository'
import { comparePropertyNames } from '../lib/propertySort'
import { useStructuredPageContent } from '../lib/useSiteContent'

function buildListingItem(property) {
  return {
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
      ).sort(comparePropertyNames)
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
          <EditableText as="p" label="Intro Eyebrow" path={['intro', 'eyebrow']} value={page.intro.eyebrow}>
            {page.intro.eyebrow}
          </EditableText>
          <EditableText as="h1" label="Page Title" multiline path={['title']} rows={2} value={page.title}>
            {page.title}
          </EditableText>
          <EditableText as="p" label="Intro Lead" multiline path={['intro', 'lead']} rows={4} value={page.intro.lead}>
            {page.intro.lead}
          </EditableText>
          <EditableText as="h2" label="Intro Title" multiline path={['intro', 'title']} rows={3} value={page.intro.title}>
            {page.intro.title}
          </EditableText>
          {page.intro.paragraphs.map((paragraph, index) => (
            <EditableText as="p" key={`${index}-${paragraph}`} label={`Intro Paragraph ${index + 1}`} multiline path={['intro', 'paragraphs', index]} rows={5} value={paragraph}>
              {paragraph}
            </EditableText>
          ))}
        </div>

        {state.status === 'error' ? <p className="admin-empty">{state.message}</p> : null}

        {state.status === 'loading' ? <p className="admin-empty">Loading house rentals...</p> : null}

        {state.status === 'ready' ? (
          <section className="snapshot-listings" aria-label={page.directory.title}>
              <div className="snapshot-listing-grid">
                {visibleProperties.map((property) => {
                  const listing = buildListingItem(property)
                  return (
                    <ListingCard
                      actionLabel={
                        <EditableText as="span" label="Listing Action Label" path={['directory', 'actionLabel']} value={page.directory.actionLabel}>
                          {page.directory.actionLabel}
                        </EditableText>
                      }
                      item={listing.item}
                      key={property.slug}
                    />
                  )
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
