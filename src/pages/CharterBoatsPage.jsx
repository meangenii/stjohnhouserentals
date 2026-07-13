import { useEffect, useState } from 'react'
import { EditableBackgroundSection, EditableImage, EditableLink, EditableText } from '../components/AdminInlinePageEdit'
import { CharterBoatCard } from '../components/CharterBoatCard'
import { PageLoadingState } from '../components/PageLoadingState'
import { listCharters } from '../lib/charterRepository'
import { getContentImageSrc } from '../lib/contentAssets'
import { useStructuredPageContent } from '../lib/useSiteContent'

export function CharterBoatsPage() {
  const page = useStructuredPageContent('charterBoats')
  const [state, setState] = useState({ status: 'loading', charters: [], message: '' })

  useEffect(() => {
    let cancelled = false

    listCharters()
      .then((charters) => {
        if (!cancelled) {
          setState({ status: 'ready', charters })
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            status: 'error',
            charters: [],
            message: error instanceof Error ? error.message : 'Unable to load charter boats.',
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (!page) {
    return <PageLoadingState />
  }

  const heroImageUrl = getContentImageSrc(page.hero.image, { width: 1920, height: 920 })
  const introImageUrl = getContentImageSrc(page.intro.image, { width: 960, height: 820 })

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

          {state.status === 'loading' ? <p className="admin-empty">Loading charter boats...</p> : null}

          {state.status === 'error' ? <p className="admin-empty">{state.message}</p> : null}

          {state.status === 'ready' && state.charters.length > 0 ? (
            <div className="charter-boats-grid">
              {state.charters.map((charter) => (
                <CharterBoatCard key={charter.slug} charter={charter} />
              ))}
            </div>
          ) : state.status === 'ready' ? (
            <p className="admin-empty">No charter boats are available right now.</p>
          ) : null}
        </div>
      </section>

      <section className="charter-boats-safety">
        <div className="charter-boats-safety-inner">
          <EditableText as="h3" label="Safety Title" multiline path={['safety', 'title']} rows={3} value={page.safety.title}>
            {page.safety.title}
          </EditableText>

          <div className="charter-boats-safety-copy">
            {page.safety.sections.map((section, index) => (
              <div key={index}>
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
                    link={section}
                    linkPath={['safety', 'sections', index]}
                    label={section.linkLabel || `Visit the ${section.label} resource`}
                    labelLabel="Link Text"
                    labelPath={['safety', 'sections', index, 'linkLabel']}
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
