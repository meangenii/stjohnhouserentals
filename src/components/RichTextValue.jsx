import { richTextValueToHtml } from '../lib/richTextValue'

export function RichTextValue({ as: Component = 'span', className = '', value = '', ...rest }) {
  const html = richTextValueToHtml(value)

  return <Component {...rest} className={className} dangerouslySetInnerHTML={{ __html: html }} />
}
