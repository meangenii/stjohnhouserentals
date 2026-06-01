import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listCharters } from '../lib/charterRepository'
import { getContentImageSrc } from '../lib/contentAssets'
import { useStructuredPageContent } from '../lib/useSiteContent'

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncateSummary(summary, limit = 138) {
  const normalizedSummary = cleanText(summary)

  if (normalizedSummary.length <= limit) {
    return {
      text: normalizedSummary,
      isTruncated: false,
    }
  }

  const truncatedText = normalizedSummary.slice(0, limit)
  const breakpoint = truncatedText.lastIndexOf(' ')

  return {
    text: `${truncatedText.slice(0, breakpoint > 0 ? breakpoint : limit).trim()}...`,
    isTruncated: true,
  }
}

function CharterBoatCard({ charter }) {
  const imageUrl = getContentImageSrc(charter.heroImage, { width: 760, height: 520 })
  const summary = truncateSummary(charter.shortDescription)

  return (
    <article className="charter-boats-card">
      <Link aria-label={charter.name} className="charter-boats-card-media" to={charter.path}>
        {imageUrl ? (
          <img
            alt={charter.heroImage?.alt || charter.name}
            className="charter-boats-card-image"
            decoding="async"
            loading="lazy"
            src={imageUrl}
          />
        ) : null}
      </Link>

      <div className="charter-boats-card-body">
        <h3>{charter.name}</h3>
        <div aria-hidden="true" className="charter-boats-card-divider" />
        <p>{summary.text}</p>

        {summary.isTruncated ? (
          <Link className="charter-boats-card-more" to={charter.path}>
            Show More
          </Link>
        ) : (
          <div aria-hidden="true" className="charter-boats-card-more-spacer" />
        )}

        <Link className="charter-boats-card-action" to={charter.path}>
          Learn More
        </Link>
      </div>
    </article>
  )
}

export function CharterBoatsPage() {
  const page = useStructuredPageContent('charterBoats')
  const heroImageUrl = getContentImageSrc(page.hero.image, { width: 1920, height: 920 })
  const introImageUrl = getContentImageSrc(page.intro.image, { width: 960, height: 820 })
  const [state, setState] = useState({ status: 'loading', charters: [] })

  useEffect(() => {
    let cancelled = false

    listCharters()
      .then((charters) => {
        if (!cancelled) {
          setState({ status: 'ready', charters })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: 'ready', charters: [] })
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <article className="charter-boats-page">
      <section
        className="charter-boats-hero"
        style={
          heroImageUrl
            ? {
                backgroundImage: `linear-gradient(rgba(10, 24, 44, 0.32), rgba(10, 24, 44, 0.32)), url(${heroImageUrl})`,
              }
            : undefined
        }
      >
        <div className="charter-boats-hero-inner">
          <h1>{page.hero.title}</h1>
          <p>{page.hero.lead}</p>
        </div>
      </section>

      <section className="charter-boats-intro">
        <div className="charter-boats-intro-inner">
          <div className="charter-boats-intro-grid">
            <div className="charter-boats-intro-copy">
              <h2>{page.intro.title}</h2>
              <p>{page.intro.paragraph}</p>
            </div>

            <div className="charter-boats-intro-media">
              {introImageUrl ? (
                <img alt={page.intro.image.alt || 'Sailboat charter cruising St. John waters'} decoding="async" loading="lazy" src={introImageUrl} />
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="charter-boats-directory">
        <div className="charter-boats-directory-inner">
          <h2>{page.directory.title}</h2>

          <div className="charter-boats-grid">
            {state.charters.map((charter) => (
              <CharterBoatCard key={charter.slug} charter={charter} />
            ))}
          </div>
        </div>
      </section>

      <section className="charter-boats-safety">
        <div className="charter-boats-safety-inner">
          <h3>{page.safety.title}</h3>

          <div className="charter-boats-safety-copy">
            {page.safety.sections.map((section) => (
              <div key={section.label}>
                <p className="charter-boats-safety-label">{section.label}</p>
                <p>
                  {section.paragraph}{' '}
                  <a href={section.href} rel="noreferrer" target="_blank">
                    {section.href}
                  </a>
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </article>
  )
}
