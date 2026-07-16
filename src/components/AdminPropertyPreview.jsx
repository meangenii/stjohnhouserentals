import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  richTextLinesToHtml,
  richTextValueToHtml,
  richTextValueToInlineHtml,
  richTextValueToLines,
  richTextValueToPlainText,
} from '../lib/richTextValue'
import {
  AIR_CONDITIONING_OPTIONS,
  buildPropertyShortDescription,
  getCustomPropertyShortDescriptionValue,
  getDerivedPropertyShortDescriptionLines,
  readShortDescriptionFeatureState,
  SHORT_DESCRIPTION_FEATURE_OPTIONS,
} from '../lib/propertyShortDescription'
import { AdminMediaManager } from './AdminMediaManager'
import { AdminRichTextEditor } from './AdminRichTextEditor'
import { AdminShortDescriptionEditor } from './AdminShortDescriptionEditor'
import { PropertyDetailView } from './PropertyDetailView'

const PROPERTY_DESCRIPTION_SECTION_ORDER = ['descriptionHtml', 'ratesHtml', 'ratesTableHtml', 'bookingHtml', 'policyHtml']
const PROPERTY_DESCRIPTION_RATE_SECTION_KEYS = ['ratesHtml', 'ratesTableHtml']

const PROPERTY_DESCRIPTION_RATE_SECTIONS = [
  {
    key: 'ratesHtml',
    modeLabel: 'Text',
    editorLabel: 'Rates',
    placement: 'After Main Description',
    storageClassName: 'property-description-section--rates',
    placeholder: 'Add seasonal rates, fees, and rate notes here.',
    defaultHtml: [
      '<p><strong>Property Weekly Rates</strong></p>',
      '<p><strong>High Season</strong></p>',
      '<p><strong>January 3 - April 14</strong></p>',
      '<p>(7 Night Minimum)</p>',
      '<p>1-4 Guests $0</p>',
      '<p><strong>Low Season</strong></p>',
      '<p><strong>April 15 - December 19</strong></p>',
      '<p>(7 Night Minimum)</p>',
      '<p>1-4 Guests $0</p>',
      '<p>+12.5% Hotel Tax</p>',
      '<p><strong>Note: Until confirmed, rates are subject to change without notice.</strong></p>',
    ].join(''),
  },
  {
    key: 'ratesTableHtml',
    modeLabel: 'Table',
    editorLabel: 'Rates Table',
    placement: 'After Main Description',
    storageClassName: 'property-description-section--rates-table',
    placeholder: 'Edit table cells directly.',
    defaultHtml: [
      '<table><thead><tr><th>Starting</th><th>Ending</th><th>Daily Rate</th></tr></thead><tbody>',
      '<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>',
      '<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>',
      '<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>',
      '</tbody></table>',
    ].join(''),
  },
]

const PROPERTY_DESCRIPTION_OPTIONAL_SECTIONS = [
  {
    key: 'bookingHtml',
    label: 'Booking',
    editorLabel: 'Booking Copy',
    placement: 'After Rates',
    storageClassName: 'property-description-section--booking',
    placeholder: 'Add booking contact, VRBO links, phone numbers, and email links here.',
    defaultHtml: [
      '<p><strong>Booking Contact:</strong></p>',
      '<p>Contact Name</p>',
      '<p>Company Name</p>',
      '<p><a href="mailto:booking@example.com">booking@example.com</a> Email us with your desired schedule and number of people in your party or Call Us</p>',
      '<p><a href="tel:3405551212">340-555-1212</a> <strong>Office/Reservations</strong></p>',
    ].join(''),
  },
  {
    key: 'policyHtml',
    label: 'Policy',
    editorLabel: 'Rental Policy',
    placement: 'After Booking',
    storageClassName: 'property-description-section--policy',
    placeholder: 'Add rental and cancellation policy details here.',
    defaultHtml: [
      '<p><strong>Rental and Cancellation Policy</strong></p>',
      '<p>50% deposit is required at the time of booking.</p>',
      '<p>Reservations within 60 days of arrival require 100% Booking Fees paid.</p>',
      '<p>Children are welcome.</p>',
      '<p>Check in 4:00pm - Check out 10:00am.</p>',
      '<p>Trip Cancellation Insurance is highly recommended year-round.</p>',
    ].join(''),
  },
]

const PROPERTY_DESCRIPTION_STORAGE_SECTIONS = [...PROPERTY_DESCRIPTION_RATE_SECTIONS, ...PROPERTY_DESCRIPTION_OPTIONAL_SECTIONS]
const PROPERTY_DESCRIPTION_STORAGE_SECTION_KEYS = PROPERTY_DESCRIPTION_STORAGE_SECTIONS.map((definition) => definition.key)

const PROPERTY_DESCRIPTION_STORAGE_CLASS_TO_SECTION = new Map(
  PROPERTY_DESCRIPTION_STORAGE_SECTIONS.map((definition) => [definition.storageClassName, definition.key]),
)

