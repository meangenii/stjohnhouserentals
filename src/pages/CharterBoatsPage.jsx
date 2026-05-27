import { Link } from 'react-router-dom'
import { buildWixImageUrl } from '../lib/wixImage'
import { pageSnapshots } from '../content/siteSnapshot'

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function getOrderedCharterListings(page) {
  const desiredNames = page.sectionHeadings?.slice(1, 6) ?? []

  return desiredNames
    .map((name) => page.charterListings?.find((listing) => listing.name === name))
    .filter(Boolean)
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

function CharterBoatCard({ listing }) {
  const imageUrl = buildWixImageUrl(listing.image, { width: 760, height: 520 })
  const summary = truncateSummary(listing.summary)

  return (
    <article className="charter-boats-card">
      <Link aria-label={listing.name} className="charter-boats-card-media" to={listing.path}>
        {imageUrl ? (
          <img
            alt={listing.image?.alt || listing.name}
            className="charter-boats-card-image"
            decoding="async"
            loading="lazy"
            src={imageUrl}
          />
        ) : null}
      </Link>

      <div className="charter-boats-card-body">
        <h3>{listing.name}</h3>
        <div aria-hidden="true" className="charter-boats-card-divider" />
        <p>{summary.text}</p>

        {summary.isTruncated ? (
          <Link className="charter-boats-card-more" to={listing.path}>
            Show More
          </Link>
        ) : (
          <div aria-hidden="true" className="charter-boats-card-more-spacer" />
        )}

        <Link className="charter-boats-card-action" to={listing.path}>
          Learn More
        </Link>
      </div>
    </article>
  )
}

export function CharterBoatsPage() {
  const page = pageSnapshots.charterBoats
  const charterListings = getOrderedCharterListings(page)
  const heroImageUrl = buildWixImageUrl(page.imageGallery?.[0], { width: 1920, height: 920 })
  const introImageUrl = buildWixImageUrl(page.imageGallery?.[1], { width: 960, height: 820 })

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
          <h1>{page.h1}</h1>
          <p>{cleanText(page.leadParagraphs?.[0])}</p>
        </div>
      </section>

      <section className="charter-boats-intro">
        <div className="charter-boats-intro-inner">
          <div className="charter-boats-intro-grid">
            <div className="charter-boats-intro-copy">
              <h2>{page.sectionHeadings?.[0] ?? 'Looking for a day sail in the Caribbean?'}</h2>
              <p>{cleanText(page.leadParagraphs?.[1])}</p>
            </div>

            <div className="charter-boats-intro-media">
              {introImageUrl ? (
                <img
                  alt={page.imageGallery?.[1]?.alt || 'Sailboat charter cruising St. John waters'}
                  decoding="async"
                  loading="lazy"
                  src={introImageUrl}
                />
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="charter-boats-directory">
        <div className="charter-boats-directory-inner">
          <h2>{page.sectionHeadings?.[6] ?? 'Charter Boats on St John'}</h2>

          <div className="charter-boats-grid">
            {charterListings.map((listing) => (
              <CharterBoatCard key={listing.path ?? listing.href} listing={listing} />
            ))}
          </div>
        </div>
      </section>

      <section className="charter-boats-safety">
        <div className="charter-boats-safety-inner">
          <h3>{page.sectionHeadings?.[7] ?? 'Hurricane Guide & Maritime Safety - What you NEED to know.'}</h3>

          <div className="charter-boats-safety-copy">
            <p className="charter-boats-safety-label">Hurricane Guide</p>
            <p>
              The Virgin Islands Territorial Emergency Management Agency (VITEMA) is an excellent resource for
              disaster preparedness and response. Hurricane season is June 1st through November 30th. You can
              find basic information, tracking maps, emergency communication methods and kit suggestions for
              the various dangerous conditions you can encounter in the Caribbean islands. Visit them at{' '}
              <a href="https://vitema.vi.gov/" rel="noreferrer" target="_blank">
                https://vitema.vi.gov/
              </a>
            </p>

            <p className="charter-boats-safety-label">Maritime Safety</p>
            <p>
              The USCG has provided the following link for those who are interested in learning more.{' '}
              <a href="https://www.rentalboatsafety.com/" rel="noreferrer" target="_blank">
                https://www.rentalboatsafety.com/
              </a>
            </p>
          </div>
        </div>
      </section>
    </article>
  )
}
