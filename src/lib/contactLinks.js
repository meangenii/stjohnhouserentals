export function buildPhoneHref(phone) {
  const normalizedPhone = String(phone ?? '').trim().replace(/^tel:/i, '')
  const hasLeadingPlus = normalizedPhone.startsWith('+')
  const digitsOnly = normalizedPhone.replace(/\D+/g, '')

  if (digitsOnly.length < 7) {
    return ''
  }

  return `tel:${hasLeadingPlus ? `+${digitsOnly}` : digitsOnly}`
}

export function formatPhoneNumber(phone) {
  const normalizedPhone = String(phone ?? '').trim().replace(/^tel:/i, '')
  const digitsOnly = normalizedPhone.replace(/\D+/g, '')

  if (digitsOnly.length === 10) {
    return `${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6)}`
  }

  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    return `1-${digitsOnly.slice(1, 4)}-${digitsOnly.slice(4, 7)}-${digitsOnly.slice(7)}`
  }

  return normalizedPhone
}
