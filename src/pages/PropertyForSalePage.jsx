import { pageSnapshots } from '../content/siteSnapshot'
import { buildWixImageUrl } from '../lib/wixImage'

function cleanLeadParagraph(value) {
  return String(value ?? '')
    .replace(/”/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

export function PropertyForSalePage() {
  const page = pageSnapshots.propertyForSale
  const [
    introLead = '',
    introBody = '',
    islandLifestyleLead = '',
    salesPitchLead = '',
    closingLead = '',
  ] = (page.leadParagraphs ?? []).map((paragraph) => cleanLeadParagraph(paragraph))
  const heroImageUrl = buildWixImageUrl(page.imageGallery?.[0], { width: 1920, height: 720 })
  const introImageUrl = buildWixImageUrl(page.imageGallery?.[1], { width: 960, height: 720 })
  const detailsImageUrl = buildWixImageUrl(page.imageGallery?.[2], { width: 960, height: 720 })
  const sectionHeading = page.sectionHeadings?.[0] ?? 'St John Virgin Islands'

  return (
    <article className="property-for-sale-page">
      <section
        className="property-for-sale-hero"
        style={heroImageUrl ? { backgroundImage: `linear-gradient(rgba(8, 23, 52, 0.18), rgba(8, 23, 52, 0.18)), url(${heroImageUrl})` } : undefined}
      >
        <div className="property-for-sale-hero-inner">
          <h1>{page.h1}</h1>
        </div>
      </section>

      <section className="property-for-sale-story">
        <div className="property-for-sale-story-inner">
          <div className="property-for-sale-story-grid">
            <div className="property-for-sale-story-copy">
              <h2>{sectionHeading}</h2>
              <p>{introLead}</p>
              <p>{introBody}</p>
            </div>

            <div className="property-for-sale-story-media">
              {introImageUrl ? (
                <img
                  alt="Stone tower and tropical plants overlooking St. John waters"
                  decoding="async"
                  loading="lazy"
                  src={introImageUrl}
                />
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="property-for-sale-band">
        <div className="property-for-sale-band-inner">
          <div className="property-for-sale-band-grid">
            <div className="property-for-sale-band-media">
              {detailsImageUrl ? (
                <img
                  alt="Cruz Bay view with shoreline and sky"
                  decoding="async"
                  loading="lazy"
                  src={detailsImageUrl}
                />
              ) : null}
            </div>

            <div className="property-for-sale-band-copy">
              <p>{islandLifestyleLead}</p>
              <p>{salesPitchLead}</p>
              <p>{closingLead}</p>

              <div className="property-for-sale-contact">
                <p>Tammy Donnelly</p>
                <p>VI Licensed Real Estate Broker /Owner</p>
                <a href="http://www.340realestateco.com" rel="noreferrer" target="_blank">
                  www.340realestateco.com
                </a>
                <a href="tel:340-643-6068">Phone: 340-643-6068</a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </article>
  )
}
