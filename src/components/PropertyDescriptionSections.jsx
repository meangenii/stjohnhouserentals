import { extractPropertyTemplateSections } from '../lib/formatPropertyRichHtml'
import { PropertyContentSection } from './PropertyContentSection'

const PROPERTY_OPTIONAL_COPY_SECTIONS = [
  {
    className: 'property-template-section--rates',
    htmlKey: 'ratesHtml',
    key: 'rates',
    rateSection: true,
    showHeader: true,
    title: 'Rates',
  },
  {
    className: 'property-template-section--booking',
    htmlKey: 'bookingHtml',
    key: 'booking',
    showHeader: true,
    title: 'Booking',
  },
]

const PROPERTY_RATE_SECTION_KEYS = ['ratesHtml', 'ratesTableHtml']

function hasHtmlContent(value = '') {
  return Boolean(String(value ?? '').trim())
}

function getActiveRatesHtml(enabledDescriptionSections = [], ratesHtml = '', ratesTableHtml = '') {
  const explicitRateSectionKeys = Array.isArray(enabledDescriptionSections)
    ? enabledDescriptionSections.filter((sectionKey) => PROPERTY_RATE_SECTION_KEYS.includes(sectionKey))
    : []
  const explicitRateSectionKey = explicitRateSectionKeys[explicitRateSectionKeys.length - 1] ?? ''
  const textRatesHtml = String(ratesHtml ?? '').trim()
  const tableRatesHtml = String(ratesTableHtml ?? '').trim()

  if (explicitRateSectionKey === 'ratesTableHtml' && hasHtmlContent(tableRatesHtml)) {
    return tableRatesHtml
  }

  if (explicitRateSectionKey === 'ratesHtml' && hasHtmlContent(textRatesHtml)) {
    return textRatesHtml
  }

  return hasHtmlContent(textRatesHtml) ? textRatesHtml : tableRatesHtml
}

function derivePropertyStructuredSections({
  bookingHtml = '',
  descriptionHtml,
  enabledDescriptionSections = [],
  hasStructuredDescriptionSections = false,
  policyHtml = '',
  ratesHtml = '',
  ratesTableHtml = '',
}) {
  const enabledSectionSet = new Set(Array.isArray(enabledDescriptionSections) ? enabledDescriptionSections : [])
  const activeRatesHtml = getActiveRatesHtml(enabledDescriptionSections, ratesHtml, ratesTableHtml)
  const useStructuredSections =
    hasStructuredDescriptionSections || enabledSectionSet.size > 0 || [ratesHtml, ratesTableHtml, bookingHtml, policyHtml].some(hasHtmlContent)
  const sections = useStructuredSections
    ? {
        descriptionHtml: String(descriptionHtml ?? '').trim(),
        ratesHtml: String(activeRatesHtml ?? '').trim(),
        bookingHtml: String(bookingHtml ?? '').trim(),
        policyHtml: String(policyHtml ?? '').trim(),
        detailsHtml: '',
      }
    : extractPropertyTemplateSections(descriptionHtml)

  return { sections, useStructuredSections }
}

export function PropertyDescriptionSections({
  bookingHtml = '',
  descriptionHtml,
  enabledDescriptionSections = [],
  hasStructuredDescriptionSections = false,
  policyHtml = '',
  ratesHtml = '',
  ratesTableHtml = '',
  sectionConfig,
}) {
  const { sections, useStructuredSections } = derivePropertyStructuredSections({
    bookingHtml,
    descriptionHtml,
    enabledDescriptionSections,
    hasStructuredDescriptionSections,
    policyHtml,
    ratesHtml,
    ratesTableHtml,
  })
  const optionalSections = PROPERTY_OPTIONAL_COPY_SECTIONS.filter(
    (section) => hasHtmlContent(sections[section.htmlKey]),
  )
  const renderDescriptionWhenEmpty =
    sectionConfig.renderWhenEmpty &&
    optionalSections.length === 0 &&
    !hasHtmlContent(sections.policyHtml) &&
    !hasHtmlContent(sections.detailsHtml)

  return (
    <>
      <PropertyContentSection
        key="description"
        html={sections.descriptionHtml}
        renderWhenEmpty={renderDescriptionWhenEmpty}
        showHeader={sectionConfig.showHeader}
        title={sectionConfig.title}
      />

      {optionalSections.map((section) => (
        <PropertyContentSection
          className={section.className}
          html={sections[section.htmlKey]}
          key={section.key}
          preserveAuthoredRateFormatting={useStructuredSections && section.rateSection}
          rateSection={section.rateSection}
          showHeader={section.showHeader}
          title={section.title}
        />
      ))}
    </>
  )
}

export function PropertyPolicySection({
  bookingHtml = '',
  descriptionHtml,
  enabledDescriptionSections = [],
  hasStructuredDescriptionSections = false,
  policyHtml = '',
  ratesHtml = '',
  ratesTableHtml = '',
}) {
  const { sections } = derivePropertyStructuredSections({
    bookingHtml,
    descriptionHtml,
    enabledDescriptionSections,
    hasStructuredDescriptionSections,
    policyHtml,
    ratesHtml,
    ratesTableHtml,
  })

  return (
    <PropertyContentSection
      className="property-template-section--policy"
      html={sections.policyHtml}
      showHeader
      title="Rental and Cancellation Policy"
    />
  )
}

export function PropertyDetailsSection({
  bookingHtml = '',
  descriptionHtml,
  enabledDescriptionSections = [],
  hasStructuredDescriptionSections = false,
  policyHtml = '',
  ratesHtml = '',
  ratesTableHtml = '',
}) {
  const { sections } = derivePropertyStructuredSections({
    bookingHtml,
    descriptionHtml,
    enabledDescriptionSections,
    hasStructuredDescriptionSections,
    policyHtml,
    ratesHtml,
    ratesTableHtml,
  })

  return (
    <PropertyContentSection
      className="property-template-section--details"
      html={sections.detailsHtml}
      showHeader
      title="Additional Details"
    />
  )
}
