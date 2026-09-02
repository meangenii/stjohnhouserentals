const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const SUBSCRIPTION_EXPIRY_WARNING_DAY_COUNT = 30

function getLocalDateOnly(date = new Date()) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000)
  return localDate.toISOString().slice(0, 10)
}

function addMonths(dateOnly, monthCount) {
  if (!DATE_ONLY_PATTERN.test(String(dateOnly ?? ''))) {
    return ''
  }

  const date = new Date(`${dateOnly}T12:00:00`)
  date.setMonth(date.getMonth() + monthCount)
  return getLocalDateOnly(date)
}

function addDays(dateOnly, dayCount) {
  if (!DATE_ONLY_PATTERN.test(String(dateOnly ?? ''))) {
    return ''
  }

  const date = new Date(`${dateOnly}T12:00:00`)
  date.setDate(date.getDate() + dayCount)
  return getLocalDateOnly(date)
}

export function getTodayDateOnly() {
  return getLocalDateOnly()
}

// Content-completeness issues, scoped to what's actually editable on the property page.
// Billing completeness (client link, subscription date, listing fee) is intentionally handled
// by getPropertyInvoiceStatus instead, since fixing those means going to the client's invoice
// section, not this page.
export function getPropertyContentIssues(property = {}) {
  const issues = []

  if (!property.heroImage) {
    issues.push({ key: 'heroImage', message: 'No hero image' })
  }

  if (!String(property.shortDescription ?? '').trim()) {
    issues.push({ key: 'shortDescription', message: 'No description' })
  }

  if (!String(property.bookingEmail ?? '').trim() && !String(property.bookingPhone ?? '').trim()) {
    issues.push({ key: 'bookingContact', message: 'No booking contact' })
  }

  if (!String(property.calendarUrl ?? '').trim()) {
    issues.push({ key: 'calendarUrl', message: 'No calendar link' })
  }

  return issues
}

export function getPropertyInvoiceStatus(property = {}, todayDateOnly = getTodayDateOnly()) {
  const subscriptionStartAt = String(property.subscriptionStartAt ?? '').trim()
  const missingBillingInfo =
    !String(property.clientId ?? '').trim() ||
    !DATE_ONLY_PATTERN.test(subscriptionStartAt) ||
    !String(property.listingFeeAmount ?? '').trim()

  if (missingBillingInfo) {
    return { label: 'Invoice info not set', urgent: true }
  }

  const serviceEndDate = addDays(addMonths(subscriptionStartAt, 12), -1)

  if (!serviceEndDate) {
    return { label: 'Invoice info not set', urgent: true }
  }

  if (serviceEndDate < todayDateOnly) {
    return { label: 'Subscription expired', urgent: true }
  }

  const warningStartDate = addDays(serviceEndDate, -SUBSCRIPTION_EXPIRY_WARNING_DAY_COUNT)

  if (warningStartDate && todayDateOnly >= warningStartDate) {
    const dayCount = Math.round((new Date(`${serviceEndDate}T12:00:00`) - new Date(`${todayDateOnly}T12:00:00`)) / 86400000)
    return { label: `Expires in ${Math.max(dayCount, 0)} days`, urgent: false }
  }

  return null
}
