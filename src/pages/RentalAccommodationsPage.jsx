import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from '../lib/router'
import { EditableBackgroundSection, EditableText } from '../components/AdminInlinePageEdit'
import { PageLoadingState } from '../components/PageLoadingState'
import { getAdminIdToken } from '../lib/adminAuth'
import { getContentImageSrc } from '../lib/contentAssets'
import {
  buildPropertyLocationOptions,
  getPropertyLocationFilterLabel,
  normalizePropertyLocationFilterValue,
} from '../lib/propertyLocationFilters'
import { getPropertyContactActions } from '../lib/propertyContact'
import { listPropertySummaries } from '../lib/propertyRepository'
import { comparePropertyNames } from '../lib/propertySort'
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
  { value: 'bedroom', label: 'A/C (Bedrooms)' },
  { value: 'whole-house', label: 'A/C (Whole House)' },
]

const AIR_CONDITIONING_FILTER_VALUES = new Set(AIR_CONDITIONING_FILTER_OPTIONS.map((option) => option.value))
const RENTAL_ACCOMMODATIONS_PATH = '/'
const RENTAL_HERO_BOTTOM_PEEK_FALLBACK_PX = 78

const AIR_CONDITIONING_TERM_PATTERN = /\b(?:air[-\s]?condition(?:ed|ing)?|a\/c|ac)\b/i
const AIR_CONDITIONING_BEDROOM_CONTEXT_PATTERN = /\b(?:bedrooms?|brs?)\b/i
const AIR_CONDITIONING_WHOLE_HOUSE_CONTEXT_PATTERN =
  /(?:\b(?:full(?:y)?|whole\s+(?:house|home)|throughout|entire\s+(?:home|house)|every\s+room|all\s+rooms|common\s+areas|central)\b|100%)/i
const BEDROOM_AIR_CONDITIONING_LINES = new Set([
  'air conditioned bedrooms',
  'air conditioning bedrooms',
  'a/c bedroom',
  'a/c bedrooms',
  'ac bedroom',
  'ac bedrooms',
])
const WHOLE_HOUSE_AIR_CONDITIONING_LINES = new Set([
  'a/c',
  'ac',
  'air conditioned',
  'air conditioning',
  'a/c whole house',
  'ac whole house',
  'full a/c',
  'full ac',
  'whole house a/c',
  'whole house ac',
])

function isUnmodifiedPrimaryClick(event) {
  return event.button === 0 && !event.metaKey && !event.altKey && !event.ctrlKey && !event.shiftKey
}

function getPropertyReturnTargetId(slug = '') {
  const normalizedSlug = String(slug ?? '').trim()

  return normalizedSlug ? `rental-property-${normalizedSlug.replace(/[^a-z0-9_-]+/gi, '-')}` : ''
}

function normalizeAirConditioningLine(value = '') {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/[-\s]+/g, ' ')
    .trim()
    .toLowerCase()
}

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

function getAirConditioningType(summaryLines = [], amenityLines = []) {
  // The admin's explicit A/C toggle is written into shortDescription as a canonical
  // "A/C (Bedrooms)" / "A/C (Whole House)" line. That must win over generic amenity
  // text like a bare "Air conditioning" entry scraped into amenitiesHtml, which would
  // otherwise be misread as whole-house coverage.
  if (summaryLines.some((line) => matchesWholeHouseAirConditioning(line))) {
    return 'whole-house'
  }

  if (summaryLines.some((line) => matchesBedroomAirConditioning(line))) {
    return 'bedroom'
  }

  const fallbackLines = [...summaryLines, ...amenityLines]

  if (fallbackLines.some((line) => matchesWholeHouseAirConditioning(line))) {
    return 'whole-house'
  }

  if (fallbackLines.some((line) => matchesBedroomAirConditioning(line))) {
    return 'bedroom'
  }

  return ''
}

function matchesBedroomAirConditioning(line = '') {
  const sourceLine = String(line ?? '').trim()
  const normalizedLine = normalizeAirConditioningLine(sourceLine)

  return (
    BEDROOM_AIR_CONDITIONING_LINES.has(normalizedLine) ||
    (AIR_CONDITIONING_TERM_PATTERN.test(sourceLine) && AIR_CONDITIONING_BEDROOM_CONTEXT_PATTERN.test(sourceLine))
  )
}

