import { Link } from 'react-router-dom'
import {
  localAttractionsDiningSections,
  localAttractionsHeroImage,
  localAttractionsHeroTagline,
} from '../content/localAttractions'
import stJohnMap from '../content/map.png'
import { pageSnapshots } from '../content/siteSnapshot'

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
  const page = pageSnapshots.localAttractions
  const primaryRouteLink = page.routeLinks?.find((link) => link.path) ?? null
  const introHeading = page.sectionHeadings?.[0] ?? 'Where do you want to spend your day?'
  const diningHeading = page.sectionHeadings?.[1] ?? 'St. John Restaurants'

  return (
    <article className="local-attractions-page">
      <section className="local-attractions-hero" style={{ backgroundImage: `url(${localAttractionsHeroImage})` }}>
        <div className="local-attractions-hero-overlay">
          <div className="local-attractions-hero-copy">
            <h1>{page.h1}</h1>
            <p>{localAttractionsHeroTagline}</p>
            {primaryRouteLink ? (
              <Link className="button-link button-link--secondary local-attractions-hero-button" to={primaryRouteLink.path}>
                {primaryRouteLink.label}
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className="local-attractions-map-section">
        <div className="local-attractions-map-card">
          <img alt="Virgin Islands National Park map of St. John" className="local-attractions-map-image" src={stJohnMap} />
        </div>

        <div className="local-attractions-intro-row">
          <div className="local-attractions-intro-copy">
            <h2>{introHeading}</h2>
            {page.leadParagraphs?.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>

          <a className="button-link button-link--ghost local-attractions-map-button" href={stJohnMap} rel="noreferrer" target="_blank">
            View Full Map
          </a>
        </div>
      </section>

      <section className="local-attractions-dining-section">
        <header className="local-attractions-dining-header">
          <h2>{diningHeading}</h2>
        </header>

        {localAttractionsDiningSections.map((section) => (
          <DiningSection key={section.title} restaurants={section.restaurants} title={section.title} />
        ))}
      </section>
    </article>
  )
}
