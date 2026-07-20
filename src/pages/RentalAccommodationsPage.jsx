import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EditableBackgroundSection, EditableText } from '../components/AdminInlinePageEdit'
import { PageLoadingState } from '../components/PageLoadingState'
import { getAdminIdToken } from '../lib/adminAuth'
import { getContentImageSrc } from '../lib/contentAssets'
import {
  buildPropertyLocationOptions,
  getPropertyLocationFilterLabel,
  normalizePropertyLocationFilterValue,
} from '../lib/propertyLocationFilters'
import { listPropertySummaries } from '../lib/propertyRepository'
import { richTextValueToLines, richTextValueToPlainText } from '../lib/richTextValue'
import { useAdminSession } from '../lib/useAdminSession'
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
  {
    id: 'backup-power',
    label: 'Backup Power',
    matches(summaryText) {
      return /\b(?:backup|generator)\b/i.test(summaryText)
    },
  },
]

const AIR_CONDITIONING_FILTER_OPTIONS = [
  { value: 'bedroom', label: 'Bedroom' },
  { value: 'whole-house', label: 'Whole House' },
]

const AIR_CONDITIONING_FILTER_VALUES = new Set(AIR_CONDITIONING_FILTER_OPTIONS.map((option) => option.value))
const RENTAL_ACCOMMODATIONS_PATH = '/for-rent'

const BEDROOM_AIR_CONDITIONING_PATTERN =
  /\b(?:air[-\s]?condition(?:ed|ing)\s+bedrooms?|bedrooms?\s+(?:with\s+)?(?:air[-\s]?condition(?:ed|ing)|a\/c|ac)\b|(?:a\/c|ac)\s+bedrooms?)\b/i

const WHOLE_HOUSE_AIR_CONDITIONING_PATTERN =
  /\b(?:full\s+(?:air[-\s]?condition(?:ed|ing)|a\/c|ac)|whole\s+house\s+(?:air[-\s]?condition(?:ed|ing)|a\/c|ac)|air[-\s]?conditioning|air[-\s]?conditioned|a\/c|ac)\b/i

function getShortDescriptionLines(value) {
  return richTextValueToLines(value)
    .map((line) => richTextValueToPlainText(line))
    .filter(Boolean)
}

function getAmenityLines(value) {
  return richTextValueToLines(value)
    .map((line) => richTextValueToPlainText(line))
    .filter(Boolean)
}

function getAvailableBedroomCounts(property) {
  const primaryBedrooms = Number(property?.bedrooms) || 0
  const alternateBedroomCounts = Array.isArray(property?.alternateBedroomCounts) ? property.alternateBedroomCounts : []
  const rawCounts =
    Array.isArray(property?.availableBedroomCounts) && property.availableBedroomCounts.length > 0
      ? property.availableBedroomCounts
      : [primaryBedrooms, ...((property?.rentFewerRooms === true || alternateBedroomCounts.length > 0) ? alternateBedroomCounts : [])]

  return Array.from(
    new Set(rawCounts.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)),
  ).sort((left, right) => left - right)
}

function getAirConditioningType(lines = []) {
  if (lines.some((line) => BEDROOM_AIR_CONDITIONING_PATTERN.test(line))) {
    return 'bedroom'
  }

  if (lines.some((line) => WHOLE_HOUSE_AIR_CONDITIONING_PATTERN.test(line))) {
    return 'whole-house'
  }

  return ''
}

function normalizeAmenityFilterIds(values = []) {
  const valueSet = new Set(
    values
      .flatMap((value) => String(value ?? '').split(','))
      .map((value) => value.trim())
      .filter(Boolean),
  )

  return AMENITY_FILTERS.map((filter) => filter.id).filter((amenityId) => valueSet.has(amenityId))
}

function parseRentalFilterSearchParams(searchParams) {
  const roomCount = Number.parseInt(searchParams.get('rooms') ?? '', 10)
  const airConditioningType = searchParams.get('ac') ?? ''

  return {
    selectedRoomCount: Number.isInteger(roomCount) && roomCount > 0 ? roomCount : null,
    selectedAmenities: normalizeAmenityFilterIds([...searchParams.getAll('amenity'), searchParams.get('amenities') ?? '']),
    selectedAirConditioningType: AIR_CONDITIONING_FILTER_VALUES.has(airConditioningType) ? airConditioningType : '',
    selectedLocation: normalizePropertyLocationFilterValue(searchParams.get('location') ?? ''),
  }
}

