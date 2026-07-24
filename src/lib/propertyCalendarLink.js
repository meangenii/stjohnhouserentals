export function hasPropertyCalendarLink(property) {
  const calendarUrl = String(property?.calendarUrl ?? '').trim()

  if (!calendarUrl) {
    return false
  }

  try {
    const parsedUrl = new URL(calendarUrl)
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:'
  } catch {
    return false
  }
}
