import { richTextValueToHtml, richTextValueToInlineHtml } from '../lib/richTextValue'

const INLINE_TEXT_CONTAINERS = new Set(['a', 'button', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label', 'p', 'span'])

export function RichTextValue({ as: Component = 'span', className = '', value = '', ...rest }) {
  const html =
    typeof Component === 'string' && INLINE_TEXT_CONTAINERS.has(Component)
      ? richTextValueToInlineHtml(value)
      : richTextValueToHtml(value)

  return <Component {...rest} className={className} dangerouslySetInnerHTML={{ __html: html }} />
}
