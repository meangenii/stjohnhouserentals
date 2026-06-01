import { getContentImageSrc } from '../lib/contentAssets'
import { useStructuredPageContent } from '../lib/useSiteContent'

export function AboutUsPage() {
  const page = useStructuredPageContent('aboutUs')
  const heroImageUrl = getContentImageSrc(page.hero.image)
  const storyImageUrl = getContentImageSrc(page.story.image)
  const essentialsImageUrl = getContentImageSrc(page.essentials.image)

  return (
    <div className="about-page">
      <section className="about-page-hero" style={heroImageUrl ? { backgroundImage: `url(${heroImageUrl})` } : undefined}>
        <div className="about-page-hero-inner">
          <h1>{page.hero.title}</h1>
        </div>
      </section>

      <section className="about-page-story">
        <div className="about-page-story-inner">
          <div className="about-page-story-grid">
            <div className="about-page-story-media">
              {storyImageUrl ? (
                <img
                  alt={page.story.image.alt || page.story.title}
                  decoding="async"
                  fetchPriority="low"
                  loading="lazy"
                  src={storyImageUrl}
                />
              ) : null}
            </div>

            <div className="about-page-story-copy">
              <p className="about-page-kicker">{page.story.kicker}</p>
              <h2>{page.story.title}</h2>
              {page.story.leadParagraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </div>

          <div className="about-page-story-body">
            {page.story.bodyParagraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>
      </section>

      <section className="about-page-essentials">
        <div className="about-page-essentials-inner">
          <div className="about-page-essentials-grid">
            <div className="about-page-essentials-copy">
              <p className="about-page-kicker">{page.essentials.kicker}</p>
              <h2>{page.essentials.title}</h2>
              <p>{page.essentials.lead}</p>
            </div>

            <div className="about-page-essentials-media">
              {essentialsImageUrl ? (
                <img
                  alt={page.essentials.image.alt || page.essentials.title}
                  decoding="async"
                  fetchPriority="low"
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
