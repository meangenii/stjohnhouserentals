import { buildPhoneHref } from './contactLinks'

function findPropertyLink(property, matcher) {
  const links = Array.isArray(property?.externalLinks) ? property.externalLinks.filter(Boolean) : []

  return links.find((link) => matcher(link))
}

export function getPropertyContactActions(property) {
  const email = String(property?.booking?.email ?? '').trim()
  const phone = String(property?.booking?.phone ?? '').trim()
  const externalEmailLink = findPropertyLink(property, (link) => link?.isMailto || String(link?.href ?? '').toLowerCase().startsWith('mailto:'))
  const externalPhoneLink = findPropertyLink(property, (link) => link?.isPhone || String(link?.href ?? '').toLowerCase().startsWith('tel:'))
  const emailHref = String(externalEmailLink?.href ?? '').trim() || (email ? `mailto:${email}` : '')
  const phoneHref = String(externalPhoneLink?.href ?? '').trim() || (phone ? buildPhoneHref(phone) : '')

  return [
    emailHref
      ? {
          href: emailHref,
          key: 'email',
          label: 'Email',
          toneClassName: 'button-link--primary',
        }
      : null,
    phoneHref
      ? {
          href: phoneHref,
          key: 'phone',
          label: 'Phone',
          toneClassName: 'button-link--secondary',
        }
      : null,
  ].filter(Boolean)
}
