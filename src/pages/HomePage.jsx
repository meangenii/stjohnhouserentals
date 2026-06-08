import { EditableBackgroundSection, EditableImage, EditableLink, EditableText } from '../components/AdminInlinePageEdit'
import { PropertyDirectorySection } from '../components/PropertyDirectorySection'
import { getContentImageSrc } from '../lib/contentAssets'
import { useStructuredPageContent } from '../lib/useSiteContent'

function HomeFeatureIcon({ kind }) {
  if (kind === 'selection') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect x="10" y="16" width="28" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <path d="M18 16v-3a6 6 0 0 1 12 0v3" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <path d="M16 23h16" fill="none" stroke="currentColor" strokeWidth="2.5" />
      </svg>
    )
  }

  if (kind === 'deals') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="10.5" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <path
          d="M24 11v4M24 33v4M37 24h-4M15 24h-4M32.5 15.5l-2.8 2.8M18.3 29.7l-2.8 2.8M32.5 32.5l-2.8-2.8M18.3 18.3l-2.8-2.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    )
  }

  if (kind === 'local') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path
          d="M24 10l4.8 9.7 10.7 1.6-7.7 7.5 1.8 10.6L24 34.2l-9.6 5.2 1.8-10.6-7.7-7.5 10.7-1.6Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <circle cx="24" cy="24" r="3.2" fill="currentColor" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path
        d="M14 33h20V19H14Zm4-14v-3.5A6 6 0 0 1 24 9.5a6 6 0 0 1 6 6V19"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M20 25h8M20 29h6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

export function HomePage() {
  const page = useStructuredPageContent('home')
  const heroImageUrl = getContentImageSrc(page.hero.image)
  const trustImageUrl = getContentImageSrc(page.trust.image)
  const discoverImageUrl = getContentImageSrc(page.discover.image)
  const aboutImageUrl = getContentImageSrc(page.about.image)
  const heroTitleLines = Array.isArray(page.hero?.titleLines)
    ? page.hero.titleLines.map((line) => String(line ?? '').trim()).filter(Boolean)
    : []

  return (
    <div className="home-page">
      <EditableBackgroundSection
        as="section"
        className="home-hero"
        image={page.hero.image}
        path={['hero', 'image']}
        style={heroImageUrl ? { backgroundImage: `url(${heroImageUrl})` } : undefined}
      >
        <div className="home-hero-overlay">
          <div className="home-hero-copy">
            <h1>
              {heroTitleLines.map((line, index) => (
                <EditableText as="span" key={`${index}-${line}`} label={`Hero Title Line ${index + 1}`} path={['hero', 'titleLines', index]} value={line}>
                  {line}
                </EditableText>
              ))}
            </h1>
            <EditableText as="p" label="Hero Lead" multiline path={['hero', 'lead']} rows={3} value={page.hero.lead}>
              {page.hero.lead}
            </EditableText>
          </div>
        </div>
      </EditableBackgroundSection>

      <PropertyDirectorySection
        title={
          <EditableText as="span" label="Directory Title" path={['directory', 'title']} value={page.directory.title}>
            {page.directory.title}
          </EditableText>
        }
      />

      <section className="page-section home-trust">
        <div className="home-trust-grid">
          <div className="home-trust-copy">
            <EditableText as="p" className="home-trust-eyebrow" label="Trust Eyebrow" path={['trust', 'eyebrow']} value={page.trust.eyebrow}>
              {page.trust.eyebrow}
            </EditableText>
            <EditableText as="h2" label="Trust Title" multiline path={['trust', 'title']} rows={3} value={page.trust.title}>
              {page.trust.title}
            </EditableText>
            <EditableText as="p" label="Trust Lead" multiline path={['trust', 'lead']} rows={4} value={page.trust.lead}>
              {page.trust.lead}
            </EditableText>
            <EditableLink
              className="home-trust-button"
              destination={page.trust.action.path}
              destinationLabel="Button Link"
              destinationPath={['trust', 'action', 'path']}
              label={page.trust.action.label}
              labelLabel="Button Text"
              labelPath={['trust', 'action', 'label']}
            />
          </div>

          <div className="home-trust-media">
            <EditableImage
              alt={page.trust.image.alt}
              className="home-trust-image"
              decoding="async"
              fetchPriority="low"
              image={page.trust.image}
              path={['trust', 'image']}
              loading="lazy"
              src={trustImageUrl}
            />
          </div>
        </div>
      </section>

      <section className="home-discover-band">
        <div className="page-section home-discover">
          <div className="home-discover-header">
            <EditableText as="h2" label="Discover Title" multiline path={['discover', 'title']} rows={3} value={page.discover.title}>
              {page.discover.title}
            </EditableText>
          </div>

          <div className="home-discover-grid">
            <div className="home-discover-media">
              <EditableImage
                alt={page.discover.image.alt}
                className="home-discover-image"
                decoding="async"
                fetchPriority="low"
                image={page.discover.image}
                path={['discover', 'image']}
                loading="lazy"
                src={discoverImageUrl}
              />
            </div>

            <div className="home-discover-features">
              {page.discover.features.map((item, index) => (
                <article className="home-discover-feature" key={`${index}-${item.title}`}>
                  <div className="home-discover-feature-icon">
                    <HomeFeatureIcon kind={item.kind} />
                  </div>
                  <EditableText as="h3" label={`Feature ${index + 1} Title`} path={['discover', 'features', index, 'title']} value={item.title}>
                    {item.title}
                  </EditableText>
                  <EditableText as="p" label={`Feature ${index + 1} Description`} multiline path={['discover', 'features', index, 'body']} rows={4} value={item.body}>
                    {item.body}
                  </EditableText>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="home-about-band">
        <div className="page-section home-about">
          <div className="home-about-grid">
            <div className="home-about-copy">
              <EditableText as="h2" label="About Title" multiline path={['about', 'title']} rows={3} value={page.about.title}>
                {page.about.title}
              </EditableText>
              <p>
                <EditableText as="span" label="About Intro" multiline path={['about', 'bodyIntro']} rows={4} value={page.about.bodyIntro}>
                  {page.about.bodyIntro}
                </EditableText>{' '}
                <EditableLink
                  className="home-about-link"
                  destination={page.about.bodyLink.href}
                  destinationLabel="Link URL"
                  destinationPath={['about', 'bodyLink', 'href']}
                  external
                  label={page.about.bodyLink.label}
                  labelLabel="Link Text"
                  labelPath={['about', 'bodyLink', 'label']}
                />{' '}
                <EditableText as="span" label="About Outro" multiline path={['about', 'bodyOutro']} rows={4} value={page.about.bodyOutro.trim()}>
                  {page.about.bodyOutro.trim()}
                </EditableText>
              </p>
            </div>

            <div className="home-about-media">
              <EditableImage
                alt={page.about.image.alt}
                className="home-about-image"
                decoding="async"
                fetchPriority="low"
                image={page.about.image}
                path={['about', 'image']}
                loading="lazy"
                src={aboutImageUrl}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
