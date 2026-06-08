import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EditableBackgroundSection, EditableText } from '../components/AdminInlinePageEdit'
import { getContentImageSrc } from '../lib/contentAssets'
import { listPropertySummaries } from '../lib/propertyRepository'
import { useStructuredPageContent } from '../lib/useSiteContent'

function getShortDescriptionLines(value) {
  return String(value ?? '')
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function buildCardFromProperty(property) {
  return {
    name: property.name,
    path: property.path,
    bedrooms: property.bedrooms,
    imageUrl: getContentImageSrc(property.heroImage, { width: 640, height: 435 }),
    imageAlt: property.heroImage?.alt || property.name,
    summaryLines: getShortDescriptionLines(property.shortDescription),
  }
}

function RentalAccommodationCard({ card }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const visibleSummaryLines = isExpanded ? card.summaryLines : card.summaryLines.slice(0, 3)

  return (
    <article className="rental-accommodations-card">
      <Link aria-label={card.name} className="rental-accommodations-card-media" to={card.path}>
        {card.imageUrl ? (
          <img
            alt={card.imageAlt || card.name}
            className="rental-accommodations-card-image"
            decoding="async"
            loading="lazy"
            src={card.imageUrl}
          />
        ) : null}
      </Link>

      <div className="rental-accommodations-card-body">
        <h2>{card.name}</h2>
        <div aria-hidden="true" className="rental-accommodations-card-divider" />

        <div className="rental-accommodations-card-facts">
          {visibleSummaryLines.map((line, index) => {
            const isCollapsedTail = !isExpanded && card.summaryLines.length > 3 && index === visibleSummaryLines.length - 1

            return <p key={`${card.name}-${line}`}>{isCollapsedTail ? `${line}...` : line}</p>
          })}
        </div>

        {card.summaryLines.length > 3 ? (
          <button
            aria-expanded={isExpanded}
            className="rental-accommodations-card-toggle"
            type="button"
            onClick={() => setIsExpanded((currentValue) => !currentValue)}
          >
            {isExpanded ? 'Show Less' : 'Show More'}
          </button>
        ) : (
          <div className="rental-accommodations-card-toggle-spacer" aria-hidden="true" />
        )}

        <Link className="rental-accommodations-card-action" to={card.path}>
          Learn More
        </Link>
      </div>
    </article>
  )
}

export function RentalAccommodationsPage() {
  const page = useStructuredPageContent('rentalAccommodations')
  const [summaryState, setSummaryState] = useState({ status: 'loading', properties: [] })
  const [bedroomInput, setBedroomInput] = useState('')
  const [submittedBedrooms, setSubmittedBedrooms] = useState(null)
  const [resultsMode, setResultsMode] = useState('all')
  const visibleProperties = Array.isArray(summaryState.properties)
    ? summaryState.properties.filter(
        (property) =>
          property &&
          typeof property.slug === 'string' &&
          typeof property.name === 'string' &&
          typeof property.path === 'string',
      )
    : []
  const allCards = visibleProperties.map((property) => buildCardFromProperty(property))
  let cards = allCards

  if (resultsMode === 'filtered') {
    cards = allCards.filter((card) => card.bedrooms === submittedBedrooms)
  }

  const heroImageUrl = getContentImageSrc(page.hero.image, { width: 1920, height: 720 })
  const hasFilterResults = resultsMode === 'filtered'

  useEffect(() => {
    let cancelled = false

    listPropertySummaries()
      .then((properties) => {
        if (!cancelled) {
          setSummaryState({ status: 'ready', properties })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSummaryState({ status: 'error', properties: [] })
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  async function loadSummaries() {
    if (summaryState.status === 'ready') {
      return summaryState.properties
    }

    setSummaryState((currentState) =>
      currentState.status === 'ready' ? currentState : { status: 'loading', properties: currentState.properties },
    )

    try {
      const properties = await listPropertySummaries()
      setSummaryState({ status: 'ready', properties })
      return properties
    } catch {
      setSummaryState({ status: 'error', properties: [] })
      return []
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const nextBedrooms = Number.parseInt(bedroomInput, 10)
    await loadSummaries()

    if (Number.isInteger(nextBedrooms) && nextBedrooms > 0) {
      setSubmittedBedrooms(nextBedrooms)
      setResultsMode('filtered')
      return
    }

    setSubmittedBedrooms(null)
    setResultsMode('all')
  }

  return (
    <article className="rental-accommodations-page">
      <EditableBackgroundSection
        as="section"
        className="rental-accommodations-hero"
        image={page.hero.image}
        path={['hero', 'image']}
        style={heroImageUrl ? { backgroundImage: `linear-gradient(rgba(8, 23, 52, 0.12), rgba(8, 23, 52, 0.12)), url(${heroImageUrl})` } : undefined}
      >
        <div className="rental-accommodations-hero-inner">
          <EditableText as="h1" label="Hero Title" multiline path={['hero', 'title']} rows={3} value={page.hero.title}>
            {page.hero.title}
          </EditableText>
        </div>
      </EditableBackgroundSection>

      <section className="rental-accommodations-directory">
        <div className="rental-accommodations-directory-inner">
          <header className="rental-accommodations-directory-header">
            <EditableText as="h2" label="Directory Title" path={['directory', 'title']} value={page.directory.title}>
              {page.directory.title}
            </EditableText>

            <form className="rental-accommodations-filter-row" onSubmit={handleSubmit}>
              <input
                className="rental-accommodations-filter-input"
                inputMode="numeric"
                min="1"
                placeholder={page.directory.filterPlaceholder}
                step="1"
                type="number"
                value={bedroomInput}
                onChange={(event) => setBedroomInput(event.target.value)}
              />

              <button
                className="rental-accommodations-filter-button"
                disabled={summaryState.status === 'loading'}
                type="submit"
              >
                <EditableText as="span" label="Filter Button Text" path={['directory', 'filterActionLabel']} value={page.directory.filterActionLabel}>
                  {page.directory.filterActionLabel}
                </EditableText>
              </button>
            </form>
          </header>

          {summaryState.status === 'ready' ? (
            cards.length ? (
              <div className="rental-accommodations-grid">
                {cards.map((card) => (
                  <RentalAccommodationCard card={card} key={card.path} />
                ))}
              </div>
            ) : (
              <p className="rental-accommodations-empty">
                {hasFilterResults && submittedBedrooms
                  ? `No rentals matched ${submittedBedrooms} bedroom${submittedBedrooms === 1 ? '' : 's'}.`
                  : page.directory.emptyStateAll}
              </p>
            )
          ) : summaryState.status === 'loading' ? (
            <p className="rental-accommodations-empty">Loading rentals...</p>
          ) : summaryState.status === 'error' ? (
            <p className="rental-accommodations-empty">{page.directory.emptyStateUnavailable}</p>
          ) : null}
        </div>
      </section>
    </article>
  )
}
