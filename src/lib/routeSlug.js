function safeDecodeRouteSegment(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function safeEncodeRouteSegment(value) {
  try {
    return encodeURIComponent(value)
  } catch {
    return value
  }
}

export function getRouteSlugVariants(slug) {
  const variants = new Set()
  const base = String(slug ?? '').trim()

  if (!base) {
    return []
  }

  const decodedBase = safeDecodeRouteSegment(base)
  const directCandidates = [base, decodedBase]
  const apostropheCandidates = directCandidates.flatMap((value) => [
    value,
    value.replaceAll("'", '\u2019'),
    value.replaceAll('\u2019', "'"),
  ])

  ;[...apostropheCandidates, ...apostropheCandidates.map((value) => safeEncodeRouteSegment(value))].forEach(
    (candidate) => {
      const trimmedCandidate = String(candidate ?? '').trim()

      if (!trimmedCandidate) {
        return
      }

      variants.add(trimmedCandidate)
      variants.add(trimmedCandidate.toLowerCase())
    },
  )

  return Array.from(variants)
}
