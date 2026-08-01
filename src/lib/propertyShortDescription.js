import { richTextValueToPlainLineText, richTextValueToPlainTextLines } from './richTextValue'
import { normalizePropertyLocationLabel } from './propertyLocationFilters'

export const SHORT_DESCRIPTION_FEATURE_OPTIONS = [
  {
    id: 'pool',
    label: 'Pool',
    line: 'Pool',
    matches: (line) => normalizeShortDescriptionFactLine(line) === 'pool',
  },
  {
    id: 'hotTub',
    label: 'Hot Tub',
    line: 'Hot Tub',
    matches: (line) => ['hot tub', 'hot tubs'].includes(normalizeShortDescriptionFactLine(line)),
  },
  {
    id: 'internet',
    label: 'Internet',
    line: 'Internet',
    matches: (line) => normalizeShortDescriptionFactLine(line) === 'internet',
  },
  {
    id: 'backupPower',
    label: 'Backup Power',
    line: 'Backup Power',
    matches: (line) => ['backup power', 'battery backup'].includes(normalizeShortDescriptionFactLine(line)),
  },
]

const AIR_CONDITIONING_BEDROOM_DESCRIPTOR = 'A/C (Bedrooms)'
const AIR_CONDITIONING_WHOLE_HOUSE_DESCRIPTOR = 'A/C (Whole House)'

export const AIR_CONDITIONING_OPTIONS = [
  {
    label: AIR_CONDITIONING_BEDROOM_DESCRIPTOR,
    line: AIR_CONDITIONING_BEDROOM_DESCRIPTOR,
    value: 'bedrooms',
  },
  {
    label: AIR_CONDITIONING_WHOLE_HOUSE_DESCRIPTOR,
    line: AIR_CONDITIONING_WHOLE_HOUSE_DESCRIPTOR,
    value: 'whole-house',
  },
]

const AIR_CONDITIONING_TERM_PATTERN = /\b(?:air[-\s]?condition(?:ed|ing)?|a\/c|ac)\b/i
const AIR_CONDITIONING_BEDROOM_CONTEXT_PATTERN = /\b(?:bedrooms?|brs?)\b/i
const AIR_CONDITIONING_WHOLE_HOUSE_CONTEXT_PATTERN =
  /(?:\b(?:full(?:y)?|whole\s+(?:house|home)|throughout|entire\s+(?:home|house)|every\s+room|all\s+rooms|common\s+areas|central)\b|100%)/i

export function normalizeShortDescriptionFactLine(value = '') {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/[-\s]+/g, ' ')
    .trim()
    .toLowerCase()
}

export function getShortDescriptionFactLines(value = '') {
  return richTextValueToPlainTextLines(value)
    .map((line) => line.trim())
    .filter(Boolean)
}

function matchesAirConditioningBedroomLine(line = '') {
  const sourceLine = String(line ?? '').trim()
  const normalizedLine = normalizeShortDescriptionFactLine(line)
  return (
    ['air conditioned bedrooms', 'air conditioning bedrooms', 'a/c bedroom', 'a/c bedrooms', 'ac bedroom', 'ac bedrooms'].includes(normalizedLine) ||
    (AIR_CONDITIONING_TERM_PATTERN.test(sourceLine) && AIR_CONDITIONING_BEDROOM_CONTEXT_PATTERN.test(sourceLine))
  )
}

function matchesAirConditioningWholeHouseLine(line = '') {
  const sourceLine = String(line ?? '').trim()
  const normalizedLine = normalizeShortDescriptionFactLine(line)
  return (
    [
      'a/c',
      'ac',
      'air conditioned',
      'air conditioning',
      'a/c whole house',
      'ac whole house',
      'full a/c',
      'full ac',
      'whole house a/c',
      'whole house ac',
    ].includes(normalizedLine) ||
    (AIR_CONDITIONING_TERM_PATTERN.test(sourceLine) && AIR_CONDITIONING_WHOLE_HOUSE_CONTEXT_PATTERN.test(sourceLine))
  )
}

