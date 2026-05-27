function safeDecodeRouteSegment(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function getRouteSlugVariants(slug) {
  const pending = [String(slug ?? '').trim()]
  const variants = new Set()

  while (pending.length > 0) {
    const candidate = pending.pop()?.trim()

    if (!candidate || variants.has(candidate)) {
      continue
    }

    variants.add(candidate)

    const decodedCandidate = safeDecodeRouteSegment(candidate)
    const encodedCandidate = encodeURIComponent(candidate)
    const curlyApostropheCandidate = candidate.replaceAll("'", '’')
    const straightApostropheCandidate = candidate.replaceAll('’', "'")

    if (decodedCandidate && decodedCandidate !== candidate) {
      pending.push(decodedCandidate)
    }

    if (encodedCandidate && encodedCandidate !== candidate) {
      pending.push(encodedCandidate)
    }

    if (curlyApostropheCandidate !== candidate) {
      pending.push(curlyApostropheCandidate)
    }

    if (straightApostropheCandidate !== candidate) {
      pending.push(straightApostropheCandidate)
    }
  }

  return Array.from(variants)
}