function buildRentalFilterSearchParams({ selectedRoomCount, selectedAmenities, selectedAirConditioningType, selectedLocation }) {
  const nextSearchParams = new URLSearchParams()

  if (Number.isInteger(selectedRoomCount) && selectedRoomCount > 0) {
    nextSearchParams.set('rooms', String(selectedRoomCount))
  }

  const amenityIds = normalizeAmenityFilterIds(selectedAmenities)

  if (amenityIds.length > 0) {
    nextSearchParams.set('amenities', amenityIds.join(','))
  }

  if (AIR_CONDITIONING_FILTER_VALUES.has(selectedAirConditioningType)) {
    nextSearchParams.set('ac', selectedAirConditioningType)
  }

  const locationValue = normalizePropertyLocationFilterValue(selectedLocation)

  if (locationValue) {
    nextSearchParams.set('location', locationValue)
  }

  return nextSearchParams
}

function buildRentalAccommodationsReturnPath(filters) {
  const filterSearch = buildRentalFilterSearchParams(filters).toString()

  return filterSearch ? `${RENTAL_ACCOMMODATIONS_PATH}?${filterSearch}` : RENTAL_ACCOMMODATIONS_PATH
}

function buildCardFromProperty(property) {
  const summaryLines = getShortDescriptionLines(property.shortDescription)
  const amenityLines = getAmenityLines(property.amenitiesHtml)
  const searchableLines = [...summaryLines, ...amenityLines]
  const summaryText = searchableLines.join(' ').replace(/\s+/g, ' ').trim()
  const locationLabel = getPropertyLocationFilterLabel(property)

  return {
    slug: property.slug,
    name: property.name,
    path: property.path,
    active: property.active !== false,
    bedrooms: property.bedrooms,
    availableBedroomCounts: getAvailableBedroomCounts(property),
    imageUrl: getContentImageSrc(property.heroImage, { width: 640, height: 435 }),
    imageAlt: property.heroImage?.alt || property.name,
    summaryLines,
    summaryText,
    locationLabel,
    locationValue: normalizePropertyLocationFilterValue(locationLabel),
    amenityIds: AMENITY_FILTERS.filter((filter) => filter.matches(summaryText)).map((filter) => filter.id),
    airConditioningType: getAirConditioningType(searchableLines),
  }
}

function formatRoomFilterLabel(roomCount) {
  return `${roomCount} Room${roomCount === 1 ? '' : 's'}`
}

function RentalAccommodationCard({ card, propertyNavigationState }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const visibleSummaryLines = isExpanded ? card.summaryLines : card.summaryLines.slice(0, 3)

  return (
    <article className="rental-accommodations-card">
      <Link
        aria-label={card.name}
        className="rental-accommodations-card-media"
        state={propertyNavigationState}
        to={card.path}
      >
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
        {!card.active ? <span className="admin-chip admin-chip--warning rental-accommodations-card-badge">Hidden</span> : null}
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

        <Link className="rental-accommodations-card-action" state={propertyNavigationState} to={card.path}>
          Learn More
        </Link>
      </div>
    </article>
  )
}