function PreviewField({ alignTop = false, children, inlineLabel = false, wide = false }) {
  return (
    <label
      className={[
        'admin-field',
        wide ? 'admin-field--wide' : '',
        inlineLabel ? 'admin-field--inline' : '',
        alignTop ? 'admin-field--inline-top' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </label>
  )
}

function PreviewInput({ disabled, inlineLabel = true, label, onChange, type = 'text', value, wide = false }) {
  return (
    <PreviewField inlineLabel={inlineLabel} wide={wide}>
      <span>{label}</span>
      <input disabled={disabled} onChange={(event) => onChange(event.target.value)} type={type} value={value ?? ''} />
    </PreviewField>
  )
}

function PreviewRichText({ collapsedFontSizeBehavior = 'selection', disabled, helperText = '', label, onChange, placeholder = '', value, wide = true }) {
  return (
    <div className={`admin-field admin-field--rich${wide ? ' admin-field--wide' : ''}`.trim()}>
      <AdminRichTextEditor
        collapsedFontSizeBehavior={collapsedFontSizeBehavior}
        compact
        disabled={disabled}
        helperText={helperText}
        label={label}
        onChange={onChange}
        placeholder={placeholder}
        value={value ?? ''}
      />
    </div>
  )
}

function PreviewRichTextLineList({ collapsedFontSizeBehavior = 'selection', disabled, helperText = '', label, onChange, placeholder = '', value, wide = true }) {
  return (
    <div className={`admin-field admin-field--rich${wide ? ' admin-field--wide' : ''}`.trim()}>
      <AdminRichTextEditor
        collapsedFontSizeBehavior={collapsedFontSizeBehavior}
        compact
        disabled={disabled}
        helperText={helperText}
        label={label}
        onChange={(nextValue) =>
          onChange(
            richTextValueToLines(nextValue, { preserveBlankLines: true })
              .map((line) => richTextValueToInlineHtml(line))
              .join('\n'),
          )
        }
        placeholder={placeholder}
        value={richTextLinesToHtml(getAmenityGroupItems(value, { preserveBlankLines: true }), { preserveBlankLines: true })}
      />
    </div>
  )
}

function EditSection({ actions = null, children, title }) {
  return (
    <section className="admin-property-preview-section">
      <div className="admin-property-preview-section-header admin-property-preview-section-header--split">
        <div>
          <h4>{title}</h4>
          <div aria-hidden="true" className="admin-property-preview-rule" />
        </div>
        {actions}
      </div>

      <div className="admin-property-preview-controls">{children}</div>
    </section>
  )
}

function getAmenityGroupItems(itemsText = '', { preserveBlankLines = false } = {}) {
  const lines = String(itemsText ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())

  return preserveBlankLines ? lines : lines.filter(Boolean)
}

function getReducedBedroomOptions(primaryBedrooms = 0) {
  const normalizedPrimaryBedrooms = Number.parseInt(String(primaryBedrooms ?? '').trim(), 10)

  if (!Number.isInteger(normalizedPrimaryBedrooms) || normalizedPrimaryBedrooms <= 1) {
    return []
  }

  return Array.from({ length: normalizedPrimaryBedrooms - 1 }, (_, index) => normalizedPrimaryBedrooms - index - 1)
}

function createPropertyDescriptionSections() {
  return PROPERTY_DESCRIPTION_SECTION_ORDER.reduce((sections, sectionKey) => {
    sections[sectionKey] = ''
    return sections
  }, {})
}

function getPropertyDescriptionElementText(element) {
  return String(element?.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasPropertyDescriptionHtmlContent(value = '') {
  const normalizedHtml = richTextValueToHtml(value).trim()

  if (!normalizedHtml) {
    return false
  }

  return /<table\b/i.test(normalizedHtml) || Boolean(richTextValueToPlainText(normalizedHtml))
}

function getActivePropertyRateSectionKey(enabledDescriptionSections = [], sections = {}) {
  const explicitRateSectionKeys = Array.isArray(enabledDescriptionSections)
    ? enabledDescriptionSections.filter((sectionKey) => PROPERTY_DESCRIPTION_RATE_SECTION_KEYS.includes(sectionKey))
    : []
  const explicitRateSectionKey = explicitRateSectionKeys[explicitRateSectionKeys.length - 1] ?? ''
  const hasTextRates = hasPropertyDescriptionHtmlContent(sections.ratesHtml)
  const hasTableRates = hasPropertyDescriptionHtmlContent(sections.ratesTableHtml)

  if (explicitRateSectionKey && hasPropertyDescriptionHtmlContent(sections[explicitRateSectionKey])) {
    return explicitRateSectionKey
  }

  if (hasTextRates) {
    return 'ratesHtml'
  }

  if (hasTableRates) {
    return 'ratesTableHtml'
  }

  return explicitRateSectionKey || 'ratesHtml'
}

function getPropertyRateSectionDefinition(sectionKey) {
  return PROPERTY_DESCRIPTION_RATE_SECTIONS.find((definition) => definition.key === sectionKey) ?? PROPERTY_DESCRIPTION_RATE_SECTIONS[0]
}

function normalizePropertyDescriptionRateSections(sections = {}, enabledDescriptionSections = []) {
  const activeRateSectionKey = getActivePropertyRateSectionKey(enabledDescriptionSections, sections)

  return {
    ...sections,
    ratesHtml: activeRateSectionKey === 'ratesHtml' ? String(sections.ratesHtml ?? '').trim() : '',
    ratesTableHtml: activeRateSectionKey === 'ratesTableHtml' ? String(sections.ratesTableHtml ?? '').trim() : '',
  }
}

function isPropertyRateTextStart(element, textContent) {
  if (!textContent || element?.tagName === 'TABLE') {
    return false
  }

  if (/(subject to change|hotel tax|booking contact|rental and cancellation policy|to book direct|please visit vrbo)/i.test(textContent)) {
    return false
  }

  if (!/\brates?\b/i.test(textContent) || textContent.length > 120 || /[.?!]\s*$/.test(textContent)) {
    return false
  }

  return (
    /^H[1-6]$/i.test(element?.tagName ?? '') ||
    Boolean(element?.querySelector?.('strong, b')) ||
    /\b(?:weekly|nightly|daily|base)\s+rates?\b/i.test(textContent)
  )
}

function isPropertyBookingStart(element, textContent) {
  if (!textContent || element?.tagName === 'TABLE') {
    return false
  }

  return /(booking contact|to book direct|please visit vrbo|to view more information, photos and reviews)/i.test(textContent)
}

function isPropertyPolicyStart(element, textContent) {
  return Boolean(textContent && /rental and cancellation policy/i.test(textContent))
}

function getPropertyDescriptionSectionForNode(node, currentSection) {
  if (node.nodeType !== 1) {
    return currentSection
  }

  const element = node
  const textContent = getPropertyDescriptionElementText(element)

  if (element.tagName === 'TABLE') {
    return 'ratesTableHtml'
  }

  if (isPropertyPolicyStart(element, textContent)) {
    return 'policyHtml'
  }

  if (isPropertyBookingStart(element, textContent)) {
    return 'bookingHtml'
  }

  if (isPropertyRateTextStart(element, textContent)) {
    return 'ratesHtml'
  }

  return currentSection
}

function getExplicitPropertyDescriptionSectionForNode(node) {
  if (node?.nodeType !== 1) {
    return ''
  }

  return (
    Array.from(node.classList ?? [])
      .map((className) => PROPERTY_DESCRIPTION_STORAGE_CLASS_TO_SECTION.get(className))
      .find(Boolean) ?? ''
  )
}

function appendPropertyDescriptionNode(documentNode, sectionRoot, node) {
  if (node.nodeType === 3) {
    const textContent = String(node.textContent ?? '').trim()

    if (!textContent) {
      return
    }

    const paragraph = documentNode.createElement('p')
    paragraph.textContent = textContent
    sectionRoot.append(paragraph)
    return
  }

  if (node.nodeType === 1) {
    sectionRoot.append(node)
  }
}

function appendPropertyDescriptionNodeContents(documentNode, sectionRoot, node) {
  Array.from(node.childNodes).forEach((childNode) => {
    appendPropertyDescriptionNode(documentNode, sectionRoot, childNode)
  })
}

function splitPropertyDescriptionHtml(value = '') {
  const normalizedHtml = richTextValueToHtml(value)
  const sections = createPropertyDescriptionSections()

  if (!normalizedHtml.trim() || typeof DOMParser === 'undefined') {
    sections.descriptionHtml = normalizedHtml
    return sections
  }

  const documentNode = new DOMParser().parseFromString(`<div>${normalizedHtml}</div>`, 'text/html')
  const root = documentNode.body.firstElementChild

  if (!root) {
    sections.descriptionHtml = normalizedHtml
    return sections
  }

  const sectionRoots = PROPERTY_DESCRIPTION_SECTION_ORDER.reduce((roots, sectionKey) => {
    roots[sectionKey] = documentNode.createElement('div')
    return roots
  }, {})
  let activeSection = 'descriptionHtml'

  Array.from(root.childNodes).forEach((node) => {
    const explicitSection = getExplicitPropertyDescriptionSectionForNode(node)

    if (explicitSection) {
      activeSection = explicitSection
      appendPropertyDescriptionNodeContents(documentNode, sectionRoots[explicitSection], node)
      return
    }

    activeSection = getPropertyDescriptionSectionForNode(node, activeSection)
    appendPropertyDescriptionNode(documentNode, sectionRoots[activeSection], node)
  })

  PROPERTY_DESCRIPTION_SECTION_ORDER.forEach((sectionKey) => {
    sections[sectionKey] = sectionRoots[sectionKey].innerHTML.trim()
  })

  return sections
}

function normalizeEnabledPropertyDescriptionSections(value, sections = {}) {
  const contentSectionKeys = PROPERTY_DESCRIPTION_STORAGE_SECTION_KEYS.filter((sectionKey) => hasPropertyDescriptionHtmlContent(sections[sectionKey]))
  const sourceKeys = Array.isArray(value) ? [...value, ...contentSectionKeys] : contentSectionKeys
  const activeRateSectionKey = sourceKeys.some((sectionKey) => PROPERTY_DESCRIPTION_RATE_SECTION_KEYS.includes(sectionKey))
    ? getActivePropertyRateSectionKey(value, sections)
    : ''
  let hasAddedActiveRateSection = false

  return Array.from(
    new Set(
      sourceKeys
        .map((sectionKey) => {
          if (!PROPERTY_DESCRIPTION_RATE_SECTION_KEYS.includes(sectionKey)) {
            return sectionKey
          }

          if (!activeRateSectionKey || hasAddedActiveRateSection) {
            return ''
          }

          hasAddedActiveRateSection = true
          return activeRateSectionKey
        })
        .filter((sectionKey) => PROPERTY_DESCRIPTION_STORAGE_SECTION_KEYS.includes(sectionKey)),
    ),
  )
}

function AdminPropertyDescriptionEditor({ disabled, onChange, value }) {
  const editorState = useMemo(() => {
    let nextSections

    if (value && typeof value === 'object') {
      nextSections = {
        descriptionHtml: String(value.descriptionHtml ?? '').trim(),
        ratesHtml: String(value.ratesHtml ?? '').trim(),
        ratesTableHtml: String(value.ratesTableHtml ?? '').trim(),
        bookingHtml: String(value.bookingHtml ?? '').trim(),
        policyHtml: String(value.policyHtml ?? '').trim(),
      }
    } else {
      nextSections = splitPropertyDescriptionHtml(value)
    }

    return {
      sections: nextSections,
      enabledDescriptionSections: normalizeEnabledPropertyDescriptionSections(value?.enabledDescriptionSections, nextSections),
    }
  }, [value])
  const { enabledDescriptionSections, sections } = editorState
  const activeRatesSectionKey = getActivePropertyRateSectionKey(enabledDescriptionSections, sections)
  const activeRatesSection = getPropertyRateSectionDefinition(activeRatesSectionKey)
  const hasRatesContent = PROPERTY_DESCRIPTION_RATE_SECTION_KEYS.some((sectionKey) => hasPropertyDescriptionHtmlContent(sections[sectionKey]))

  function emitSectionChange(nextSections, nextEnabledDescriptionSections = enabledDescriptionSections) {
    const normalizedSections = normalizePropertyDescriptionRateSections(nextSections, nextEnabledDescriptionSections)

    onChange({
      ...normalizedSections,
      enabledDescriptionSections: normalizeEnabledPropertyDescriptionSections(nextEnabledDescriptionSections, normalizedSections),
    })
  }

  function updateSection(sectionKey, nextValue) {
    const nextSections = {
      ...sections,
      [sectionKey]: nextValue,
    }
    const isRateSection = PROPERTY_DESCRIPTION_RATE_SECTION_KEYS.includes(sectionKey)
    const shouldEnableOptionalSection = PROPERTY_DESCRIPTION_STORAGE_SECTION_KEYS.includes(sectionKey)
    const existingEnabledDescriptionSections = isRateSection
      ? enabledDescriptionSections.filter((enabledSectionKey) => !PROPERTY_DESCRIPTION_RATE_SECTION_KEYS.includes(enabledSectionKey))
      : enabledDescriptionSections

    if (isRateSection) {
      PROPERTY_DESCRIPTION_RATE_SECTION_KEYS.filter((rateSectionKey) => rateSectionKey !== sectionKey).forEach((rateSectionKey) => {
        nextSections[rateSectionKey] = ''
      })
    }

    const nextEnabledDescriptionSections = shouldEnableOptionalSection
      ? Array.from(new Set([...existingEnabledDescriptionSections, sectionKey]))
      : existingEnabledDescriptionSections

    emitSectionChange(nextSections, nextEnabledDescriptionSections)
  }

  function removeSection(definition) {
    const nextSections = {
      ...sections,
      [definition.key]: '',
    }
    const nextEnabledDescriptionSections = enabledDescriptionSections.filter((sectionKey) => sectionKey !== definition.key)

    emitSectionChange(nextSections, nextEnabledDescriptionSections)
  }

  function selectRatesMode(nextSectionKey) {
    if (nextSectionKey === activeRatesSectionKey || !PROPERTY_DESCRIPTION_RATE_SECTION_KEYS.includes(nextSectionKey)) {
      return
    }

    const nextSections = {
      ...sections,
      ratesHtml: nextSectionKey === 'ratesHtml' ? sections.ratesHtml : '',
      ratesTableHtml: nextSectionKey === 'ratesTableHtml' ? sections.ratesTableHtml : '',
    }
    const nextEnabledDescriptionSections = [
      ...enabledDescriptionSections.filter((sectionKey) => !PROPERTY_DESCRIPTION_RATE_SECTION_KEYS.includes(sectionKey)),
      nextSectionKey,
    ]

    emitSectionChange(nextSections, nextEnabledDescriptionSections)
  }

  function removeRatesSection() {
    const nextSections = {
      ...sections,
      ratesHtml: '',
      ratesTableHtml: '',
    }
    const nextEnabledDescriptionSections = enabledDescriptionSections.filter(
      (sectionKey) => !PROPERTY_DESCRIPTION_RATE_SECTION_KEYS.includes(sectionKey),
    )

    emitSectionChange(nextSections, nextEnabledDescriptionSections)
  }

  return (
    <div className="admin-property-description-editor">
      <div className="admin-property-description-slot admin-property-description-slot--main">
        <AdminRichTextEditor
          disabled={disabled}
          label="Main Description"
          onChange={(nextValue) => updateSection('descriptionHtml', nextValue)}
          placeholder="Write the property description here."
          value={sections.descriptionHtml}
        />
      </div>

      <div className="admin-property-description-slot">
        <AdminRichTextEditor
          compact
          disabled={disabled}
          headerActions={
            <div className="admin-property-description-rate-actions">
              <div aria-label="Rates format" className="admin-property-description-rate-mode" role="group">
                {PROPERTY_DESCRIPTION_RATE_SECTIONS.map((definition) => (
                  <button
                    aria-pressed={activeRatesSectionKey === definition.key}
                    className={`admin-property-description-rate-mode-button${
                      activeRatesSectionKey === definition.key ? ' admin-property-description-rate-mode-button--active' : ''
                    }`}
                    disabled={disabled}
                    key={definition.key}
                    onClick={() => selectRatesMode(definition.key)}
                    type="button"
                  >
                    {definition.modeLabel}
                  </button>
                ))}
              </div>
              {hasRatesContent ? (
                <button className="button-link button-link--ghost admin-action" disabled={disabled} type="button" onClick={removeRatesSection}>
                  Remove Section
                </button>
              ) : null}
            </div>
          }
          label={activeRatesSection.editorLabel}
          onChange={(nextValue) => updateSection(activeRatesSectionKey, nextValue)}
          placeholder={activeRatesSection.placeholder}
          sourceRows={activeRatesSectionKey === 'ratesTableHtml' ? 10 : undefined}
          value={sections[activeRatesSectionKey]}
        />
      </div>

      {PROPERTY_DESCRIPTION_OPTIONAL_SECTIONS.map((definition) => {
        const hasContent = hasPropertyDescriptionHtmlContent(sections[definition.key])

        return (
          <div className="admin-property-description-slot" key={definition.key}>
            <AdminRichTextEditor
              compact
              disabled={disabled}
              headerActions={
                hasContent ? (
                  <button className="button-link button-link--ghost admin-action" disabled={disabled} type="button" onClick={() => removeSection(definition)}>
                    Remove Section
                  </button>
                ) : null
              }
              label={definition.editorLabel}
              onChange={(nextValue) => updateSection(definition.key, nextValue)}
              placeholder={definition.placeholder}
              sourceRows={definition.key === 'ratesTableHtml' ? 10 : undefined}
              value={sections[definition.key]}
            />
          </div>
        )
      })}
    </div>
  )
}

export function AdminPropertyPreview({
  disabled = false,
  editable = false,
  formState = null,
  locationOptions = [],
  mode = 'edit',
  onAddAmenityGroup,
  onAddGalleryFolderImages,
  onAddGalleryImage,
  onAddReviewEntry,
  onAmenityGroupChange,
  onFieldChange,
  onGalleryImageChange,
  onMoveGalleryImage,
  onRemoveAmenityGroup,
  onRemoveGalleryImage,
  onRemoveReviewEntry,
  onReviewEntryChange,
  property,
}) {
  const [amenitiesEditorExpanded, setAmenitiesEditorExpanded] = useState(false)
  // Local like the two accordions above (not lifted to AdminPage) so it resets when
  // this component remounts for a different property instead of leaking across records.
  const [galleryEditorExpanded, setGalleryEditorExpanded] = useState(false)
  const [expandedAmenityGroupId, setExpandedAmenityGroupId] = useState(null)
  const [heroMediaEditorOpen, setHeroMediaEditorOpen] = useState(false)
  const [galleryAddImagePickerOpen, setGalleryAddImagePickerOpen] = useState(false)
  const [galleryFolderPickerOpen, setGalleryFolderPickerOpen] = useState(false)
  const [selectedGalleryImageId, setSelectedGalleryImageId] = useState(null)
  const galleryEditorId = useId()
  const amenitiesEditorId = useId()
  const hasTrackedAmenityGroupsRef = useRef(false)
  const previousAmenityGroupIdsRef = useRef([])
  const amenityCardRefs = useRef(new Map())
  const pendingAmenityViewportRef = useRef(null)
  const reducedBedroomOptions = getReducedBedroomOptions(formState?.bedrooms)
  const selectedAlternateBedroomCounts = Array.isArray(formState?.alternateBedroomCounts)
    ? formState.alternateBedroomCounts
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    : []
  const shortDescriptionFeatureState = readShortDescriptionFeatureState(formState?.shortDescription ?? '')
  const shortDescriptionLockedLines = getDerivedPropertyShortDescriptionLines(formState ?? {}, formState?.shortDescription ?? '')
  const shortDescriptionCustomValue = getCustomPropertyShortDescriptionValue(formState?.shortDescription ?? '', formState ?? {})

  function toggleAlternateBedroomCount(bedroomCount, isChecked) {
    const nextCounts = isChecked
      ? [...selectedAlternateBedroomCounts, bedroomCount]
      : selectedAlternateBedroomCounts.filter((value) => value !== bedroomCount)

    onFieldChange('alternateBedroomCounts', nextCounts)
  }

  function updateShortDescriptionFeatureState(nextFeatureState) {
    if (!formState) {
      return
    }

    onFieldChange(
      'shortDescription',
      buildPropertyShortDescription(formState, {
        customValue: shortDescriptionCustomValue,
        featureState: nextFeatureState,
      }),
    )
  }

  function toggleShortDescriptionFeature(featureId, isChecked) {
    updateShortDescriptionFeatureState({
      ...shortDescriptionFeatureState,
      [featureId]: isChecked,
    })
  }

  function toggleAirConditioningFeature(isChecked) {
    updateShortDescriptionFeatureState({
      ...shortDescriptionFeatureState,
      airConditioning: isChecked ? shortDescriptionFeatureState.airConditioning || 'whole-house' : '',
    })
  }

  function changeAirConditioningType(nextValue) {
    updateShortDescriptionFeatureState({
      ...shortDescriptionFeatureState,
      airConditioning: nextValue,
    })
  }

  function handleToggleGalleryEditor() {
    if (galleryEditorExpanded) {
      setGalleryAddImagePickerOpen(false)
      setGalleryFolderPickerOpen(false)
      setSelectedGalleryImageId(null)
    }

    setGalleryEditorExpanded((currentState) => !currentState)
  }

  function registerAmenityCard(groupId, node) {
    if (!groupId) {
      return
    }

    if (node) {
      amenityCardRefs.current.set(groupId, node)
      return
    }

    amenityCardRefs.current.delete(groupId)
  }

  function preserveAmenityViewport(groupId) {
    if (!groupId || typeof window === 'undefined') {
      pendingAmenityViewportRef.current = null
      return
    }

    const card = amenityCardRefs.current.get(groupId)

    if (!card) {
      pendingAmenityViewportRef.current = null
      return
    }

    pendingAmenityViewportRef.current = {
      groupId,
      top: card.getBoundingClientRect().top,
    }
  }

  function toggleAmenityGroupEditor(groupId) {
    preserveAmenityViewport(groupId)
    setExpandedAmenityGroupId((currentValue) => (currentValue === groupId ? null : groupId))
  }

  useEffect(() => {
    const groupIds = Array.isArray(formState?.amenityGroups)
      ? formState.amenityGroups.map((group) => group?.id).filter(Boolean)
      : []

    if (!hasTrackedAmenityGroupsRef.current) {
      hasTrackedAmenityGroupsRef.current = true
      previousAmenityGroupIdsRef.current = groupIds
      return
    }

    const previousIds = previousAmenityGroupIdsRef.current
    const addedGroupIds = groupIds.filter((groupId) => !previousIds.includes(groupId))

    if (addedGroupIds.length > 0) {
      setAmenitiesEditorExpanded(true)
      setExpandedAmenityGroupId(addedGroupIds[addedGroupIds.length - 1])
    } else if (expandedAmenityGroupId && !groupIds.includes(expandedAmenityGroupId)) {
      setExpandedAmenityGroupId(groupIds[0] ?? null)
    }

    previousAmenityGroupIdsRef.current = groupIds
  }, [expandedAmenityGroupId, formState?.amenityGroups])

  useLayoutEffect(() => {
    if (typeof window === 'undefined') {
      pendingAmenityViewportRef.current = null
      return
    }

    const pendingViewport = pendingAmenityViewportRef.current

    if (!pendingViewport) {
      return
    }

    pendingAmenityViewportRef.current = null

    const card = amenityCardRefs.current.get(pendingViewport.groupId)

    if (!card) {
      return
    }

    const nextTop = card.getBoundingClientRect().top
    const scrollDelta = nextTop - pendingViewport.top

    if (Math.abs(scrollDelta) > 1) {
      window.scrollBy({
        top: scrollDelta,
        left: 0,
        behavior: 'auto',
      })
    }
  }, [amenitiesEditorExpanded, expandedAmenityGroupId, formState?.amenityGroups])

  const selectedGalleryImage =
    selectedGalleryImageId && Array.isArray(formState?.galleryImages)
      ? formState.galleryImages.find((image) => image?.id === selectedGalleryImageId) ?? null
      : null
  const selectedGalleryImageIndex =
    selectedGalleryImageId && Array.isArray(formState?.galleryImages)
      ? formState.galleryImages.findIndex((image) => image?.id === selectedGalleryImageId)
      : -1
  const detailLine = [property?.bedroomLabel, property?.maxGuests ? `${property.maxGuests} guests` : '', property?.location]
    .filter(Boolean)
    .join(' | ')
  const hasEditableForm = editable && Boolean(formState)
  const effectiveMode = hasEditableForm ? (mode === 'preview' ? 'preview' : 'edit') : 'preview'
  const amenityGroupCount = Array.isArray(formState?.amenityGroups) ? formState.amenityGroups.length : 0

  return (
    <aside className="admin-property-preview">
      <div className="admin-property-preview-frame">
        <div className="admin-property-preview-summary">
          <div className="admin-property-preview-title">
            <h3>{property?.name || 'Untitled Property'}</h3>
            {detailLine ? <p>{detailLine}</p> : null}
            <p>{property?.active !== false ? 'Will be visible when published' : 'Will stay hidden when published'}</p>
          </div>
        </div>

        {effectiveMode === 'preview' ? (
          <div className="admin-property-live-preview">
            <PropertyDetailView property={property} />
          </div>
        ) : null}

        {hasEditableForm && effectiveMode === 'edit' ? (
          <div className="admin-property-preview-body">
            <EditSection title="Basic Info">
              <div className="admin-preview-field-grid admin-preview-field-grid--tight">
                <PreviewInput disabled={disabled} label="Property Name" onChange={(value) => onFieldChange('name', value)} value={formState.name} />
                <PreviewInput disabled={disabled} label="Bedrooms" onChange={(value) => onFieldChange('bedrooms', value)} type="number" value={formState.bedrooms} />
                <PreviewInput disabled={disabled} label="Bathrooms" onChange={(value) => onFieldChange('bathrooms', value)} type="number" value={formState.bathrooms} />
                <PreviewInput disabled={disabled} label="Max Guests" onChange={(value) => onFieldChange('maxGuests', value)} type="number" value={formState.maxGuests} />
                <PreviewInput disabled={disabled} label="Location" onChange={(value) => onFieldChange('location', value)} value={formState.location} wide />
                <PreviewInput disabled={disabled} label="Contact Name" onChange={(value) => onFieldChange('bookingContactName', value)} value={formState.bookingContactName} wide />
                <PreviewInput disabled={disabled} label="Contact Email" onChange={(value) => onFieldChange('bookingEmail', value)} type="email" value={formState.bookingEmail} />
                <PreviewInput disabled={disabled} label="Contact Phone" onChange={(value) => onFieldChange('bookingPhone', value)} type="tel" value={formState.bookingPhone} />
                <label className="admin-field admin-field--wide">
                  <span>Reduced Bedroom Availability</span>
                  <div className="admin-preview-checkbox">
                    <input
                      checked={Boolean(formState.rentFewerRooms)}
                      disabled={disabled || reducedBedroomOptions.length === 0}
                      onChange={(event) => onFieldChange('rentFewerRooms', event.target.checked)}
                      type="checkbox"
                    />
                    <strong>Rent fewer rooms</strong>
                  </div>
                  {Boolean(formState.rentFewerRooms) && reducedBedroomOptions.length > 0 ? (
                    <div className="admin-property-preview-bedroom-options">
                      <span className="admin-property-preview-bedroom-options-label">Also show this property in:</span>
                      <div className="admin-property-preview-bedroom-option-list">
                        {reducedBedroomOptions.map((bedroomCount) => (
                          <label className="admin-checkbox-field" key={`reduced-bedroom-${bedroomCount}`}>
                            <input
                              checked={selectedAlternateBedroomCounts.includes(bedroomCount)}
                              disabled={disabled}
                              onChange={(event) => toggleAlternateBedroomCount(bedroomCount, event.target.checked)}
                              type="checkbox"
                            />
                            <span>{bedroomCount} Bedroom{bedroomCount === 1 ? '' : 's'}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </label>
              </div>
            </EditSection>

          <EditSection title="Hero Image">
            <div className="admin-property-hero-media-layout">
              <div className="admin-image-thumb-shell">
                {formState.heroImageUrl ? (
                  <div className="admin-image-thumb">
                    <img alt={formState.heroImageAlt || formState.name || 'Hero image'} loading="lazy" src={formState.heroImageUrl} />
                  </div>
                ) : (
                  <div className="admin-image-placeholder">Choose a hero image to preview it here.</div>
                )}

                <button
                  aria-pressed={heroMediaEditorOpen}
                  className={`button-link button-link--secondary admin-action admin-image-thumb-action${
                    heroMediaEditorOpen ? ' admin-image-thumb-action--active' : ''
                  }`}
                  disabled={disabled}
                  title="Edit hero image from media library"
                  type="button"
                  onClick={() => setHeroMediaEditorOpen(true)}
                >
                  <span aria-hidden="true">✎</span>
                  <span className="visually-hidden">Edit hero image from media library</span>
                </button>
              </div>

              <div className="admin-image-card-fields">
                <div className="admin-preview-field-grid">
                  <PreviewInput
                    disabled={disabled}
                    label="Manual Hero Image URL"
                    onChange={(value) => onFieldChange('heroImageUrl', value)}
                    type="url"
                    value={formState.heroImageUrl}
                    wide
                  />
                  <PreviewInput disabled={disabled} label="Hero Image Alt Text" onChange={(value) => onFieldChange('heroImageAlt', value)} value={formState.heroImageAlt} wide />
                </div>
              </div>
            </div>

            {heroMediaEditorOpen ? (
              <div className="admin-property-hero-media-editor">
                <div className="admin-property-gallery-media-editor-bar">
                  <strong>Editing hero image</strong>
                  <button className="button-link button-link--ghost admin-action" disabled={disabled} type="button" onClick={() => setHeroMediaEditorOpen(false)}>
                    Done
                  </button>
                </div>

                <AdminMediaManager
                  currentUrl={formState.heroImageUrl}
                  defaultOpen
                  disabled={disabled}
                  onClear={() => onFieldChange('heroImageUrl', '')}
                  onRequestClose={() => setHeroMediaEditorOpen(false)}
                  onSelect={(nextUrl) => onFieldChange('heroImageUrl', nextUrl)}
                  preferredOwnerKey={formState.slug}
                  preferredOwnerName={formState.name}
                  preferredOwnerType="property"
                  showToggle={false}
                  title="Media Library"
                />
              </div>
            ) : null}
          </EditSection>

          <EditSection title="Short Description">
            <div className="admin-preview-field-grid">
              <fieldset className="admin-field admin-field--wide admin-property-summary-features">
                <legend>Summary Amenities</legend>
                <div className="admin-property-summary-feature-grid">
                  {SHORT_DESCRIPTION_FEATURE_OPTIONS.map((option) => (
                    <label className="admin-checkbox-field" key={option.id}>
                      <input
                        checked={Boolean(shortDescriptionFeatureState[option.id])}
                        disabled={disabled}
                        onChange={(event) => toggleShortDescriptionFeature(option.id, event.target.checked)}
                        type="checkbox"
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                  <div className="admin-property-summary-air-conditioning">
                    <label className="admin-checkbox-field">
                      <input
                        checked={Boolean(shortDescriptionFeatureState.airConditioning)}
                        disabled={disabled}
                        onChange={(event) => toggleAirConditioningFeature(event.target.checked)}
                        type="checkbox"
                      />
                      <span>Air Conditioning</span>
                    </label>
                    {shortDescriptionFeatureState.airConditioning ? (
                      <div className="admin-property-summary-air-options">
                        {AIR_CONDITIONING_OPTIONS.map((option) => (
                          <label className="admin-checkbox-field" key={option.value}>
                            <input
                              checked={shortDescriptionFeatureState.airConditioning === option.value}
                              disabled={disabled}
                              name="property-summary-air-conditioning"
                              onChange={() => changeAirConditioningType(option.value)}
                              type="radio"
                              value={option.value}
                            />
                            <span>{option.label}</span>
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </fieldset>
              <AdminShortDescriptionEditor
                disabled={disabled}
                label="Short Description"
                locationOptions={locationOptions}
                locationValue={formState.location}
                lockedLines={shortDescriptionLockedLines}
                onChange={(value) =>
                  onFieldChange(
                    'shortDescription',
                    buildPropertyShortDescription(formState, {
                      customValue: value,
                      featureState: shortDescriptionFeatureState,
                    }),
                  )
                }
                onLocationChange={(value) => onFieldChange('location', value)}
                placeholder="Add any extra short description lines here"
                value={shortDescriptionCustomValue}
                wide
              />
            </div>
          </EditSection>

          <EditSection title="Description, Rates & Booking Copy">
            <AdminPropertyDescriptionEditor
              disabled={disabled}
              onChange={(nextSections) => onFieldChange(nextSections)}
              value={{
                descriptionHtml: formState.descriptionHtml,
                ratesHtml: formState.ratesHtml,
                ratesTableHtml: formState.ratesTableHtml,
                bookingHtml: formState.bookingHtml,
                policyHtml: formState.policyHtml,
                enabledDescriptionSections: formState.enabledDescriptionSections,
              }}
            />
          </EditSection>

          <EditSection title="Calendar">
            <div className="admin-preview-field-grid">
              <PreviewInput
                disabled={disabled}
                label="Calendar URL (.ics)"
                onChange={(value) => onFieldChange('calendarUrl', value)}
                type="url"
                value={formState.calendarUrl}
                wide
              />
              <p className="admin-note admin-field--wide">
                Paste the property's iCal export link (VRBO, Streamline, Airbnb, etc.) to show a live availability calendar on the
                property page. Leave blank to show the contact-for-availability fallback.
              </p>
            </div>
          </EditSection>

          <EditSection
            actions={
              <div className="admin-inline-actions">
                <button
                  aria-controls={amenitiesEditorId}
                  aria-expanded={amenitiesEditorExpanded}
                  className="button-link button-link--ghost admin-action"
                  disabled={disabled}
                  type="button"
                  onClick={() => {
                    setAmenitiesEditorExpanded((currentValue) => {
                      const nextValue = !currentValue

                      if (nextValue && !expandedAmenityGroupId) {
                        setExpandedAmenityGroupId(formState?.amenityGroups?.[0]?.id ?? null)
                      }

                      return nextValue
                    })
                  }}
                >
                  {amenitiesEditorExpanded ? 'Hide editor' : 'Edit categories'}
                </button>
                <button className="button-link button-link--ghost admin-action" disabled={disabled} onClick={onAddAmenityGroup} type="button">
                  Add Category
                </button>
              </div>
            }
            title="Amenities"
          >
            {amenitiesEditorExpanded ? (
              <div className="admin-collection-list" id={amenitiesEditorId}>
                {formState.amenityGroups.map((group, groupIndex) => {
                  const itemCount = getAmenityGroupItems(group.itemsText).length
                  const isExpanded = expandedAmenityGroupId === group.id
                  const categoryLabel = richTextValueToPlainText(group.title) || `Category ${groupIndex + 1}`
                  const itemCountLabel = `${itemCount} item${itemCount === 1 ? '' : 's'}`

                  return (
                    <div
                      className="admin-collection-card admin-collection-card--compact"
                      key={group.id}
                      ref={(node) => registerAmenityCard(group.id, node)}
                    >
                      <div className="admin-collection-card-header">
                        <div className="admin-collection-card-summary">
                          <strong>{categoryLabel}</strong>
                          <span>{itemCountLabel}</span>
                        </div>

                        <div className="admin-inline-actions">
                          <button
                            aria-expanded={isExpanded}
                            className="button-link button-link--ghost admin-action"
                            disabled={disabled}
                            type="button"
                            onClick={() => toggleAmenityGroupEditor(group.id)}
                          >
                            {isExpanded ? 'Done' : 'Edit'}
                          </button>
                          <button
                            className="button-link button-link--ghost admin-action"
                            disabled={disabled}
                            type="button"
                            onClick={() => onRemoveAmenityGroup(group.id)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>

                      {isExpanded ? (
                        <div className="admin-compact-field-grid">
                          <PreviewRichText
                            collapsedFontSizeBehavior="block"
                            disabled={disabled}
                            label="Category"
                            onChange={(value) => onAmenityGroupChange(group.id, 'title', richTextValueToInlineHtml(value))}
                            value={group.title}
                          />
                          <PreviewRichTextLineList
                            collapsedFontSizeBehavior="block"
                            disabled={disabled}
                            helperText="Press Enter to create the next amenity line."
                            label="Items"
                            onChange={(value) => onAmenityGroupChange(group.id, 'itemsText', value)}
                            placeholder="One bullet per line&#10;Air conditioning&#10;Full kitchen&#10;Private pool"
                            value={group.itemsText}
                          />
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="admin-empty">{`${amenityGroupCount} categor${amenityGroupCount === 1 ? 'y' : 'ies'} configured.`}</p>
            )}
          </EditSection>

          <EditSection
            actions={
              <button className="button-link button-link--ghost admin-action" disabled={disabled} onClick={onAddReviewEntry} type="button">
                Add Review
              </button>
            }
            title="Reviews"
          >
            <div className="admin-collection-list">
              {formState.reviewEntries.map((entry) => (
                <div className="admin-collection-card" key={entry.id}>
                  <PreviewRichText disabled={disabled} label="Review Text" onChange={(value) => onReviewEntryChange(entry.id, 'quote', value)} value={entry.quote} />
                  <PreviewInput disabled={disabled} label="Author" onChange={(value) => onReviewEntryChange(entry.id, 'author', value)} value={entry.author} />
                  <button className="button-link button-link--ghost admin-action" disabled={disabled} onClick={() => onRemoveReviewEntry(entry.id)} type="button">
                    Remove Review
                  </button>
                </div>
              ))}
            </div>
          </EditSection>

          <EditSection
            actions={
              <div className="admin-inline-actions">
                <button
                  aria-controls={galleryEditorId}
                  aria-expanded={galleryEditorExpanded}
                  className="button-link button-link--ghost admin-action"
                  disabled={disabled}
                  type="button"
                  onClick={handleToggleGalleryEditor}
                >
                  {galleryEditorExpanded ? 'Hide editor' : 'Expand editor'}
                </button>
                {galleryEditorExpanded ? (
                  <button className="button-link button-link--ghost admin-action" disabled={disabled} onClick={() => setGalleryFolderPickerOpen(true)} type="button">
                    Add folder
                  </button>
                ) : null}
                {galleryEditorExpanded ? (
                  <button
                    className="button-link button-link--ghost admin-action"
                    disabled={disabled}
                    onClick={() => setGalleryAddImagePickerOpen(true)}
                    type="button"
                  >
                    Add Image
                  </button>
                ) : null}
              </div>
            }
            title="Gallery Images"
          >
            <div id={galleryEditorId}>
              {galleryEditorExpanded ? (
                <div className="admin-image-grid">
                  {formState.galleryImages.length === 0 ? <p className="admin-empty">No gallery images yet.</p> : null}

                  {formState.galleryImages.map((image, index) => (
                    <div className="admin-image-card admin-image-card--property-gallery" key={image.id}>
                      <div className="admin-image-card-header">
                        <strong className="admin-image-card-label">Image {index + 1}</strong>
                        <div className="admin-inline-actions">
                          <button className="button-link button-link--ghost admin-action" disabled={disabled || index === 0} onClick={() => onMoveGalleryImage(image.id, -1)} type="button">
                            Earlier
                          </button>
                          <button
                            className="button-link button-link--ghost admin-action"
                            disabled={disabled || index === formState.galleryImages.length - 1}
                            onClick={() => onMoveGalleryImage(image.id, 1)}
                            type="button"
                          >
                            Later
                          </button>
                          <button className="button-link button-link--ghost admin-action" disabled={disabled} onClick={() => onRemoveGalleryImage(image.id)} type="button">
                            Remove
                          </button>
                        </div>
                      </div>

                      <div className="admin-image-card-layout">
                        <div className="admin-image-thumb-shell">
                          {image.url ? (
                            <div className="admin-image-thumb">
                              <img alt={image.alt || `Property image ${index + 1}`} loading="lazy" src={image.url} />
                            </div>
                          ) : (
                            <div className="admin-image-placeholder">Add an image URL to preview it here.</div>
                          )}

                          <button
                            aria-pressed={selectedGalleryImageId === image.id}
                            className={`button-link button-link--secondary admin-action admin-image-thumb-action${
                              selectedGalleryImageId === image.id ? ' admin-image-thumb-action--active' : ''
                            }`}
                            disabled={disabled}
                            title={`Edit image ${index + 1} from media library`}
                            type="button"
                            onClick={() => setSelectedGalleryImageId(image.id)}
                          >
                            <span aria-hidden="true">✎</span>
                            <span className="visually-hidden">{`Edit image ${index + 1} from media library`}</span>
                          </button>
                        </div>

                        <div className="admin-image-card-fields">
                          <div className="admin-compact-field-grid admin-compact-field-grid--gallery">
                            <PreviewInput
                              disabled={disabled}
                              inlineLabel
                              label="URL"
                              onChange={(value) => onGalleryImageChange(image.id, 'url', value)}
                              type="url"
                              value={image.url}
                              wide
                            />
                            <PreviewInput
                              disabled={disabled}
                              inlineLabel
                              label="Alt"
                              onChange={(value) => onGalleryImageChange(image.id, 'alt', value)}
                              value={image.alt}
                            />
                            <PreviewInput
                              disabled={disabled}
                              inlineLabel
                              label="Title"
                              onChange={(value) => onGalleryImageChange(image.id, 'title', value)}
                              value={image.title}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {selectedGalleryImage ? (
                    <div className="admin-property-gallery-media-editor">
                      <div className="admin-property-gallery-media-editor-bar">
                        <strong>{`Editing image ${selectedGalleryImageIndex + 1}`}</strong>
                        <button
                          className="button-link button-link--ghost admin-action"
                          disabled={disabled}
                          type="button"
                          onClick={() => setSelectedGalleryImageId(null)}
                        >
                          Done
                        </button>
                      </div>

                      <AdminMediaManager
                        currentUrl={selectedGalleryImage.url}
                        defaultOpen
                        disabled={disabled}
                        onClear={() => onGalleryImageChange(selectedGalleryImage.id, 'url', '')}
                        onRequestClose={() => setSelectedGalleryImageId(null)}
                        onSelect={(nextUrl) => onGalleryImageChange(selectedGalleryImage.id, 'url', nextUrl)}
                        preferredOwnerKey={formState.slug}
                        preferredOwnerName={formState.name}
                        preferredOwnerType="property"
                        showToggle={false}
                        title="Media Library"
                      />
                    </div>
                  ) : null}

                  {galleryAddImagePickerOpen ? (
                    <AdminMediaManager
                      defaultOpen
                      displayMode="modal"
                      disabled={disabled}
                      onRequestClose={() => setGalleryAddImagePickerOpen(false)}
                      onSelect={(nextUrl, entry) => {
                        onAddGalleryImage?.(nextUrl, entry)
                        setGalleryAddImagePickerOpen(false)
                      }}
                      preferredOwnerKey={formState.slug}
                      preferredOwnerName={formState.name}
                      preferredOwnerType="property"
                      showToggle={false}
                      title="Add Gallery Image"
                    />
                  ) : null}

                  {galleryFolderPickerOpen ? (
                    <AdminMediaManager
                      defaultOpen
                      displayMode="modal"
                      disabled={disabled}
                      folderActionLabel="Add folder images"
                      onRequestClose={() => setGalleryFolderPickerOpen(false)}
                      onSelectFolderEntries={(entries) => onAddGalleryFolderImages?.(entries)}
                      preferredOwnerKey={formState.slug}
                      preferredOwnerName={formState.name}
                      preferredOwnerType="property"
                      showToggle={false}
                      title="Add Folder Images to Gallery"
                    />
                  ) : null}
                </div>
              ) : (
                <p className="admin-empty">
                  {formState.galleryImages.length > 0
                    ? `${formState.galleryImages.length} gallery image${formState.galleryImages.length === 1 ? '' : 's'} configured.`
                    : 'Expand the editor to add gallery images.'}
                </p>
              )}
            </div>
          </EditSection>
          </div>
        ) : null}
      </div>
    </aside>
  )
}
