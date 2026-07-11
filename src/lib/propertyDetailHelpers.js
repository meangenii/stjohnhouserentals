import { richTextValueToPlainTextLines } from './richTextValue'

export function getShortDescriptionLines(property) {
  return richTextValueToPlainTextLines(property.shortDescription ?? '')
}