export function RentalAccommodationsPage() {
  const page = useStructuredPageContent('rentalAccommodations')
  const { isAdmin, status: adminSessionStatus } = useAdminSession({ immediate: true })
  const [searchParams, setSearchParams] = useSearchParams()
  const currentFilterSearch = searchParams.toString()
  const activeRentalFilters = parseRentalFilterSearchParams(searchParams)
  const canonicalFilterSearch = buildRentalFilterSearchParams(activeRentalFilters).toString()
  const [summaryState, setSummaryState] = useState({ status: 'loading', properties: [] })
  const { selectedRoomCount, selectedAmenities, selectedAirConditioningType, selectedLocation } = activeRentalFilters
  const roomFilterId = 'rental-room-filter'
  const airConditioningFilterId = 'rental-air-conditioning-filter'
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
  const roomCountOptions = Array.from(
    new Set(
      allCards.flatMap((card) => card.availableBedroomCounts).filter((bedroomCount) => Number.isInteger(bedroomCount) && bedroomCount > 0),
    ),
  ).sort((left, right) => left - right)

  const locationOptions = buildPropertyLocationOptions(visibleProperties)
  const selectedLocationLabel = locationOptions.find((option) => option.value === selectedLocation)?.label ?? ''
  const hasActiveFilters = selectedRoomCount !== null || selectedAmenities.length > 0 || Boolean(selectedAirConditioningType) || Boolean(selectedLocation)
  const filtersDisabled = summaryState.status !== 'ready' || allCards.length === 0
  let cards = allCards

  if (hasActiveFilters) {
    cards = allCards.filter((card) => {
      if (selectedRoomCount !== null && !card.availableBedroomCounts.includes(selectedRoomCount)) {
        return false
      }

      if (selectedLocation && card.locationValue !== selectedLocation) {
        return false
      }

      if (selectedAirConditioningType && card.airConditioningType !== selectedAirConditioningType) {
        return false
      }

      return selectedAmenities.every((amenityId) => card.amenityIds.includes(amenityId))
    })
  }

  const filteredPropertyOrder = cards.map((card) => ({ slug: card.slug, name: card.name, path: card.path }))
  const propertyReturnPath = buildRentalAccommodationsReturnPath(activeRentalFilters)
  const propertyNavigationState = {
    filteredPropertyOrder,
    propertyReturnPath,
  }

  useEffect(() => {
    if (currentFilterSearch === canonicalFilterSearch) {
      return
    }

    setSearchParams(canonicalFilterSearch ? new URLSearchParams(canonicalFilterSearch) : {}, {
      preventScrollReset: true,
      replace: true,
    })
  }, [canonicalFilterSearch, currentFilterSearch, setSearchParams])

  useEffect(() => {
    let cancelled = false

    async function loadSummaries() {
      if (adminSessionStatus === 'loading') {
        setSummaryState({ status: 'loading', properties: [] })
        return
      }

      try {
        const authToken = isAdmin ? await getAdminIdToken() : ''
        const properties = await listPropertySummaries(authToken ? { authToken } : {})

        if (!cancelled) {
          setSummaryState({ status: 'ready', properties })
        }
      } catch {
        if (!cancelled) {
          setSummaryState({ status: 'error', properties: [] })
        }
      }
    }

    loadSummaries()

    return () => {
      cancelled = true
    }
  }, [adminSessionStatus, isAdmin])

  if (!page) {
    return <PageLoadingState />
  }

  const heroImageUrl = getContentImageSrc(page.hero.image, { width: 1920, height: 720 })

  function setRentalFilters(nextFilters) {
    const nextFilterSearch = buildRentalFilterSearchParams(nextFilters).toString()

    setSearchParams(nextFilterSearch ? new URLSearchParams(nextFilterSearch) : {}, {
      preventScrollReset: true,
      replace: true,
    })
  }

  function toggleAmenity(amenityId) {
    setRentalFilters(
      {
        ...activeRentalFilters,
        selectedAmenities: selectedAmenities.includes(amenityId)
          ? selectedAmenities.filter((currentAmenityId) => currentAmenityId !== amenityId)
          : [...selectedAmenities, amenityId],
      },
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
                        setRentalFilters({
                          ...activeRentalFilters,
                          selectedRoomCount: Number.isInteger(nextValue) ? nextValue : null,
                        })
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
                  <label className="visually-hidden" htmlFor={airConditioningFilterId}>
                    Filter rentals by air conditioning type
                  </label>
                  <div className="rental-accommodations-pill-select-shell rental-accommodations-pill-select-shell--air-conditioning">
                    <select
                      className="rental-accommodations-pill-select"
                      disabled={filtersDisabled}
                      id={airConditioningFilterId}
                      value={selectedAirConditioningType}
                      onChange={(event) =>
                        setRentalFilters({
                          ...activeRentalFilters,
                          selectedAirConditioningType: event.target.value,
                        })
                      }
                    >
                      <option value="">Air Conditioning</option>
                      {AIR_CONDITIONING_FILTER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
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
                      onChange={(event) =>
                        setRentalFilters({
                          ...activeRentalFilters,
                          selectedLocation: event.target.value,
                        })
                      }
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
                  <RentalAccommodationCard card={card} key={card.path} propertyNavigationState={propertyNavigationState} />
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
