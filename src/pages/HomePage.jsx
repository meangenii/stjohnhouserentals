import { Link } from 'react-router-dom'
import { PropertyDirectorySection } from '../components/PropertyDirectorySection'
import heroBeach from '../content/hero_beach.png'
import homeAboutPool from '../content/home_about_pool.jpg'
import homeDiscoverCollage from '../content/home_discover_collage.png'
import homeWhyChooseUs from '../content/home_why_choose_us.jpg'
import { homeBedroomGroups } from '../content/homePropertyDirectory'
import { pageSnapshots } from '../content/siteSnapshot'

function HomeFeatureIcon({ kind }) {
  if (kind === 'selection') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect x="10" y="16" width="28" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <path d="M18 16v-3a6 6 0 0 1 12 0v3" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <path d="M16 23h16" fill="none" stroke="currentColor" strokeWidth="2.5" />
      </svg>
    )
  }

  if (kind === 'deals') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="10.5" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <path
          d="M24 11v4M24 33v4M37 24h-4M15 24h-4M32.5 15.5l-2.8 2.8M18.3 29.7l-2.8 2.8M32.5 32.5l-2.8-2.8M18.3 18.3l-2.8-2.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    )
  }

  if (kind === 'local') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path
          d="M24 10l4.8 9.7 10.7 1.6-7.7 7.5 1.8 10.6L24 34.2l-9.6 5.2 1.8-10.6-7.7-7.5 10.7-1.6Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <circle cx="24" cy="24" r="3.2" fill="currentColor" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path
        d="M14 33h20V19H14Zm4-14v-3.5A6 6 0 0 1 24 9.5a6 6 0 0 1 6 6V19"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M20 25h8M20 29h6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

export function HomePage() {
  const homePage = pageSnapshots.home
  const browseRentalsPath = homePage.routeLinks.find((routeLink) => routeLink.label === 'Browse Rentals')?.path ?? '/st-john-rentals'
  const [directoryHeading, trustHeading, discoverHeading, aboutHeading] = homePage.sectionHeadings
  const [heroLead, trustLead, selectionLead, dealsLead, localLead, serviceLead] = homePage.leadParagraphs
  const featureItems = [
    { kind: 'selection', title: 'Wide Selection of Properties', body: selectionLead },
    { kind: 'deals', title: 'Special Deals', body: dealsLead },
    { kind: 'local', title: 'GO Local', body: localLead },
    { kind: 'service', title: 'Reliable Customer Service', body: serviceLead },
  ]

  return (
    <div className="home-page">
      <section className="home-hero" style={{ backgroundImage: `url(${heroBeach})` }}>
        <div className="home-hero-overlay">
          <div className="home-hero-copy">
            <h1>
              <span>Welcome to St. John</span>
              <span>House Rentals</span>
            </h1>
            <p>{heroLead}</p>
          </div>
        </div>
      </section>

      <PropertyDirectorySection groups={homeBedroomGroups} title={directoryHeading} />

      <section className="page-section home-trust">
        <div className="home-trust-grid">
          <div className="home-trust-copy">
            <p className="home-trust-eyebrow">Why Choose Us</p>
            <h2>{trustHeading}</h2>
            <p>{trustLead}</p>
            <Link className="home-trust-button" to={browseRentalsPath}>
              Browse Rentals
            </Link>
          </div>

          <div className="home-trust-media">
            <img
              alt="Pink plumeria flowers overlooking St. John waters"
              className="home-trust-image"
              src={homeWhyChooseUs}
            />
          </div>
        </div>
      </section>

      <section className="home-discover-band">
        <div className="page-section home-discover">
          <div className="home-discover-header">
            <h2>{discoverHeading}</h2>
          </div>

          <div className="home-discover-grid">
            <div className="home-discover-media">
              <img
                alt="St. John bay collage with coastal views and boats"
                className="home-discover-image"
                src={homeDiscoverCollage}
              />
            </div>

            <div className="home-discover-features">
              {featureItems.map((item) => (
                <article className="home-discover-feature" key={item.title}>
                  <div className="home-discover-feature-icon">
                    <HomeFeatureIcon kind={item.kind} />
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="home-about-band">
        <div className="page-section home-about">
          <div className="home-about-grid">
            <div className="home-about-copy">
              <h2>{aboutHeading}</h2>
              <p>
                Our homes are owned or run by a number of individuals and management companies, and they all do their
                own booking. The email link on each home&apos;s page will get you directly to the person who can help!
                We at{' '}
                <a className="home-about-link" href="http://stjohnlinks.com/" rel="noreferrer" target="_blank">
                  stjohnhouserentals.com
                </a>{' '}
                do not handle bookings.
              </p>
            </div>

            <div className="home-about-media">
              <img
                alt="Pool deck overlooking villa and turquoise ocean at Still Waters Villa"
                className="home-about-image"
                src={homeAboutPool}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
