import { useState } from 'react'
import { EditableBackgroundSection, EditableImage, EditableLink, EditableText } from '../components/AdminInlinePageEdit'
import { PageLoadingState } from '../components/PageLoadingState'
import { buildPhoneHref } from '../lib/contactLinks'
import { getContentImageSrc } from '../lib/contentAssets'
import { useStructuredPageContent } from '../lib/useSiteContent'

const DINING_FOOD_FILTERS = [
  { id: 'caribbean', label: 'Caribbean', pattern: /caribbean/i },
  { id: 'american', label: 'American', pattern: /american/i },
  { id: 'seafood', label: 'Seafood', pattern: /seafood/i },
  { id: 'bbq', label: 'BBQ', pattern: /bbq|barbeque/i },
  { id: 'italian', label: 'Italian', pattern: /italian|pizza/i },
  { id: 'mexican', label: 'Mexican', pattern: /mexican|tacos?/i },
  { id: 'mediterranean', label: 'Mediterranean', pattern: /mediterranean/i },
  { id: 'deli-bakery', label: 'Deli & Bakery', pattern: /deli|delicatessen|bakery/i },
  { id: 'desserts', label: 'Desserts', pattern: /dessert|scoops|delights/i },
  { id: 'vegan-healthy', label: 'Vegan & Healthy', pattern: /vegan|healthy/i },
  { id: 'food-trucks', label: 'Food Trucks', pattern: /food truck/i },
]

function buildRestaurantOnlineHref(restaurant) {
  const website = String(restaurant?.website ?? '').trim()

  if (website) {
    return /^https?:\/\//i.test(website) ? website : `https://${website}`
  }

  const searchQuery = [restaurant?.name, restaurant?.location, 'St. John USVI'].filter(Boolean).join(' ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`
}

function normalizeMapPositionCopy(value) {
  return String(value ?? '').replace(/\bmap above\b/gi, 'map below')
}

function matchesFoodType(restaurant, foodTypeId) {
  if (foodTypeId === 'all') {
    return true
  }

  const filter = DINING_FOOD_FILTERS.find((option) => option.id === foodTypeId)
  const searchableText = [restaurant?.name, restaurant?.cuisine].filter(Boolean).join(' ')
  return filter ? filter.pattern.test(searchableText) : true
}

function ActionIcon({ type }) {
  if (type === 'phone') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M7.2 3.5 4.8 4.6c-.8.4-1.2 1.3-1 2.2 1.1 6.6 6.4 11.9 13 13 .9.2 1.8-.2 2.2-1l1.1-2.4c.3-.7.1-1.5-.5-2l-3-2.2c-.6-.4-1.4-.3-1.9.2l-1.4 1.4a12.5 12.5 0 0 1-3.2-2.2A12.5 12.5 0 0 1 8 8.5l1.4-1.4c.5-.5.6-1.3.2-1.9l-2.2-3c-.5-.6-1.3-.8-2-.5Z" />
      </svg>
    )
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M14 5h5v5M19 5l-8 8M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  )
}