function getAirConditioningDescriptorLine(line = '') {
  if (matchesAirConditioningWholeHouseLine(line)) {
    return AIR_CONDITIONING_WHOLE_HOUSE_DESCRIPTOR
  }

  if (matchesAirConditioningBedroomLine(line)) {
    return AIR_CONDITIONING_BEDROOM_DESCRIPTOR
  }

  return ''
}

export function normalizePropertyShortDescriptionDescriptorLine(line = '') {
  const normalizedLine = String(line ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()

  if (!normalizedLine) {
    return ''
  }

  return getAirConditioningDescriptorLine(normalizedLine) || normalizedLine.replace(/\bAC\b/g, 'A/C')
}

export function normalizePropertyShortDescriptionDescriptorText(value = '') {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => normalizePropertyShortDescriptionDescriptorLine(line))
    .filter(Boolean)
    .join('\n')
}

function matchesGeneratedPropertyFeatureLine(line = '') {
  return (
    SHORT_DESCRIPTION_FEATURE_OPTIONS.some((option) => option.matches(line)) ||
    matchesAirConditioningBedroomLine(line) ||
    matchesAirConditioningWholeHouseLine(line)
  )
}

export function readShortDescriptionFeatureState(value = '') {
  const lines = getShortDescriptionFactLines(value)
  const selectedFeatures = SHORT_DESCRIPTION_FEATURE_OPTIONS.reduce(
    (state, option) => ({
      ...state,
      [option.id]: lines.some((line) => option.matches(line)),
    }),
    {},
  )
  const airConditioning = lines.some((line) => matchesAirConditioningWholeHouseLine(line))
    ? 'whole-house'
    : lines.some((line) => matchesAirConditioningBedroomLine(line))
      ? 'bedrooms'
      : ''

  return {
    ...selectedFeatures,
    airConditioning,
  }
}

export function buildPropertyShortDescriptionFeatureLines(featureState = {}) {
  return [
    ...SHORT_DESCRIPTION_FEATURE_OPTIONS.filter((option) => featureState[option.id]).map((option) => option.line),
    ...AIR_CONDITIONING_OPTIONS.filter((option) => option.value === featureState.airConditioning).map((option) => option.line),
  ]
}

function formatPropertyShortDescriptionCount(value, { allowDecimal = false } = {}) {
  const count = allowDecimal ? Number.parseFloat(String(value ?? '').trim()) : Number.parseInt(String(value ?? '').trim(), 10)

  if (!Number.isFinite(count) || count <= 0) {
    return '0'
  }

  return String(count)
}

function formatPropertyShortDescriptionCountLine(value, singularLabel, pluralLabel, options = {}) {
  const formattedCount = formatPropertyShortDescriptionCount(value, options)
  const label = Number(formattedCount) === 1 ? singularLabel : pluralLabel

  return `${formattedCount} ${label}`
}

function buildPropertyShortDescriptionLocationLine(formState = {}) {
  const locationLabel = normalizePropertyLocationLabel(formState.location)
  return locationLabel ? `Location: ${locationLabel}` : ''
}

export function buildRequiredPropertyShortDescriptionLines(formState = {}) {
  const guestCount = formatPropertyShortDescriptionCount(formState.maxGuests)
  const guestLabel = Number(guestCount) === 1 ? 'Guest' : 'Guests'

  return [
    `Max ${guestCount} ${guestLabel}`,
    formatPropertyShortDescriptionCountLine(formState.bedrooms, 'Bedroom', 'Bedrooms'),
    formatPropertyShortDescriptionCountLine(formState.bathrooms, 'Bath', 'Baths', { allowDecimal: true }),
  ].filter(Boolean)
}

function isGeneratedGuestLine(value = '') {
  return /^Max\b/i.test(String(value ?? '').trim())
}

