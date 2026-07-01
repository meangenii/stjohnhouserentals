import { Fragment, useContext } from 'react'
import { SiteContentPreviewContext } from '../lib/siteContentPreview'
import { buildPhoneHref, formatPhoneNumber } from '../lib/contactLinks'
import { EditableText } from './AdminInlinePageEdit'

const PHONE_NUMBER_PATTERN = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}/g

function LinkedPhoneText({ value }) {
  const text = String(value ?? '')
  const matches = Array.from(text.matchAll(PHONE_NUMBER_PATTERN))

  if (matches.length === 0) {
    return text
  }

  const parts = []
  let cursor = 0

  matches.forEach((match, index) => {
    const phone = match[0]
    const start = match.index ?? cursor
    const phoneHref = buildPhoneHref(phone)

    if (start > cursor) {
      parts.push(text.slice(cursor, start))
    }

    parts.push(
      phoneHref ? (
        <a aria-label={`Call ${phone}`} href={phoneHref} key={`phone-${start}-${index}`}>
          {formatPhoneNumber(phone)}
        </a>
      ) : (
        phone
      ),
    )
    cursor = start + phone.length
  })

  if (cursor < text.length) {
    parts.push(text.slice(cursor))
  }

  return parts.map((part, index) => <Fragment key={index}>{part}</Fragment>)
}

export function EditablePhoneText({ as: Component = 'span', className = '', label = 'Phone', path, value = '', ...rest }) {
  const previewState = useContext(SiteContentPreviewContext)

  if (previewState?.pageEditor) {
    return <EditableText as={Component} className={className} label={label} path={path} value={value} {...rest} />
  }

  return (
    <Component className={className} {...rest}>
      <LinkedPhoneText value={value} />
    </Component>
  )
}