function matchesWholeHouseAirConditioning(line = '') {
  const sourceLine = String(line ?? '').trim()
  const normalizedLine = normalizeAirConditioningLine(sourceLine)

  return (
    WHOLE_HOUSE_AIR_CONDITIONING_LINES.has(normalizedLine) ||
    (AIR_CONDITIONING_TERM_PATTERN.test(sourceLine) && AIR_CONDITIONING_WHOLE_HOUSE_CONTEXT_PATTERN.test(sourceLine))
  )
}

function matchesSelectedAirConditioningType(cardAirConditioningType, selectedAirConditioningType) {
  if (!selectedAirConditioningType) {
    return true
  }

  if (selectedAirConditioningType === 'bedroom') {
    return cardAirConditioningType === 'bedroom' || cardAirConditioningType === 'whole-house'
  }

  return cardAirConditioningType === selectedAirConditioningType
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

function getRentalHeroBottomPeek(filterBarElement) {
  const filterBarMarginTop = filterBarElement
    ? Number.parseFloat(window.getComputedStyle(filterBarElement).marginTop)
    : Number.NaN

  return Number.isFinite(filterBarMarginTop) && filterBarMarginTop < 0
    ? Math.abs(filterBarMarginTop)
    : RENTAL_HERO_BOTTOM_PEEK_FALLBACK_PX
}

function buildCardFromProperty(property) {
  const summaryLines = getShortDescriptionLines(property.shortDescription)
  const amenityLines = getAmenityLines(property.amenitiesHtml)
  const searchableLines = [...summaryLines, ...amenityLines]
  const summaryText = searchableLines.join(' ').replace(/\s+/g, ' ').trim()
  const locationLabel = getPropertyLocationFilterLabel(property)
  const emailContactActions = getPropertyContactActions(property).filter((action) => action.key === 'email')

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
    airConditioningType: getAirConditioningType(summaryLines, amenityLines),
    contactActions: emailContactActions,
  }
}

function formatRoomFilterLabel(roomCount) {
  return `${roomCount} Room${roomCount === 1 ? '' : 's'}`
}

function formatBedroomGroupLabel(bedroomCount) {
  return `${bedroomCount} Bedroom${bedroomCount === 1 ? '' : 's'}`
}

function buildBedroomGroups(cards) {
  const groups = new Map()

  cards.forEach((card) => {
    card.availableBedroomCounts.forEach((bedroomCount) => {
      if (!groups.has(bedroomCount)) {
        groups.set(bedroomCount, { bedrooms: bedroomCount, label: formatBedroomGroupLabel(bedroomCount), cards: [] })
      }

      groups.get(bedroomCount).cards.push(card)
    })
  })

  return Array.from(groups.values())
    .map((group) => ({ ...group, cards: [...group.cards].sort(comparePropertyNames) }))
    .sort((left, right) => left.bedrooms - right.bedrooms)
}

function isLocationSummaryLine(line = '') {
  return /^Location:\s*/i.test(String(line ?? '').trim())
}

function RentalAccommodationCard({ card, propertyNavigationState, onPropertyNavigate }) {
  const returnTargetId = getPropertyReturnTargetId(card.slug)
  const locationFactLines = card.summaryLines.filter((line) => isLocationSummaryLine(line))
  const standardFactLines = card.summaryLines.filter((line) => !isLocationSummaryLine(line))

  return (
    <article className="rental-accommodations-card" id={returnTargetId || undefined}>
      <Link
        aria-label={card.name}
        className="rental-accommodations-card-media"
        state={propertyNavigationState}
        to={card.path}
        onClick={(event) => onPropertyNavigate(event, card)}
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
        {!card.active ? <span className="admin-chip admin-chip--warning rental-accommodations-card-badge">Hidden</span> : null}
      </Link>

      <div className="rental-accommodations-card-body">
        <div className="rental-accommodations-card-heading">
          <h2>{card.name}</h2>

          {card.contactActions.length > 0 ? (
            <div className="rental-accommodations-card-contact-actions">
              {card.contactActions.map((action) => (
                <a
                  className="button-link rental-accommodations-card-action"
                  href={action.href}
                  key={action.key}
                  title={action.label}
                >
                  Contact
                </a>
              ))}
            </div>
          ) : null}
        </div>

        <div aria-hidden="true" className="rental-accommodations-card-divider" />

        <div className="rental-accommodations-card-facts">
          {standardFactLines.map((line, index) => (
            <p key={`${card.name}-fact-${index}-${line}`}>{line}</p>
          ))}
          {locationFactLines.map((line, index) => (
            <p className="rental-accommodations-card-fact--location" key={`${card.name}-location-${index}-${line}`}>
              {line}
            </p>
          ))}
        </div>
      </div>
    </article>
  )
}

