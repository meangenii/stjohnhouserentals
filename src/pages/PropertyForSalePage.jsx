import { EditableBackgroundSection, EditableImage, EditableLink, EditableText } from '../components/AdminInlinePageEdit'
import { getContentImageSrc } from '../lib/contentAssets'
import { useStructuredPageContent } from '../lib/useSiteContent'

export function PropertyForSalePage() {
  const page = useStructuredPageContent('propertyForSale')
  const heroImageUrl = getContentImageSrc(page.hero.image, { width: 1920, height: 720 })
  const storyImageUrl = getContentImageSrc(page.story.image, { width: 960, height: 720 })
  const detailsImageUrl = getContentImageSrc(page.details.image, { width: 960, height: 720 })

  return (
    <article className="property-for-sale-page">
      <EditableBackgroundSection
        as="section"
        className="property-for-sale-hero"
        image={page.hero.image}
        path={['hero', 'image']}
        style={heroImageUrl ? { backgroundImage: `linear-gradient(rgba(8, 23, 52, 0.18), rgba(8, 23, 52, 0.18)), url(${heroImageUrl})` } : undefined}
      >
        <div className="property-for-sale-hero-inner">
          <EditableText as="h1" label="Hero Title" multiline path={['hero', 'title']} rows={3} value={page.hero.title}>
            {page.hero.title}
          </EditableText>
        </div>
      </EditableBackgroundSection>

      <section className="property-for-sale-story">
        <div className="property-for-sale-story-inner">
          <div className="property-for-sale-story-grid">
            <div className="property-for-sale-story-copy">
              <EditableText as="h2" label="Story Title" multiline path={['story', 'title']} rows={3} value={page.story.title}>
                {page.story.title}
              </EditableText>
              {page.story.paragraphs.map((paragraph, index) => (
                <EditableText as="p" key={`${index}-${paragraph}`} label={`Story Paragraph ${index + 1}`} multiline path={['story', 'paragraphs', index]} rows={5} value={paragraph}>
                  {paragraph}
                </EditableText>
              ))}
            </div>

            <div className="property-for-sale-story-media">
              {storyImageUrl ? (
                <EditableImage alt={page.story.image.alt} decoding="async" image={page.story.image} path={['story', 'image']} loading="lazy" src={storyImageUrl} />
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
                <EditableImage alt={page.details.image.alt} decoding="async" image={page.details.image} path={['details', 'image']} loading="lazy" src={detailsImageUrl} />
              ) : null}
            </div>

            <div className="property-for-sale-band-copy">
              {page.details.paragraphs.map((paragraph, index) => (
                <EditableText as="p" key={`${index}-${paragraph}`} label={`Details Paragraph ${index + 1}`} multiline path={['details', 'paragraphs', index]} rows={5} value={paragraph}>
                  {paragraph}
                </EditableText>
              ))}

              <div className="property-for-sale-contact">
                <EditableText as="p" label="Contact Name" path={['details', 'contact', 'name']} value={page.details.contact.name}>
                  {page.details.contact.name}
                </EditableText>
                <EditableText as="p" label="Contact Role" path={['details', 'contact', 'role']} value={page.details.contact.role}>
                  {page.details.contact.role}
                </EditableText>
                <EditableLink
                  destination={page.details.contact.website.href}
                  destinationLabel="Website URL"
                  destinationPath={['details', 'contact', 'website', 'href']}
                  external
                  label={page.details.contact.website.label}
                  labelLabel="Website Label"
                  labelPath={['details', 'contact', 'website', 'label']}
                />
                <EditableText
                  as="a"
                  href={`tel:${page.details.contact.phone.replace(/[^0-9+]/g, '')}`}
                  label="Contact Phone"
                  path={['details', 'contact', 'phone']}
                  value={page.details.contact.phone}
                >
                  {`Phone: ${page.details.contact.phone}`}
                </EditableText>
              </div>
            </div>
          </div>
        </div>
      </section>
    </article>
  )
}
