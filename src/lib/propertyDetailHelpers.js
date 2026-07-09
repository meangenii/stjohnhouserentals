import { richTextValueToLines } from './richTextValue'

export function getShortDescriptionLines(property) {
  return richTextValueToLines(property.shortDescription ?? '')
}
