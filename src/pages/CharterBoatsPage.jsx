import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EditableBackgroundSection, EditableImage, EditableLink, EditableText } from '../components/AdminInlinePageEdit'
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
      <EditableBackgroundSection
        as="section"
        className="charter-boats-hero"
        image={page.hero.image}
        path={['hero', 'image']}
        style={
          heroImageUrl
            ? {
                backgroundImage: `linear-gradient(rgba(10, 24, 44, 0.32), rgba(10, 24, 44, 0.32)), url(${heroImageUrl})`,
              }
            : undefined
        }
      >
        <div className="charter-boats-hero-inner">
          <EditableText as="h1" label="Hero Title" multiline path={['hero', 'title']} rows={3} value={page.hero.title}>
            {page.hero.title}
          </EditableText>
          <EditableText as="p" label="Hero Lead" multiline path={['hero', 'lead']} rows={4} value={page.hero.lead}>
            {page.hero.lead}
          </EditableText>
        </div>
      </EditableBackgroundSection>

      <section className="charter-boats-intro">
        <div className="charter-boats-intro-inner">
          <div className="charter-boats-intro-grid">
            <div className="charter-boats-intro-copy">
              <EditableText as="h2" label="Intro Title" multiline path={['intro', 'title']} rows={3} value={page.intro.title}>
                {page.intro.title}
              </EditableText>
              <EditableText as="p" label="Intro Paragraph" multiline path={['intro', 'paragraph']} rows={6} value={page.intro.paragraph}>
                {page.intro.paragraph}
              </EditableText>
            </div>

            <div className="charter-boats-intro-media">
              {introImageUrl ? (
                <EditableImage
                  alt={page.intro.image.alt || 'Sailboat charter cruising St. John waters'}
                  decoding="async"
                  image={page.intro.image}
                  path={['intro', 'image']}
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
          <EditableText as="h2" label="Directory Title" multiline path={['directory', 'title']} rows={3} value={page.directory.title}>
            {page.directory.title}
          </EditableText>

          <div className="charter-boats-grid">
            {state.charters.map((charter) => (
              <CharterBoatCard key={charter.slug} charter={charter} />
            ))}
          </div>
        </div>
      </section>

      <section className="charter-boats-safety">
        <div className="charter-boats-safety-inner">
          <EditableText as="h3" label="Safety Title" multiline path={['safety', 'title']} rows={3} value={page.safety.title}>
            {page.safety.title}
          </EditableText>

          <div className="charter-boats-safety-copy">
            {page.safety.sections.map((section, index) => (
              <div key={section.label}>
                <EditableText as="p" className="charter-boats-safety-label" label={`Safety Label ${index + 1}`} path={['safety', 'sections', index, 'label']} value={section.label}>
                  {section.label}
                </EditableText>
                <p>
                  <EditableText as="span" label={`Safety Paragraph ${index + 1}`} multiline path={['safety', 'sections', index, 'paragraph']} rows={4} value={section.paragraph}>
                    {section.paragraph}
                  </EditableText>{' '}
                  <EditableLink
                    destination={section.href}
                    destinationLabel="Link URL"
                    destinationPath={['safety', 'sections', index, 'href']}
                    external
                    label={section.href}
                    labelLabel="Link Text"
                    labelPath={['safety', 'sections', index, 'href']}
                  />
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </article>
  )
}
