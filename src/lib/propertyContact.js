import { buildPhoneHref } from './contactLinks'

function findPropertyLink(property, matcher) {
  const links = Array.isArray(property?.externalLinks) ? property.externalLinks.filter(Boolean) : []

  return links.find((link) => matcher(link))
}

function extractContactValueFromHref(href = '', prefix = '') {
  const normalizedHref = String(href ?? '').trim()
  const normalizedPrefix = String(prefix ?? '').trim().toLowerCase()

  if (!normalizedHref.toLowerCase().startsWith(normalizedPrefix)) {
    return ''
  }

  const rawValue = normalizedHref.slice(normalizedPrefix.length).split('?')[0].trim()

  if (!rawValue) {
    return ''
  }

  try {
    return decodeURIComponent(rawValue)
  } catch {
    return rawValue
  }
}

export function getPropertyContactInfo(property) {
  const booking = property?.booking && typeof property.booking === 'object' ? property.booking : {}
  const externalEmailLink = findPropertyLink(property, (link) => link?.isMailto || String(link?.href ?? '').toLowerCase().startsWith('mailto:'))
  const externalPhoneLink = findPropertyLink(property, (link) => link?.isPhone || String(link?.href ?? '').toLowerCase().startsWith('tel:'))
  const emailHref = String(externalEmailLink?.href ?? '').trim()
  const phoneHref = String(externalPhoneLink?.href ?? '').trim()
  const email = String(booking.email ?? '').trim() || extractContactValueFromHref(emailHref, 'mailto:')
  const phone = String(booking.phone ?? '').trim() || extractContactValueFromHref(phoneHref, 'tel:')

  return {
    contactName: String(booking.contactName ?? '').trim(),
    email,
    emailHref: emailHref || (email ? `mailto:${email}` : ''),
    phone,
    phoneHref: phoneHref || (phone ? buildPhoneHref(phone) : ''),
    note: String(booking.note ?? '').trim(),
  }
}

export function getPropertyContactActions(property) {
  const { emailHref, phoneHref } = getPropertyContactInfo(property)

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
