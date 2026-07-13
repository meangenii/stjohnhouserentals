import { richTextValueToPlainTextLines } from './richTextValue'
import { looksLikePropertyLocationLine, normalizePropertyLocationLabel } from './propertyLocationFilters'

function normalizeLocationLineValue(value = '') {
  return normalizePropertyLocationLabel(String(value ?? '').replace(/^Location:\s*/i, ''))
}

function getPropertyLocationDisplayLabel(property = {}, shortDescriptionLines = []) {
  const locationLabel = normalizePropertyLocationLabel(property.location)

  if (locationLabel && looksLikePropertyLocationLine(locationLabel)) {
    return locationLabel
  }

  const labeledLocationLine = [...shortDescriptionLines].reverse().find((line) => /^Location:\s*/i.test(line))

  if (labeledLocationLine) {
    return normalizeLocationLineValue(labeledLocationLine)
  }

  const legacyLocationLine = [...shortDescriptionLines].reverse().find((line) => looksLikePropertyLocationLine(line))

  return normalizeLocationLineValue(legacyLocationLine)
}

function isExistingLocationLine(line = '', locationLabel = '') {
  const normalizedLine = normalizeLocationLineValue(line).toLowerCase()
  const normalizedLocationLabel = normalizeLocationLineValue(locationLabel).toLowerCase()

  return /^Location:\s*/i.test(line) || (Boolean(normalizedLocationLabel) && normalizedLine === normalizedLocationLabel)
}

export function getShortDescriptionLines(property) {
  const shortDescriptionLines = richTextValueToPlainTextLines(property.shortDescription ?? '')
  const locationLabel = getPropertyLocationDisplayLabel(property, shortDescriptionLines)

  if (!locationLabel) {
    return shortDescriptionLines
  }

  return [
    ...shortDescriptionLines.filter((line) => !isExistingLocationLine(line, locationLabel)),
    `Location: ${locationLabel}`,
  ]
}
