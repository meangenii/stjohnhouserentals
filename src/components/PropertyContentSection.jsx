import { useNavigate } from '../lib/router'
import { formatPropertyRichHtml } from '../lib/formatPropertyRichHtml'
import { findInternalNavigationTarget } from '../lib/internalLinkNavigation'

export function PropertyContentSection({
  title,
  html,
  children,
  className = '',
  compactTail = false,
  listSections = false,
  preserveAuthoredRateFormatting = false,
  rateSection = false,
  reviewEntries = false,
  renderWhenEmpty = false,
  showHeader = true,
}) {
  const navigate = useNavigate()
  const normalizedHtml = formatPropertyRichHtml(html, {
    autoStyleRateLines: !(rateSection && preserveAuthoredRateFormatting),
    compactTail,
    listSections,
    rateSection,
    reviewEntries,
  })
  const hasHtml = Boolean(normalizedHtml.trim())
  const hasChildren = Boolean(children)
  const shouldRender = renderWhenEmpty || hasHtml || hasChildren

  if (!shouldRender) {
    return null
  }

  return (
    <section className={`property-template-section ${className}`.trim()}>
      {showHeader ? (
        <header className="property-template-section-header">
          <h2>{title}</h2>
          <div aria-hidden="true" className="property-template-rule" />
        </header>
      ) : null}

      {hasHtml ? (
        <div
          className="property-rich-copy"
          dangerouslySetInnerHTML={{ __html: normalizedHtml }}
          onClick={(event) => {
            const nextPath = findInternalNavigationTarget(event)

            if (nextPath) {
              event.preventDefault()
              navigate(nextPath)
            }
          }}
        />
      ) : children}
    </section>
  )
}