export function RentalAccommodationsPage() {
  const page = useStructuredPageContent('rentalAccommodations')
  const { isAdmin, status: adminSessionStatus } = useAdminSession({ immediate: true })
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialRestoredScrollLocationKeyRef = useRef('')
  const targetRestoredScrollLocationKeyRef = useRef('')
  const pendingFilterScrollRef = useRef(false)
  const rentalResultsRef = useRef(null)
  const currentFilterSearch = searchParams.toString()
  const activeRentalFilters = parseRentalFilterSearchParams(searchParams)
  const canonicalFilterSearch = buildRentalFilterSearchParams(activeRentalFilters).toString()
  const [summaryState, setSummaryState] = useState({ status: 'loading', properties: [] })
  const [viewMode, setViewMode] = useState('pictures')
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

      if (!matchesSelectedAirConditioningType(card.airConditioningType, selectedAirConditioningType)) {
        return false
      }

      return selectedAmenities.every((amenityId) => card.amenityIds.includes(amenityId))
    })
  }

  const bedroomGroups = buildBedroomGroups(cards)
  const filteredPropertyOrder = cards.map((card) => ({ slug: card.slug, name: card.name, path: card.path }))
  const propertyReturnPath = buildRentalAccommodationsReturnPath(activeRentalFilters)
  const propertyNavigationState = {
    filteredPropertyOrder,
    propertyReturnPath,
  }
  const shouldRestorePropertyReturnPosition = location.state?.restorePropertyReturnPosition === true
  const propertyReturnScrollY = Number(location.state?.propertyReturnScrollY)
  const hasPropertyReturnScrollY = Number.isFinite(propertyReturnScrollY)
  const propertyReturnTargetId =
    typeof location.state?.propertyReturnTargetId === 'string' ? location.state.propertyReturnTargetId : ''
  const propertyReturnMinHeightStyle =
    shouldRestorePropertyReturnPosition && hasPropertyReturnScrollY && summaryState.status !== 'ready'
      ? { minHeight: `calc(${Math.max(0, Math.ceil(propertyReturnScrollY))}px + 100vh)` }
      : undefined

  function scrollRentalResultsBelowHero() {
    const heroElement = document.querySelector('.rental-accommodations-hero')
    const filterBarElement = document.querySelector('.rental-accommodations-hero-pills')
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (heroElement) {
      const heroBottom = heroElement.getBoundingClientRect().bottom + window.scrollY
      const targetTop = Math.max(0, Math.round(heroBottom - getRentalHeroBottomPeek(filterBarElement)))

      window.scrollTo({
        top: targetTop,
        left: 0,
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      })
      return
    }

    const targetElement = rentalResultsRef.current

    if (!targetElement) {
      return
    }

    targetElement.scrollIntoView({
      block: 'start',
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    })
  }

  function handlePropertyNavigation(event, card) {
    if (!isUnmodifiedPrimaryClick(event)) {
      return
    }

    const returnTargetId = getPropertyReturnTargetId(card?.slug)

    event.preventDefault()
    navigate(card.path, {
      state: {
        ...propertyNavigationState,
        propertyReturnScrollY: window.scrollY,
        ...(returnTargetId ? { propertyReturnTargetId: returnTargetId } : {}),
      },
    })
  }

  useLayoutEffect(() => {
    if (
      !shouldRestorePropertyReturnPosition ||
      !hasPropertyReturnScrollY ||
      initialRestoredScrollLocationKeyRef.current === location.key
    ) {
      return
    }

    initialRestoredScrollLocationKeyRef.current = location.key
    window.scrollTo({ top: Math.max(0, propertyReturnScrollY), left: 0, behavior: 'auto' })
  }, [hasPropertyReturnScrollY, location.key, propertyReturnScrollY, shouldRestorePropertyReturnPosition])

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
    if (!pendingFilterScrollRef.current && location.state?.rentalFilterScrollTarget !== true) {
      return undefined
    }

    pendingFilterScrollRef.current = false

    const frameId = window.requestAnimationFrame(() => {
      scrollRentalResultsBelowHero()
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [currentFilterSearch, location.state])

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

  useEffect(() => {
    if (
      !shouldRestorePropertyReturnPosition ||
      summaryState.status !== 'ready' ||
      targetRestoredScrollLocationKeyRef.current === location.key ||
      (!propertyReturnTargetId && !hasPropertyReturnScrollY)
    ) {
      return
    }

    targetRestoredScrollLocationKeyRef.current = location.key

    window.requestAnimationFrame(() => {
      const targetElement = propertyReturnTargetId ? document.getElementById(propertyReturnTargetId) : null

      if (targetElement) {
        targetElement.scrollIntoView({ block: 'nearest', behavior: 'auto' })
        return
      }

      if (hasPropertyReturnScrollY) {
        window.scrollTo({ top: Math.max(0, propertyReturnScrollY), left: 0, behavior: 'auto' })
      }
    })
  }, [
    cards.length,
    hasPropertyReturnScrollY,
    location.key,
    propertyReturnScrollY,
    propertyReturnTargetId,
    shouldRestorePropertyReturnPosition,
    summaryState.status,
  ])

  if (!page) {
    return <PageLoadingState />
  }

  const heroImageUrl = getContentImageSrc(page.hero.image, { width: 1920, height: 720 })

  function setRentalFilters(nextFilters) {
    const nextFilterSearch = buildRentalFilterSearchParams(nextFilters).toString()

    pendingFilterScrollRef.current = true

    setSearchParams(nextFilterSearch ? new URLSearchParams(nextFilterSearch) : {}, {
      preventScrollReset: true,
      replace: true,
      state: { rentalFilterScrollTarget: true },
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
    <article className="rental-accommodations-page" style={propertyReturnMinHeightStyle}>
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

      <div aria-label="Filter rentals" className="rental-accommodations-hero-pills" role="group">
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

      <section className="rental-accommodations-directory" ref={rentalResultsRef}>
        <div className="rental-accommodations-directory-inner">
          {summaryState.status === 'ready' ? (
            cards.length ? (
              <>
                <div aria-label="Rental accommodations view" className="rental-accommodations-view-tabs" role="tablist">
                  <button
                    aria-selected={viewMode === 'pictures'}
                    className={`rental-accommodations-view-tab${viewMode === 'pictures' ? ' rental-accommodations-view-tab--active' : ''}`}
                    role="tab"
                    type="button"
                    onClick={() => setViewMode('pictures')}
                  >
                    Pictures
                  </button>
                  <button
                    aria-selected={viewMode === 'list'}
                    className={`rental-accommodations-view-tab${viewMode === 'list' ? ' rental-accommodations-view-tab--active' : ''}`}
                    role="tab"
                    type="button"
                    onClick={() => setViewMode('list')}
                  >
                    List
                  </button>
                </div>

                {viewMode === 'pictures' ? (
                  <div className="rental-accommodations-grid">
                    {cards.map((card) => (
                      <RentalAccommodationCard
                        card={card}
                        key={card.path}
                        propertyNavigationState={propertyNavigationState}
                        onPropertyNavigate={handlePropertyNavigation}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="property-directory rental-accommodations-list-view">
                    <div className="property-directory-inner">
                      <div className="property-directory-grid">
                        {bedroomGroups.map((group) => (
                          <section className="property-directory-column" key={group.bedrooms}>
                            <div className="property-directory-pill">{group.label}</div>

                            <ul className="property-link-list">
                              {group.cards.map((card) => (
                                <li id={getPropertyReturnTargetId(card.slug) || undefined} key={card.slug}>
                                  <Link
                                    className="property-directory-link"
                                    state={propertyNavigationState}
                                    to={card.path}
                                    onClick={(event) => handlePropertyNavigation(event, card)}
                                  >
                                    {card.name}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </section>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
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
