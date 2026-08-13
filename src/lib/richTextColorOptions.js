import { BLOCK_COLOR_SWATCHES } from './blockStyle.js'
import { normalizeRichTextColor } from './richTextFormatting.js'

const RICH_TEXT_SITE_COLOR_OPTIONS = [
  { label: 'Default', value: 'default' },
  { label: 'Body Text', value: 'var(--text)' },
  { label: 'Muted Text', value: 'var(--muted)' },
  { label: 'Heading', value: 'var(--brand-navy)' },
  { label: 'Link Blue', value: 'var(--brand-blue)' },
  { label: 'Hero Text', value: 'var(--hero-text)' },
  { label: 'White', value: '#ffffff' },
]

export const RICH_TEXT_COLOR_OPTIONS = (() => {
  const seenValues = new Set()

  return [...RICH_TEXT_SITE_COLOR_OPTIONS, ...BLOCK_COLOR_SWATCHES]
    .filter((option) => {
      const value = normalizeRichTextColor(option.value) || 'default'

      if (seenValues.has(value)) {
        return false
      }

      seenValues.add(value)
      return true
    })
    .map((option) => ({
      ...option,
      swatch: option.value === 'default' ? '' : option.value,
      value: normalizeRichTextColor(option.value) || 'default',
    }))
})()
