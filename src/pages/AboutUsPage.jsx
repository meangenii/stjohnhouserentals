import { pageSnapshots } from '../content/siteSnapshot'

function getOriginalWixImageUrl(url) {
  const value = String(url ?? '').trim()

  if (!value) {
    return ''
  }

  const [sourceUrl] = value.split('/v1/')
  return sourceUrl
}

function findImage(page, matchText) {
  const image = (page.imageGallery ?? []).find((item) =>
    String(item.alt ?? '')
      .toLowerCase()
      .includes(matchText.toLowerCase()),
  )

  return image ? { ...image, url: getOriginalWixImageUrl(image.url) } : null
}

function getHeroHeading(page) {
  const match = String(page.contentHtml ?? '').match(/<h1>(.*?)<\/h1>/i)
  return match?.[1]?.trim() || page.h1 || page.title
}

export function AboutUsPage() {
  const page = pageSnapshots.aboutUs
  const heroHeading = getHeroHeading(page)
  const heroImage = findImage(page, 'anaberg')
  const storyImage = findImage(page, 'fishes swimming')
  const essentialsImage = findImage(page, 'pool deck')
  const [storyHeading, essentialsHeading] = page.sectionHeadings
  const [storyLead, storySupport, storyBodyOne, storyBodyTwo, storyBodyThree, essentialsLead] = page.leadParagraphs

  return (
    <div className="about-page">
      <section className="about-page-hero" style={heroImage?.url ? { backgroundImage: `url(${heroImage.url})` } : undefined}>
        <div className="about-page-hero-inner">
          <h1>{heroHeading}</h1>
        </div>
      </section>

      <section className="about-page-story">
        <div className="about-page-story-inner">
          <div className="about-page-story-grid">
            <div className="about-page-story-media">
              {storyImage?.url ? <img alt={storyImage.alt || storyHeading} src={storyImage.url} /> : null}
            </div>

            <div className="about-page-story-copy">
              <p className="about-page-kicker">About Us</p>
              <h2>{storyHeading}</h2>
              <p>{storyLead}</p>
              <p>{storySupport}</p>
            </div>
          </div>

          <div className="about-page-story-body">
            <p>{storyBodyOne}</p>
            <p>{storyBodyTwo}</p>
            <p>{storyBodyThree}</p>
          </div>
        </div>
      </section>

      <section className="about-page-essentials">
        <div className="about-page-essentials-inner">
          <div className="about-page-essentials-grid">
            <div className="about-page-essentials-copy">
              <p className="about-page-kicker">Essentials</p>
              <h2>{essentialsHeading}</h2>
              <p>{essentialsLead}</p>
            </div>

            <div className="about-page-essentials-media">
              {essentialsImage?.url ? <img alt={essentialsImage.alt || essentialsHeading} src={essentialsImage.url} /> : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
