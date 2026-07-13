import { richTextValueToPlainText } from './richTextValue'

export function truncateSummary(summary, limit = 138) {
  const normalizedSummary = richTextValueToPlainText(summary)

  if (normalizedSummary.length <= limit) {
    return { text: normalizedSummary, isTruncated: false }
  }

  const truncatedText = normalizedSummary.slice(0, limit)
  const breakpoint = truncatedText.lastIndexOf(' ')

  return {
    text: `${truncatedText.slice(0, breakpoint > 0 ? breakpoint : limit).trim()}...`,
    isTruncated: true,
  }
}
