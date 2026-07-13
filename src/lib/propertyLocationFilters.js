import { richTextValueToLines, richTextValueToPlainText } from './richTextValue'

export function normalizePropertyLocationLabel(value = '') {
  return String(value ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/,.*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizePropertyLocationFilterValue(value = '') {
  return normalizePropertyLocationLabel(value).toLowerCase()
}

export function looksLikePropertyLocationLine(value = '') {
  const normalizedValue = String(value ?? '').trim()

  if (!normalizedValue) {
    return false
  }

  return !/\b(max|guests?|bed(?:room)?s?|baths?|pool|hot tub|internet|wifi|wi-fi|a\/c|air-conditioning|solar|battery|backup|washer|dryer|kid friendly|ocean view|air-conditioned|wireless|kitchen|living room|ceiling fans?|game room|outdoor kitchen|security system)\b/i.test(
    normalizedValue,
  )
}

function getShortDescriptionLines(value) {
  return richTextValueToLines(value)
    .map((line) => richTextValueToPlainText(line))
    .filter(Boolean)
}

export function getPropertyLocationFilterLabel(property = {}) {
  const normalizedLocation = normalizePropertyLocationLabel(property.location)

  if (normalizedLocation && looksLikePropertyLocationLine(normalizedLocation)) {
    return normalizedLocation
  }

  const summaryLines = getShortDescriptionLines(property.shortDescription)
  const fallbackLine = [...summaryLines].reverse().find((line) => looksLikePropertyLocationLine(line))

  return normalizePropertyLocationLabel(fallbackLine)
}

export function buildPropertyLocationOptions(properties = []) {
  const locationOptionMap = new Map()

  properties.forEach((property) => {
    const label = getPropertyLocationFilterLabel(property)
    const value = normalizePropertyLocationFilterValue(label)

    if (!label || !value || locationOptionMap.has(value)) {
      return
    }

    const sourceLocation = String(property?.location ?? '').trim()

    locationOptionMap.set(value, {
      label,
      location: sourceLocation || label,
      value,
    })
  })

  return Array.from(locationOptionMap.values()).sort((left, right) => left.label.localeCompare(right.label))
}
