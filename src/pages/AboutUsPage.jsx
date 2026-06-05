import { EditableBackgroundSection, EditableImage, EditableText } from '../components/AdminInlinePageEdit'
import { getContentImageSrc } from '../lib/contentAssets'
import { useStructuredPageContent } from '../lib/useSiteContent'

export function AboutUsPage() {
  const page = useStructuredPageContent('aboutUs')
  const heroImageUrl = getContentImageSrc(page.hero.image)
  const storyImageUrl = getContentImageSrc(page.story.image)
  const essentialsImageUrl = getContentImageSrc(page.essentials.image)

  return (
    <div className="about-page">
      <EditableBackgroundSection
        as="section"
        className="about-page-hero"
        image={page.hero.image}
        path={['hero', 'image']}
        style={heroImageUrl ? { backgroundImage: `url(${heroImageUrl})` } : undefined}
      >
        <div className="about-page-hero-inner">
          <EditableText as="h1" label="Hero Title" multiline path={['hero', 'title']} rows={3} value={page.hero.title}>
            {page.hero.title}
          </EditableText>
        </div>
      </EditableBackgroundSection>

      <section className="about-page-story">
        <div className="about-page-story-inner">
          <div className="about-page-story-grid">
            <div className="about-page-story-media">
              {storyImageUrl ? (
                <EditableImage
                  alt={page.story.image.alt || page.story.title}
                  decoding="async"
                  fetchPriority="low"
                  image={page.story.image}
                  path={['story', 'image']}
                  loading="lazy"
                  src={storyImageUrl}
                />
              ) : null}
            </div>

            <div className="about-page-story-copy">
              <EditableText as="p" className="about-page-kicker" label="Story Kicker" path={['story', 'kicker']} value={page.story.kicker}>
                {page.story.kicker}
              </EditableText>
              <EditableText as="h2" label="Story Title" multiline path={['story', 'title']} rows={3} value={page.story.title}>
                {page.story.title}
              </EditableText>
              {page.story.leadParagraphs.map((paragraph, index) => (
                <EditableText as="p" key={`${index}-${paragraph}`} label={`Lead Paragraph ${index + 1}`} multiline path={['story', 'leadParagraphs', index]} rows={4} value={paragraph}>
                  {paragraph}
                </EditableText>
              ))}
            </div>
          </div>

          <div className="about-page-story-body">
            {page.story.bodyParagraphs.map((paragraph, index) => (
              <EditableText as="p" key={`${index}-${paragraph}`} label={`Body Paragraph ${index + 1}`} multiline path={['story', 'bodyParagraphs', index]} rows={5} value={paragraph}>
                {paragraph}
              </EditableText>
            ))}
          </div>
        </div>
      </section>

      <section className="about-page-essentials">
        <div className="about-page-essentials-inner">
          <div className="about-page-essentials-grid">
            <div className="about-page-essentials-copy">
              <EditableText as="p" className="about-page-kicker" label="Essentials Kicker" path={['essentials', 'kicker']} value={page.essentials.kicker}>
                {page.essentials.kicker}
              </EditableText>
              <EditableText as="h2" label="Essentials Title" multiline path={['essentials', 'title']} rows={3} value={page.essentials.title}>
                {page.essentials.title}
              </EditableText>
              <EditableText as="p" label="Essentials Lead" multiline path={['essentials', 'lead']} rows={5} value={page.essentials.lead}>
                {page.essentials.lead}
              </EditableText>
            </div>

            <div className="about-page-essentials-media">
              {essentialsImageUrl ? (
                <EditableImage
                  alt={page.essentials.image.alt || page.essentials.title}
                  decoding="async"
                  fetchPriority="low"
                  image={page.essentials.image}
                  path={['essentials', 'image']}
                  loading="lazy"
                  src={essentialsImageUrl}
                />
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