function DiningSection({ restaurants, sectionIndex, title }) {
  const sectionId = `dining-area-${sectionIndex}`

  return (
    <section aria-labelledby={`${sectionId}-title`} className="local-attractions-dining-group" id={sectionId}>
      <header className="local-attractions-dining-group-header">
        <div>
          <EditableText as="h3" id={`${sectionId}-title`} label={`${title} Title`} path={['dining', 'sections', sectionIndex, 'title']} value={title}>
            {title}
          </EditableText>
        </div>
        <p className="local-attractions-dining-count">{restaurants.length} {restaurants.length === 1 ? 'place' : 'places'}</p>
      </header>

      <div className="local-attractions-restaurant-grid">
        {restaurants.map(({ restaurant, restaurantIndex }) => {
          const phoneHref = buildPhoneHref(restaurant.phone)
          const onlineHref = buildRestaurantOnlineHref(restaurant)
          const onlineLabel = restaurant.website ? 'Visit website' : 'Find online'

          return (
            <article className="local-attractions-restaurant-card" key={restaurantIndex}>
              <div className="local-attractions-restaurant-card-copy">
                <EditableText as="h4" className="local-attractions-restaurant-name" label={`Restaurant ${restaurant.name} Name`} path={['dining', 'sections', sectionIndex, 'restaurants', restaurantIndex, 'name']} value={restaurant.name}>
                  {restaurant.name}
                </EditableText>
                <EditableText as="p" className="local-attractions-restaurant-cuisine" label={`Restaurant ${restaurant.name} Cuisine`} path={['dining', 'sections', sectionIndex, 'restaurants', restaurantIndex, 'cuisine']} value={restaurant.cuisine}>
                  {restaurant.cuisine}
                </EditableText>
                <div className="local-attractions-restaurant-location-row">
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" />
                    <circle cx="12" cy="10" r="2" />
                  </svg>
                  <EditableText as="p" className="local-attractions-restaurant-location" label={`Restaurant ${restaurant.name} Location`} path={['dining', 'sections', sectionIndex, 'restaurants', restaurantIndex, 'location']} value={restaurant.location}>
                    {restaurant.location}
                  </EditableText>
                </div>
              </div>

              <div className="local-attractions-restaurant-actions">
                <a aria-label={`${onlineLabel} for ${restaurant.name}`} className="button-link local-attractions-restaurant-action local-attractions-restaurant-action--online" href={onlineHref} rel="noreferrer" target="_blank">
                  <ActionIcon type="online" />
                  <span>{onlineLabel}</span>
                </a>
                {phoneHref ? (
                  <a aria-label={`Call ${restaurant.name} at ${restaurant.phone}`} className="button-link local-attractions-restaurant-action local-attractions-restaurant-action--phone" href={phoneHref}>
                    <ActionIcon type="phone" />
                    <EditableText as="span" label={`Restaurant ${restaurant.name} Phone`} path={['dining', 'sections', sectionIndex, 'restaurants', restaurantIndex, 'phone']} value={restaurant.phone}>
                      {restaurant.phone}
                    </EditableText>
                  </a>
                ) : (
                  <div className="local-attractions-restaurant-action local-attractions-restaurant-action--unavailable">
                    <ActionIcon type="phone" />
                    {restaurant.phone ? (
                      <EditableText as="span" label={`Restaurant ${restaurant.name} Phone`} path={['dining', 'sections', sectionIndex, 'restaurants', restaurantIndex, 'phone']} value={restaurant.phone}>
                        {restaurant.phone}
                      </EditableText>
                    ) : (
                      <span>Phone not listed</span>
                    )}
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export function LocalAttractionsPage() {
  const page = useStructuredPageContent('localAttractions')
  const [selectedDiningArea, setSelectedDiningArea] = useState('all')
  const [selectedFoodType, setSelectedFoodType] = useState('all')

  if (!page) {
    return <PageLoadingState />
  }

  const diningSections = page.dining.sections
    .map((section, sectionIndex) => ({
      ...section,
      sectionIndex,
      restaurants: (section.restaurants ?? [])
        .map((restaurant, restaurantIndex) => ({ restaurant, restaurantIndex }))
        .filter(({ restaurant }) => matchesFoodType(restaurant, selectedFoodType)),
    }))
    .filter((section) => selectedDiningArea === 'all' || String(section.sectionIndex) === selectedDiningArea)
    .filter((section) => section.restaurants.length > 0)
  const heroImageUrl = getContentImageSrc(page.hero.image)
  const mapImageUrl = getContentImageSrc(page.map.image)
  const mapActionUrl = String(page.map?.action?.href ?? '').trim() || mapImageUrl || '#'
  const diningResultCount = diningSections.reduce((total, section) => total + section.restaurants.length, 0)
  const totalRestaurantCount = page.dining.sections.reduce((total, section) => total + section.restaurants.length, 0)

  return (
    <article className="local-attractions-page">
      <EditableBackgroundSection
        as="section"
        className="local-attractions-hero"
        image={page.hero.image}
        path={['hero', 'image']}
        style={heroImageUrl ? { backgroundImage: `url(${heroImageUrl})` } : undefined}
      >
        <div className="local-attractions-hero-overlay">
          <div className="local-attractions-hero-copy">
            <p className="local-attractions-hero-kicker">Your St. John island guide</p>
            <EditableText as="h1" label="Hero Title" multiline path={['hero', 'title']} rows={3} value={page.hero.title}>
              {page.hero.title}
            </EditableText>
            <EditableText as="p" label="Hero Tagline" multiline path={['hero', 'tagline']} rows={3} value={page.hero.tagline}>
              {page.hero.tagline}
            </EditableText>
          </div>
        </div>
      </EditableBackgroundSection>

      <section className="local-attractions-map-section" id="island-map">
        <div className="local-attractions-intro-row">
          <div className="local-attractions-intro-copy">
            <p className="local-attractions-eyebrow">Plan your island day</p>
            <EditableText as="h2" label="Intro Title" multiline path={['intro', 'title']} rows={3} value={page.intro.title}>
              {page.intro.title}
            </EditableText>
            {page.intro.paragraphs.map((paragraph, index) => {
              const displayParagraph = normalizeMapPositionCopy(paragraph)

              return (
                <EditableText as="p" key={index} label={`Intro Paragraph ${index + 1}`} multiline path={['intro', 'paragraphs', index]} rows={5} value={displayParagraph}>
                  {displayParagraph}
                </EditableText>
              )
            })}
          </div>

          <EditableLink
            className="local-attractions-map-button"
            destination={mapActionUrl}
            destinationLabel="Map Button Link"
            destinationPath={['map', 'action', 'href']}
            external
            label={page.map.action.label}
            labelLabel="Map Button Text"
            labelPath={['map', 'action', 'label']}
          />
        </div>

        <div className="local-attractions-map-card">
          <EditableImage
            alt={page.map.image.alt}
            className="local-attractions-map-image"
            decoding="async"
            fetchPriority="low"
            image={page.map.image}
            path={['map', 'image']}
            loading="lazy"
            src={mapImageUrl}
          />
          <div className="local-attractions-map-caption">
            <span>Virgin Islands National Park</span>
            <span>Tap &quot;View Full Map&quot; for a closer look</span>
          </div>
        </div>
      </section>

      <section className="local-attractions-dining-section" id="dining-guide">
        <header className="local-attractions-dining-header">
          <p className="local-attractions-eyebrow">Eat your way around St. John</p>
          <EditableText as="h2" label="Dining Title" multiline path={['dining', 'title']} rows={3} value={page.dining.title}>
            {page.dining.title}
          </EditableText>
          <p className="local-attractions-dining-intro">Browse {totalRestaurantCount} island spots by location and food type, then call or find current details online.</p>
        </header>

        <div className="local-attractions-dining-tools rental-accommodations-filter-row">
          <div className="rental-accommodations-filter-group rental-accommodations-filter-group--pills">
            <div aria-label="Filter restaurants" className="rental-accommodations-pill-list" role="group">
              <label className="visually-hidden" htmlFor="dining-location-filter">Filter restaurants by location</label>
              <div className="rental-accommodations-pill-select-shell rental-accommodations-pill-select-shell--location">
                <select
                  className="rental-accommodations-pill-select"
                  id="dining-location-filter"
                  onChange={(event) => setSelectedDiningArea(event.target.value)}
                  value={selectedDiningArea}
                >
                  <option value="all">All Locations</option>
                  {page.dining.sections.map((section, sectionIndex) => (
                    <option key={sectionIndex} value={sectionIndex}>
                      {section.title.replace(/\s+dining$/i, '')}
                    </option>
                  ))}
                </select>
              </div>

              <label className="visually-hidden" htmlFor="dining-food-type-filter">Filter restaurants by food type</label>
              <div className="rental-accommodations-pill-select-shell rental-accommodations-pill-select-shell--location">
                <select
                  className="rental-accommodations-pill-select"
                  id="dining-food-type-filter"
                  onChange={(event) => setSelectedFoodType(event.target.value)}
                  value={selectedFoodType}
                >
                  <option value="all">All Food Types</option>
                  {DINING_FOOD_FILTERS.map((filter) => (
                    <option key={filter.id} value={filter.id}>{filter.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <p aria-live="polite" className="local-attractions-dining-results">
            Showing {diningResultCount} {diningResultCount === 1 ? 'place' : 'places'}
          </p>
        </div>

        {diningSections.map((section) => (
          <DiningSection key={section.sectionIndex} restaurants={section.restaurants} sectionIndex={section.sectionIndex} title={section.title} />
        ))}
      </section>
    </article>
  )
}
