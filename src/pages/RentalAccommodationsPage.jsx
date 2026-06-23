import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EditableBackgroundSection, EditableText } from '../components/AdminInlinePageEdit'
import { PageLoadingState } from '../components/PageLoadingState'
import { getContentImageSrc } from '../lib/contentAssets'
import { listPropertySummaries } from '../lib/propertyRepository'
import { richTextValueToLines, richTextValueToPlainText } from '../lib/richTextValue'
import { useStructuredPageContent } from '../lib/useSiteContent'

const AMENITY_FILTERS = [
  {
    id: 'pool',
    label: 'Pool',
    matches(summaryText) {
      return /\bpool\b/i.test(summaryText)
    },
  },
  {
    id: 'hot-tub',
    label: 'Hot Tub',
    matches(summaryText) {
      return /\bhot tubs?\b/i.test(summaryText)
    },
  },
  {
    id: 'internet',
    label: 'Internet',
    matches(summaryText) {
      return /\b(?:internet|wifi|wi-fi)\b/i.test(summaryText)
    },
  },
]

function getShortDescriptionLines(value) {
  return richTextValueToLines(value)
    .map((line) => richTextValueToPlainText(line))
    .filter(Boolean)
}

function normalizeLocationLabel(value) {
  return String(value ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/,.*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function looksLikeLocationLine(value) {
  const normalizedValue = String(value ?? '').trim()

  if (!normalizedValue) {
    return false
  }

  return !/\b(max|guests?|bed(?:room)?s?|baths?|pool|hot tub|internet|wifi|wi-fi|a\/c|air-conditioning|solar|battery|backup|washer|dryer|kid friendly|ocean view|air-conditioned|wireless|kitchen|living room|ceiling fans?|game room|outdoor kitchen|security system)\b/i.test(
    normalizedValue,
  )
}

function getLocationLabel(property) {
  const normalizedLocation = normalizeLocationLabel(property.location)

  if (normalizedLocation && looksLikeLocationLine(normalizedLocation)) {
    return normalizedLocation
  }

  const summaryLines = getShortDescriptionLines(property.shortDescription)
  const fallbackLine = [...summaryLines].reverse().find((line) => looksLikeLocationLine(line))

  return normalizeLocationLabel(fallbackLine)
}

function buildCardFromProperty(property) {
  const summaryLines = getShortDescriptionLines(property.shortDescription)
  const summaryText = summaryLines.join(' ').replace(/\s+/g, ' ').trim()
  const locationLabel = getLocationLabel(property)

  return {
    name: property.name,
    path: property.path,
    bedrooms: property.bedrooms,
    imageUrl: getContentImageSrc(property.heroImage, { width: 640, height: 435 }),
    imageAlt: property.heroImage?.alt || property.name,
    summaryLines,
    summaryText,
    locationLabel,
    locationValue: locationLabel.toLowerCase(),
    amenityIds: AMENITY_FILTERS.filter((filter) => filter.matches(summaryText)).map((filter) => filter.id),
  }
}

function formatRoomFilterLabel(roomCount) {
  return `${roomCount} Room${roomCount === 1 ? '' : 's'}`
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
  const [selectedRoomCount, setSelectedRoomCount] = useState(null)
  const [selectedAmenities, setSelectedAmenities] = useState([])
  const [selectedLocation, setSelectedLocation] = useState('')
  const roomFilterId = 'rental-room-filter'
  const locationFilterId = 'rental-location-filter'
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
  const locationOptionMap = new Map()
  const roomCountOptions = Array.from(
    new Set(
      allCards
        .map((card) => card.bedrooms)
        .filter((bedroomCount) => Number.isInteger(bedroomCount) && bedroomCount > 0),
    ),
  ).sort((left, right) => left - right)

  allCards.forEach((card) => {
    if (!card.locationLabel || locationOptionMap.has(card.locationValue)) {
      return
    }

    locationOptionMap.set(card.locationValue, {
      label: card.locationLabel,
      value: card.locationValue,
    })
  })

  const locationOptions = Array.from(locationOptionMap.values()).sort((left, right) => left.label.localeCompare(right.label))
  const selectedLocationLabel = locationOptions.find((option) => option.value === selectedLocation)?.label ?? ''
  const hasActiveFilters = selectedRoomCount !== null || selectedAmenities.length > 0 || Boolean(selectedLocation)
  const filtersDisabled = summaryState.status !== 'ready' || allCards.length === 0
  let cards = allCards

  if (hasActiveFilters) {
    cards = allCards.filter((card) => {
      if (selectedRoomCount !== null && card.bedrooms !== selectedRoomCount) {
        return false
      }

      if (selectedLocation && card.locationValue !== selectedLocation) {
        return false
      }

      return selectedAmenities.every((amenityId) => card.amenityIds.includes(amenityId))
    })
  }

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

  if (!page) {
    return <PageLoadingState />
  }

  const heroImageUrl = getContentImageSrc(page.hero.image, { width: 1920, height: 720 })

  function toggleAmenity(amenityId) {
    setSelectedAmenities((currentAmenities) =>
      currentAmenities.includes(amenityId)
        ? currentAmenities.filter((currentAmenityId) => currentAmenityId !== amenityId)
        : [...currentAmenities, amenityId],
    )
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

            <div aria-label="Filter rentals" className="rental-accommodations-filter-row" role="group">
              <div className="rental-accommodations-filter-group rental-accommodations-filter-group--pills">
                <div className="rental-accommodations-pill-list">
                  <label className="visually-hidden" htmlFor={roomFilterId}>
                    Filter rentals by number of rooms
                  </label>
                  <div className="rental-accommodations-pill-select-shell">
                    <select
                      className="rental-accommodations-pill-select"
                      disabled={filtersDisabled}
                      id={roomFilterId}
                      value={selectedRoomCount ?? ''}
                      onChange={(event) => {
                        const nextValue = Number.parseInt(event.target.value, 10)
                        setSelectedRoomCount(Number.isInteger(nextValue) ? nextValue : null)
                      }}
                    >
                      <option value="">All Rooms</option>
                      {roomCountOptions.map((roomCount) => (
                        <option key={roomCount} value={roomCount}>
                          {formatRoomFilterLabel(roomCount)}
                        </option>
                      ))}
                    </select>
                  </div>
                  {AMENITY_FILTERS.map((filter) => {
                    const isActive = selectedAmenities.includes(filter.id)

                    return (
                      <button
                        aria-pressed={isActive}
                        className={`rental-accommodations-pill${isActive ? ' rental-accommodations-pill--active' : ''}`}
                        disabled={filtersDisabled}
                        key={filter.id}
                        type="button"
                        onClick={() => toggleAmenity(filter.id)}
                      >
                        {filter.label}
                      </button>
                    )
                  })}
                  <label className="visually-hidden" htmlFor={locationFilterId}>
                    Filter rentals by location
                  </label>
                  <div className="rental-accommodations-pill-select-shell rental-accommodations-pill-select-shell--location">
                    <select
                      className="rental-accommodations-pill-select"
                      disabled={filtersDisabled}
                      id={locationFilterId}
                      value={selectedLocation}
                      onChange={(event) => setSelectedLocation(event.target.value)}
                    >
                      <option value="">All Locations</option>
                      {locationOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
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
                {hasActiveFilters
                  ? `No rentals matched the selected filters${selectedLocationLabel ? ` in ${selectedLocationLabel}` : ''}.`
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