function isGeneratedBedroomLine(value = '') {
  return /\bBedrooms?\b/i.test(String(value ?? '').trim())
}

function isGeneratedBathLine(value = '') {
  return /\bBaths?\b/i.test(String(value ?? '').trim())
}

function isGeneratedPropertyStatLine(value = '') {
  const line = String(value ?? '').trim()

  return (
    /^Max\s+\d+(?:\.\d+)?(?:\s+Guests?)?$/i.test(line) ||
    /^\d+(?:\.\d+)?\s+Bedrooms?$/i.test(line) ||
    /^\d+(?:\.\d+)?\s+Baths?$/i.test(line)
  )
}

function removeGeneratedPropertyStatLines(lines = []) {
  const remainingLines = [...lines]

  if (isGeneratedGuestLine(remainingLines[0])) {
    remainingLines.shift()
  }

  if (isGeneratedBedroomLine(remainingLines[0])) {
    remainingLines.shift()
  }

  if (isGeneratedBathLine(remainingLines[0])) {
    remainingLines.shift()
  }

  return remainingLines.filter((line) => !isGeneratedPropertyStatLine(line))
}

function getGeneratedPropertyLocationCandidates(formState = {}, generatedLocations = []) {
  return [formState.location, ...generatedLocations]
    .map((location) => normalizePropertyLocationLabel(location))
    .map((location) => location.toLowerCase())
    .filter(Boolean)
}

function matchesGeneratedPropertyLocationLine(line = '', locationCandidates = []) {
  const normalizedLine = normalizePropertyLocationLabel(String(line ?? '').replace(/^Location:\s*/i, '')).toLowerCase()

  return Boolean(normalizedLine) && locationCandidates.includes(normalizedLine)
}

function removeGeneratedPropertyLocationLines(lines = [], formState = {}, { generatedLocations = [] } = {}) {
  const locationCandidates = getGeneratedPropertyLocationCandidates(formState, generatedLocations)

  if (locationCandidates.length === 0) {
    return lines
  }

  return lines.filter((line) => !matchesGeneratedPropertyLocationLine(line, locationCandidates))
}

export function getCustomPropertyShortDescriptionLines(value = '', formState = {}, options = {}) {
  const nonGeneratedFeatureLines = getShortDescriptionFactLines(value).filter((line) => !matchesGeneratedPropertyFeatureLine(line))
  return removeGeneratedPropertyLocationLines(removeGeneratedPropertyStatLines(nonGeneratedFeatureLines), formState, options)
}

export function getCustomPropertyShortDescriptionValue(value = '', formState = {}, options = {}) {
  return getCustomPropertyShortDescriptionLines(value, formState, options).join('\n')
}

export function getDerivedPropertyShortDescriptionLines(formState = {}, value = '') {
  return [
    ...buildRequiredPropertyShortDescriptionLines(formState),
    ...buildPropertyShortDescriptionFeatureLines(readShortDescriptionFeatureState(value)),
    buildPropertyShortDescriptionLocationLine(formState),
  ].filter(Boolean)
}

export function buildPropertyShortDescription(formState = {}, { customValue = '', featureState = {} } = {}) {
  const normalizedCustomLines = getCustomPropertyShortDescriptionLines(richTextValueToPlainLineText(customValue), formState)

  return [
    ...buildRequiredPropertyShortDescriptionLines(formState),
    ...buildPropertyShortDescriptionFeatureLines(featureState),
    ...normalizedCustomLines,
    buildPropertyShortDescriptionLocationLine(formState),
  ]
    .filter(Boolean)
    .join('\n')
}

export function mergePropertyShortDescription(formState = {}, value = '', options = {}) {
  return buildPropertyShortDescription(formState, {
    customValue: getCustomPropertyShortDescriptionValue(value, formState, options),
    featureState: readShortDescriptionFeatureState(value),
  })
}
