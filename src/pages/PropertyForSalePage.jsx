import { getContentImageSrc } from '../lib/contentAssets'
import { useStructuredPageContent } from '../lib/useSiteContent'

export function PropertyForSalePage() {
  const page = useStructuredPageContent('propertyForSale')
  const heroImageUrl = getContentImageSrc(page.hero.image, { width: 1920, height: 720 })
  const storyImageUrl = getContentImageSrc(page.story.image, { width: 960, height: 720 })
  const detailsImageUrl = getContentImageSrc(page.details.image, { width: 960, height: 720 })

  return (
    <article className="property-for-sale-page">
      <section
        className="property-for-sale-hero"
        style={heroImageUrl ? { backgroundImage: `linear-gradient(rgba(8, 23, 52, 0.18), rgba(8, 23, 52, 0.18)), url(${heroImageUrl})` } : undefined}
      >
        <div className="property-for-sale-hero-inner">
          <h1>{page.hero.title}</h1>
        </div>
      </section>

      <section className="property-for-sale-story">
        <div className="property-for-sale-story-inner">
          <div className="property-for-sale-story-grid">
            <div className="property-for-sale-story-copy">
              <h2>{page.story.title}</h2>
              {page.story.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>

            <div className="property-for-sale-story-media">
              {storyImageUrl ? <img alt={page.story.image.alt} decoding="async" loading="lazy" src={storyImageUrl} /> : null}
            </div>
          </div>
        </div>
      </section>

      <section className="property-for-sale-band">
        <div className="property-for-sale-band-inner">
          <div className="property-for-sale-band-grid">
            <div className="property-for-sale-band-media">
              {detailsImageUrl ? <img alt={page.details.image.alt} decoding="async" loading="lazy" src={detailsImageUrl} /> : null}
            </div>

            <div className="property-for-sale-band-copy">
              {page.details.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}

              <div className="property-for-sale-contact">
                <p>{page.details.contact.name}</p>
                <p>{page.details.contact.role}</p>
                <a href={page.details.contact.website.href} rel="noreferrer" target="_blank">
                  {page.details.contact.website.label}
                </a>
                <a href={`tel:${page.details.contact.phone.replace(/[^0-9+]/g, '')}`}>Phone: {page.details.contact.phone}</a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </article>
  )
}
