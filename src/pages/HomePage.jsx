import { Link } from 'react-router-dom'
import { PropertyDirectorySection } from '../components/PropertyDirectorySection'
import { getContentImageSrc } from '../lib/contentAssets'
import { useStructuredPageContent } from '../lib/useSiteContent'

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
  const page = useStructuredPageContent('home')
  const heroImageUrl = getContentImageSrc(page.hero.image)
  const trustImageUrl = getContentImageSrc(page.trust.image)
  const discoverImageUrl = getContentImageSrc(page.discover.image)
  const aboutImageUrl = getContentImageSrc(page.about.image)

  return (
    <div className="home-page">
      <section className="home-hero" style={heroImageUrl ? { backgroundImage: `url(${heroImageUrl})` } : undefined}>
        <div className="home-hero-overlay">
          <div className="home-hero-copy">
            <h1>
              {page.hero.titleLines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </h1>
            <p>{page.hero.lead}</p>
          </div>
        </div>
      </section>

      <PropertyDirectorySection title={page.directory.title} />

      <section className="page-section home-trust">
        <div className="home-trust-grid">
          <div className="home-trust-copy">
            <p className="home-trust-eyebrow">{page.trust.eyebrow}</p>
            <h2>{page.trust.title}</h2>
            <p>{page.trust.lead}</p>
            <Link className="home-trust-button" to={page.trust.action.path}>
              {page.trust.action.label}
            </Link>
          </div>

          <div className="home-trust-media">
            <img
              alt={page.trust.image.alt}
              className="home-trust-image"
              decoding="async"
              fetchPriority="low"
              loading="lazy"
              src={trustImageUrl}
            />
          </div>
        </div>
      </section>

      <section className="home-discover-band">
        <div className="page-section home-discover">
          <div className="home-discover-header">
            <h2>{page.discover.title}</h2>
          </div>

          <div className="home-discover-grid">
            <div className="home-discover-media">
              <img
                alt={page.discover.image.alt}
                className="home-discover-image"
                decoding="async"
                fetchPriority="low"
                loading="lazy"
                src={discoverImageUrl}
              />
            </div>

            <div className="home-discover-features">
              {page.discover.features.map((item) => (
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
              <h2>{page.about.title}</h2>
              <p>
                {page.about.bodyIntro}
                <a className="home-about-link" href={page.about.bodyLink.href} rel="noreferrer" target="_blank">
                  {page.about.bodyLink.label}
                </a>{' '}
                {page.about.bodyOutro.trim()}
              </p>
            </div>

            <div className="home-about-media">
              <img
                alt={page.about.image.alt}
                className="home-about-image"
                decoding="async"
                fetchPriority="low"
                loading="lazy"
                src={aboutImageUrl}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
