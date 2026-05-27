import { useState } from 'react'
import { Link } from 'react-router-dom'
import { buildWixImageUrl } from '../lib/wixImage'
import { pageSnapshots } from '../content/siteSnapshot'

function cleanFact(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractFactsFromSummary(summary) {
  let remainingText = cleanFact(summary)
  const facts = []

  const orderedPatterns = [
    /Max\s+\d+\s+Guests?/i,
    /Studio(?:\s*&\s*Sleeping\s+Porch)?/i,
    /\d+(?:\.\d+)?\s+Bedrooms?(?:\s*\+\s*Loft)?/i,
    /\d+(?:\.\d+)?\s+Bedroom(?:\s*\+\s*Loft)?/i,
    /\d+(?:\.\d+)?\s+Baths?/i,
  ]

  orderedPatterns.forEach((pattern) => {
    const match = remainingText.match(pattern)

    if (!match) {
      return
    }

    facts.push(cleanFact(match[0]))
    remainingText = cleanFact(remainingText.replace(match[0], ' '))
  })

  ;['Pool', 'Hot Tub', 'Internet'].forEach((keyword) => {
    const pattern = new RegExp(`\\b${keyword.replace(' ', '\\s+')}\\b`, 'i')
    const match = remainingText.match(pattern)

    if (!match) {
      return
    }

    facts.push(cleanFact(match[0]))
    remainingText = cleanFact(remainingText.replace(match[0], ' '))
  })

  if (remainingText) {
    facts.push(remainingText)
  }

  return facts.filter(Boolean)
}

function buildCardFromProperty(property) {
  return {
    name: property.name,
    path: property.path,
    bedrooms: property.bedrooms,
    imageUrl: buildWixImageUrl(property.heroImage, { width: 640, height: 435 }),
    imageAlt: property.heroImage?.alt || property.name,
    facts: Array.isArray(property.facts) ? property.facts.filter(Boolean) : [],
  }
}

function buildFeaturedCard(listing) {
  return {
    name: listing.name,
    path: listing.path,
    bedrooms: null,
    imageUrl: buildWixImageUrl(listing.image, { width: 640, height: 435 }),
    imageAlt: listing.image?.alt || listing.name,
    facts: extractFactsFromSummary(listing.summary),
  }
}

function RentalAccommodationCard({ card }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const visibleFacts = isExpanded ? card.facts : card.facts.slice(0, 3)

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
          {visibleFacts.map((fact, index) => {
            const isCollapsedTail = !isExpanded && card.facts.length > 3 && index === visibleFacts.length - 1

            return <p key={`${card.name}-${fact}`}>{isCollapsedTail ? `${fact}...` : fact}</p>
          })}
        </div>

        {card.facts.length > 3 ? (
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

const propertySummaryCatalogUrl = '/livePropertySummaryCatalog.json'

export function RentalAccommodationsPage() {
  const page = pageSnapshots.rentalAccommodations
  const featuredListings = page.rentalListings ?? []
  const [summaryState, setSummaryState] = useState({ status: 'idle', properties: [] })
  const [bedroomInput, setBedroomInput] = useState('')
  const [submittedBedrooms, setSubmittedBedrooms] = useState(null)
  const [resultsMode, setResultsMode] = useState('featured')
  const featuredCards = featuredListings.map((listing) => buildFeaturedCard(listing))
  const allCards = summaryState.properties.map((property) => buildCardFromProperty(property))
  let cards = featuredCards

  if (resultsMode === 'all') {
    cards = allCards
  }

  if (resultsMode === 'filtered') {
    cards = allCards.filter((card) => card.bedrooms === submittedBedrooms)
  }

  const heroImageUrl = buildWixImageUrl(page.imageGallery?.[0], { width: 1920, height: 720 })
  const hasFilterResults = resultsMode === 'filtered'

  async function loadSummaries() {
    if (summaryState.status === 'ready') {
      return summaryState.properties
    }

    setSummaryState((currentState) =>
      currentState.status === 'ready' ? currentState : { status: 'loading', properties: currentState.properties },
    )

    try {
      const response = await fetch(propertySummaryCatalogUrl)

      if (!response.ok) {
        throw new Error(`Property summary request failed with status ${response.status}`)
      }

      const payload = await response.json()
      const properties = Array.isArray(payload?.properties) ? payload.properties : []

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
    const properties = await loadSummaries()

    if (Number.isInteger(nextBedrooms) && nextBedrooms > 0) {
      setSubmittedBedrooms(nextBedrooms)
      setResultsMode('filtered')
      return
    }

    if (!properties.length) {
      setResultsMode('featured')
      return
    }

    setSubmittedBedrooms(null)
    setResultsMode('all')
  }

  return (
    <article className="rental-accommodations-page">
      <section
        className="rental-accommodations-hero"
        style={heroImageUrl ? { backgroundImage: `linear-gradient(rgba(8, 23, 52, 0.12), rgba(8, 23, 52, 0.12)), url(${heroImageUrl})` } : undefined}
      >
        <div className="rental-accommodations-hero-inner">
          <h1>{page.h1}</h1>
        </div>
      </section>

      <section className="rental-accommodations-directory">
        <div className="rental-accommodations-directory-inner">
          <header className="rental-accommodations-directory-header">
            <h2>Available Properties</h2>

            <form className="rental-accommodations-filter-row" onSubmit={handleSubmit}>
              <input
                className="rental-accommodations-filter-input"
                inputMode="numeric"
                min="1"
                placeholder="Filter by number of bedrooms"
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
                View Available Rentals
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
                  : 'No rentals are available right now.'}
              </p>
            )
          ) : summaryState.status === 'error' ? (
            <p className="rental-accommodations-empty">Rental summaries are unavailable right now.</p>
          ) : (
            <div className="rental-accommodations-grid">
              {featuredCards.map((card) => (
                <RentalAccommodationCard card={card} key={card.path} />
              ))}
            </div>
          )}
        </div>
      </section>
    </article>
  )
}
