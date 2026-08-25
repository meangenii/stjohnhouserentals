import { EditableBackgroundSection, EditableImage, EditableLink, EditableText } from '../components/AdminInlinePageEdit'
import { PageLoadingState } from '../components/PageLoadingState'
import { getContentImageSrc } from '../lib/contentAssets'
import { useStructuredPageContent } from '../lib/useSiteContent'

export function AboutUsPage() {
  const page = useStructuredPageContent('aboutUs')

  if (!page) {
    return <PageLoadingState />
  }

  const heroImageUrl = getContentImageSrc(page.hero.image, { width: 1920, height: 720 })
  const introImageUrl = page.intro ? getContentImageSrc(page.intro.image, { width: 960, height: 720 }) : ''
  const storyImageUrl = getContentImageSrc(page.story.image, { width: 960, height: 720 })
  const essentialsImageUrl = getContentImageSrc(page.essentials.image, { width: 960, height: 720 })

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

      {page.intro ? (
        <section className="about-page-story about-page-intro">
          <div className="about-page-story-inner">
            <div className="about-page-story-grid">
              <div className="about-page-story-media">
                {introImageUrl ? (
                  <EditableImage
                    alt={page.intro.image.alt || page.intro.title}
                    decoding="async"
                    fetchPriority="low"
                    image={page.intro.image}
                    path={['intro', 'image']}
                    loading="lazy"
                    src={introImageUrl}
                  />
                ) : null}
              </div>

              <div className="about-page-story-copy">
                <EditableText as="p" className="about-page-kicker" label="Intro Kicker" path={['intro', 'kicker']} value={page.intro.kicker}>
                  {page.intro.kicker}
                </EditableText>
                <EditableText as="h2" label="Intro Title" multiline path={['intro', 'title']} rows={3} value={page.intro.title}>
                  {page.intro.title}
                </EditableText>
                <EditableText as="p" label="Intro Lead" multiline path={['intro', 'lead']} rows={4} value={page.intro.lead}>
                  {page.intro.lead}
                </EditableText>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="about-page-story">
        <div className="about-page-story-inner">
          <div className="about-page-story-grid about-page-story-grid--reversed">
            <div className="about-page-story-copy">
              <EditableText as="p" className="about-page-kicker" label="Story Kicker" path={['story', 'kicker']} value={page.story.kicker}>
                {page.story.kicker}
              </EditableText>
              <EditableText as="h2" label="Story Title" multiline path={['story', 'title']} rows={3} value={page.story.title}>
                {page.story.title}
              </EditableText>
              {page.story.leadParagraphs.map((paragraph, index) => (
                <div key={index}>
                  <EditableText as="p" label={`Lead Paragraph ${index + 1}`} multiline path={['story', 'leadParagraphs', index]} rows={4} value={paragraph}>
                    {paragraph}
                  </EditableText>
                  {index === 0 && page.story.action ? (
                    <EditableLink
                      allowExternalUrl
                      allowRouteSelection
                      buttonColor={page.story.action.backgroundColor}
                      buttonColorPath={['story', 'action', 'backgroundColor']}
                      className="home-trust-button"
                      destination={page.story.action.path}
                      destinationField="path"
                      destinationLabel="Button Link"
                      destinationPath={['story', 'action', 'path']}
                      link={page.story.action}
                      linkPath={['story', 'action']}
                      label={page.story.action.label}
                      labelLabel="Button Text"
                      labelPath={['story', 'action', 'label']}
                      presentation="button"
                    />
                  ) : null}
                </div>
              ))}
            </div>

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
          </div>

          <div className="about-page-story-body">
            {page.story.bodyParagraphs.map((paragraph, index) => (
              <EditableText as="p" key={index} label={`Body Paragraph ${index + 1}`} multiline path={['story', 'bodyParagraphs', index]} rows={5} value={paragraph}>
                {paragraph}
              </EditableText>
            ))}
          </div>
        </div>
      </section>

      <section className="about-page-essentials">
        <div className="about-page-essentials-inner">
          <div className="about-page-essentials-grid about-page-essentials-grid--reversed">
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
          </div>
        </div>
      </section>
    </div>
  )
}
