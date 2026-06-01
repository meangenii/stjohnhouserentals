import { getContentImageSrc } from '../lib/contentAssets'
import { useStructuredPageContent } from '../lib/useSiteContent'

function pairRestaurants(restaurants) {
  const rows = []

  for (let index = 0; index < restaurants.length; index += 2) {
    rows.push(restaurants.slice(index, index + 2))
  }

  return rows
}

function DiningSection({ title, restaurants }) {
  const rows = pairRestaurants(restaurants)

  return (
    <section aria-label={title} className="local-attractions-dining-group">
      <p className="local-attractions-dining-group-label">{title}</p>

      <div className="local-attractions-dining-list">
        {rows.map((row, rowIndex) => (
          <div
            className={`local-attractions-dining-row ${row.length === 1 ? 'local-attractions-dining-row--single' : ''}`.trim()}
            key={`${title}-${rowIndex}`}
          >
            {row.map((restaurant) => (
              <article className="local-attractions-restaurant-entry" key={restaurant.name}>
                <p className="local-attractions-restaurant-name">{restaurant.name}</p>
                <p className="local-attractions-restaurant-cuisine">{restaurant.cuisine}</p>
                <p
                  className={`local-attractions-restaurant-phone ${restaurant.phone ? '' : 'local-attractions-restaurant-phone--empty'}`.trim()}
                >
                  {restaurant.phone ?? ''}
                </p>
                <p className="local-attractions-restaurant-location">{restaurant.location}</p>
              </article>
            ))}
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

  return (
    <article className="local-attractions-page">
      <section className="local-attractions-hero" style={heroImageUrl ? { backgroundImage: `url(${heroImageUrl})` } : undefined}>
        <div className="local-attractions-hero-overlay">
          <div className="local-attractions-hero-copy">
            <h1>{page.hero.title}</h1>
            <p>{page.hero.tagline}</p>
          </div>
        </div>
      </section>

      <section className="local-attractions-map-section">
        <div className="local-attractions-map-card">
          <img
            alt={page.map.image.alt}
            className="local-attractions-map-image"
            decoding="async"
            fetchPriority="low"
            loading="lazy"
            src={mapImageUrl}
          />
        </div>

        <div className="local-attractions-intro-row">
          <div className="local-attractions-intro-copy">
            <h2>{page.intro.title}</h2>
            {page.intro.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>

          <a className="button-link button-link--ghost local-attractions-map-button" href={mapImageUrl} rel="noreferrer" target="_blank">
            {page.map.action.label}
          </a>
        </div>
      </section>

      <section className="local-attractions-dining-section">
        <header className="local-attractions-dining-header">
          <h2>{page.dining.title}</h2>
        </header>

        {page.dining.sections.map((section) => (
          <DiningSection key={section.title} restaurants={section.restaurants} title={section.title} />
        ))}
      </section>
    </article>
  )
}
