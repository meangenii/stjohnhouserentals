import { EditableBackgroundSection, EditableImage, EditableLink, EditableText } from '../components/AdminInlinePageEdit'
import { getContentImageSrc } from '../lib/contentAssets'
import { useStructuredPageContent } from '../lib/useSiteContent'

function pairRestaurants(restaurants) {
  const rows = []

  for (let index = 0; index < restaurants.length; index += 2) {
    rows.push(restaurants.slice(index, index + 2))
  }

  return rows
}

function DiningSection({ restaurants, sectionIndex, title }) {
  const rows = pairRestaurants(restaurants)

  return (
    <section aria-label={title} className="local-attractions-dining-group">
      <EditableText as="p" className="local-attractions-dining-group-label" label={`${title} Title`} path={['dining', 'sections', sectionIndex, 'title']} value={title}>
        {title}
      </EditableText>

      <div className="local-attractions-dining-list">
        {rows.map((row, rowIndex) => (
          <div
            className={`local-attractions-dining-row ${row.length === 1 ? 'local-attractions-dining-row--single' : ''}`.trim()}
            key={`${title}-${rowIndex}`}
          >
            {row.map((restaurant, restaurantOffset) => {
              const restaurantIndex = rowIndex * 2 + restaurantOffset

              return (
              <article className="local-attractions-restaurant-entry" key={restaurant.name}>
                <EditableText as="p" className="local-attractions-restaurant-name" label={`Restaurant ${restaurant.name} Name`} path={['dining', 'sections', sectionIndex, 'restaurants', restaurantIndex, 'name']} value={restaurant.name}>
                  {restaurant.name}
                </EditableText>
                <EditableText as="p" className="local-attractions-restaurant-cuisine" label={`Restaurant ${restaurant.name} Cuisine`} path={['dining', 'sections', sectionIndex, 'restaurants', restaurantIndex, 'cuisine']} value={restaurant.cuisine}>
                  {restaurant.cuisine}
                </EditableText>
                <EditableText
                  as="p"
                  className={`local-attractions-restaurant-phone ${restaurant.phone ? '' : 'local-attractions-restaurant-phone--empty'}`.trim()}
                  label={`Restaurant ${restaurant.name} Phone`}
                  path={['dining', 'sections', sectionIndex, 'restaurants', restaurantIndex, 'phone']}
                  value={restaurant.phone ?? ''}
                >
                  {restaurant.phone ?? ''}
                </EditableText>
                <EditableText as="p" className="local-attractions-restaurant-location" label={`Restaurant ${restaurant.name} Location`} path={['dining', 'sections', sectionIndex, 'restaurants', restaurantIndex, 'location']} value={restaurant.location}>
                  {restaurant.location}
                </EditableText>
              </article>
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}

export function LocalAttractionsPage() {
  const page = useStructuredPageContent('localAttractions')
  const heroImageUrl = getContentImageSrc(page.hero.image)
  const mapImageUrl = getContentImageSrc(page.map.image)
  const mapActionUrl = String(page.map?.action?.href ?? '').trim() || mapImageUrl || '#'

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
            <EditableText as="h1" label="Hero Title" multiline path={['hero', 'title']} rows={3} value={page.hero.title}>
              {page.hero.title}
            </EditableText>
            <EditableText as="p" label="Hero Tagline" multiline path={['hero', 'tagline']} rows={3} value={page.hero.tagline}>
              {page.hero.tagline}
            </EditableText>
          </div>
        </div>
      </EditableBackgroundSection>

      <section className="local-attractions-map-section">
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
        </div>

        <div className="local-attractions-intro-row">
          <div className="local-attractions-intro-copy">
            <EditableText as="h2" label="Intro Title" multiline path={['intro', 'title']} rows={3} value={page.intro.title}>
              {page.intro.title}
            </EditableText>
            {page.intro.paragraphs.map((paragraph, index) => (
              <EditableText as="p" key={`${index}-${paragraph}`} label={`Intro Paragraph ${index + 1}`} multiline path={['intro', 'paragraphs', index]} rows={5} value={paragraph}>
                {paragraph}
              </EditableText>
            ))}
          </div>

          <EditableLink
            className="button-link button-link--ghost local-attractions-map-button"
            destination={mapActionUrl}
            destinationLabel="Map Button Link"
            destinationPath={['map', 'action', 'href']}
            external
            label={page.map.action.label}
            labelLabel="Map Button Text"
            labelPath={['map', 'action', 'label']}
          />
        </div>
      </section>

      <section className="local-attractions-dining-section">
        <header className="local-attractions-dining-header">
          <EditableText as="h2" label="Dining Title" multiline path={['dining', 'title']} rows={3} value={page.dining.title}>
            {page.dining.title}
          </EditableText>
        </header>

        {page.dining.sections.map((section, sectionIndex) => (
          <DiningSection key={section.title} restaurants={section.restaurants} sectionIndex={sectionIndex} title={section.title} />
        ))}
      </section>
    </article>
  )
}
