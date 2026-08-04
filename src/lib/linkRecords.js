import { buildPhoneHref } from './contactLinks.js'

const DEFAULT_EMAIL_BCC = 'stjohnlinks@gmail.com'
const SITE_ORIGIN_PATTERN = /^https?:\/\/(?:www\.)?stjohnhouserentals\.com$/i

export const LINK_TYPE_OPTIONS = [
  { label: 'Email', value: 'email' },
  { label: 'Telephone', value: 'phone' },
  { label: 'External page', value: 'external' },
  { label: 'Internal page', value: 'internal' },
]

function trimValue(value) {
  return String(value ?? '').trim()
}

function decodeMaybeEncodedValue(value) {
  const normalizedValue = trimValue(value)

  if (!normalizedValue) {
    return ''
  }

  try {
    return decodeURIComponent(normalizedValue)
  } catch {
    return normalizedValue
  }
}

function normalizeDestinationField(destinationField = 'href') {
  const normalizedField = trimValue(destinationField)
  return normalizedField || 'href'
}

function normalizeLegacyInternalPath(pathname) {
  const trimmedPath = trimValue(pathname)

  if (!trimmedPath) {
    return trimmedPath
  }

  if (/^\/car-rental-ferry-boat-info\/?$/i.test(trimmedPath)) {
    return '/car-barge-information'
  }

  const bedroomAliasMatch = trimmedPath.match(/^\/\d+bedroom\/([^/]+)\/?$/i)

  if (bedroomAliasMatch) {
    return `/rental-properties/${bedroomAliasMatch[1]}`
  }

  return trimmedPath
}

function normalizeLinkObject(link) {
  return link && typeof link === 'object' && !Array.isArray(link) ? link : {}
}

export function normalizeLinkType(value, fallback = 'external') {
  const normalizedValue = trimValue(value).toLowerCase()

  if (LINK_TYPE_OPTIONS.some((option) => option.value === normalizedValue)) {
    return normalizedValue
  }

  return fallback
}

export function normalizeInternalLinkDestination(value) {
  const candidate = trimValue(value)

  if (!candidate) {
    return ''
  }

  if (candidate.startsWith('#') || candidate.startsWith('?')) {
    return candidate
  }

  const withoutOrigin = candidate.replace(/^(?:[a-z][a-z\d+\-.]*:)?\/\/[^/]+/i, '')
  const [, rawPath = '', suffix = ''] = withoutOrigin.match(/^([^?#]*)(.*)$/) ?? []

  if (!rawPath && suffix) {
    return `/${suffix}`
  }

  const normalizedPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
  const legacyNormalizedPath = normalizeLegacyInternalPath(normalizedPath)
  const collapsedPath = legacyNormalizedPath !== '/' ? legacyNormalizedPath.replace(/\/+$/, '') || '/' : '/'

  return `${collapsedPath}${suffix}`
}

function normalizeSiteOriginDestination(value = '') {
  const candidate = trimValue(value)

  if (!/^https?:\/\//i.test(candidate)) {
    return ''
  }

  let parsedUrl

  try {
    parsedUrl = new URL(candidate)
  } catch {
    return ''
  }

  if (!SITE_ORIGIN_PATTERN.test(parsedUrl.origin)) {
    return ''
  }

  return normalizeInternalLinkDestination(`${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`)
}

const ALLOWED_EXTERNAL_LINK_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:'])

export function normalizeExternalLinkDestination(value) {
  const candidate = trimValue(value)

  if (!candidate) {
    return ''
  }

  if (candidate.startsWith('//')) {
    return `https:${candidate}`
  }

  if (candidate.startsWith('/') || candidate.startsWith('#') || candidate.startsWith('?')) {
    return candidate
  }

  const schemeMatch = candidate.match(/^([a-z][a-z\d+\-.]*):/i)

  if (schemeMatch) {
    return ALLOWED_EXTERNAL_LINK_SCHEMES.has(schemeMatch[1].toLowerCase() + ':') ? candidate : ''
  }

  return `https://${candidate}`
}

export function getLinkDestination(link, { destinationField = 'href' } = {}) {
  const normalizedLink = normalizeLinkObject(link)
  const normalizedField = normalizeDestinationField(destinationField)
  const directDestination = trimValue(normalizedLink?.[normalizedField])

  if (directDestination) {
    return directDestination
  }

  if (normalizedField !== 'path') {
    const pathDestination = trimValue(normalizedLink.path)

    if (pathDestination) {
      return pathDestination
    }
  }

  if (normalizedField !== 'href') {
    const hrefDestination = trimValue(normalizedLink.href)

    if (hrefDestination) {
      return hrefDestination
    }
  }

  return ''
}

function parseMailtoHref(href) {
  const normalizedHref = trimValue(href)

  if (!/^mailto:/i.test(normalizedHref)) {
    return {
      emailAddress: '',
      emailBcc: '',
      emailBody: '',
      emailCc: '',
      emailSubject: '',
    }
  }

  const withoutPrefix = normalizedHref.replace(/^mailto:/i, '')
  const [addressSegment = '', query = ''] = withoutPrefix.split('?')
  const params = new URLSearchParams(query)

  return {
    emailAddress: decodeMaybeEncodedValue(addressSegment),
    emailBcc: decodeMaybeEncodedValue(params.get('bcc')),
    emailBody: decodeMaybeEncodedValue(params.get('body')),
    emailCc: decodeMaybeEncodedValue(params.get('cc')),
    emailSubject: decodeMaybeEncodedValue(params.get('subject')),
  }
}

function parsePhoneHref(href) {
  const normalizedHref = trimValue(href)

  if (!/^tel:/i.test(normalizedHref)) {
    return ''
  }

  return decodeMaybeEncodedValue(normalizedHref.replace(/^tel:/i, ''))
}

export function detectLinkType(link, { defaultType = 'external', destinationField = 'href' } = {}) {
  const normalizedLink = normalizeLinkObject(link)
  const explicitType = trimValue(normalizedLink.linkType).toLowerCase()

  if (LINK_TYPE_OPTIONS.some((option) => option.value === explicitType)) {
    return explicitType
  }

  const destination = getLinkDestination(normalizedLink, { destinationField })

  if (!destination) {
    return normalizeLinkType(defaultType, 'external')
  }

  if (/^mailto:/i.test(destination)) {
    return 'email'
  }

  if (/^tel:/i.test(destination)) {
    return 'phone'
  }

  if (destinationField === 'path' && !/^(?:[a-z][a-z\d+\-.]*:|\/\/)/i.test(destination)) {
    return 'internal'
  }

  if (destination.startsWith('/') || destination.startsWith('#') || destination.startsWith('?')) {
    return 'internal'
  }

  if (normalizeSiteOriginDestination(destination)) {
    return 'internal'
  }

  return 'external'
}

function resolveOpenInNewTab(link, destination, type) {
  const normalizedLink = normalizeLinkObject(link)

  if (type !== 'external') {
    return false
  }

  if (typeof normalizedLink.openInNewTab === 'boolean') {
    return normalizedLink.openInNewTab
  }

  if (trimValue(normalizedLink.target) === '_blank') {
    return true
  }

  return /^(?:https?:)?\/\//i.test(trimValue(destination))
}

export function resolveLinkEditorState(link, { defaultType = 'external', destinationField = 'href' } = {}) {
  const normalizedLink = normalizeLinkObject(link)
  const type = detectLinkType(normalizedLink, { defaultType, destinationField })
  const destination = getLinkDestination(normalizedLink, { destinationField })
  const siteOriginDestination = normalizeSiteOriginDestination(destination)
  const emailParts = parseMailtoHref(destination)

  return {
    type,
    internalPath: type === 'internal' ? siteOriginDestination || destination : '',
    externalUrl: type === 'external' ? destination : '',
    emailAddress: trimValue(normalizedLink.emailAddress) || emailParts.emailAddress,
    emailBcc: trimValue(normalizedLink.emailBcc) || emailParts.emailBcc || DEFAULT_EMAIL_BCC,
    emailBccEnabled:
      typeof normalizedLink.emailBccEnabled === 'boolean' ? normalizedLink.emailBccEnabled : Boolean(emailParts.emailBcc),
    emailBody: trimValue(normalizedLink.emailBody) || emailParts.emailBody,
    emailCc: trimValue(normalizedLink.emailCc) || emailParts.emailCc,
    emailCcEnabled:
      typeof normalizedLink.emailCcEnabled === 'boolean' ? normalizedLink.emailCcEnabled : Boolean(emailParts.emailCc),
    emailSubject: trimValue(normalizedLink.emailSubject) || emailParts.emailSubject,
    openInNewTab: resolveOpenInNewTab(normalizedLink, destination, type),
    phoneNumber: trimValue(normalizedLink.phoneNumber) || parsePhoneHref(destination),
  }
}

export function buildMailtoHref({
  emailAddress = '',
  emailBcc = '',
  emailBccEnabled = false,
  emailBody = '',
  emailCc = '',
  emailCcEnabled = false,
  emailSubject = '',
} = {}) {
  const normalizedEmail = trimValue(emailAddress)

  if (!normalizedEmail) {
    return ''
  }

  const params = new URLSearchParams()

  if (emailCcEnabled && trimValue(emailCc)) {
    params.set('cc', trimValue(emailCc))
  }

  if (emailBccEnabled && trimValue(emailBcc)) {
    params.set('bcc', trimValue(emailBcc))
  }

  if (trimValue(emailSubject)) {
    params.set('subject', trimValue(emailSubject))
  }

  if (trimValue(emailBody)) {
    params.set('body', trimValue(emailBody))
  }

  const query = params.toString()
  return `mailto:${normalizedEmail}${query ? `?${query}` : ''}`
}

export function buildLinkRecord(link, state, { destinationField = 'href' } = {}) {
  const normalizedLink = normalizeLinkObject(link)
  const nextState = {
    ...resolveLinkEditorState(normalizedLink, { destinationField }),
    ...(state ?? {}),
  }
  const nextType = normalizeLinkType(nextState.type, detectLinkType(normalizedLink, { destinationField }))
  const normalizedField = normalizeDestinationField(destinationField)
  const nextLink = { ...normalizedLink, linkType: nextType }

  delete nextLink.openInNewTab
  delete nextLink.target
  delete nextLink.rel
  delete nextLink.emailAddress
  delete nextLink.emailCc
  delete nextLink.emailCcEnabled
  delete nextLink.emailBcc
  delete nextLink.emailBccEnabled
  delete nextLink.emailSubject
  delete nextLink.emailBody
  delete nextLink.phoneNumber

  switch (nextType) {
    case 'internal': {
      nextLink[normalizedField] = normalizeInternalLinkDestination(nextState.internalPath)
      break
    }
    case 'email': {
      nextLink[normalizedField] = buildMailtoHref(nextState)
      nextLink.emailAddress = trimValue(nextState.emailAddress)
      nextLink.emailCc = trimValue(nextState.emailCc)
      nextLink.emailCcEnabled = nextState.emailCcEnabled === true
      nextLink.emailBcc = trimValue(nextState.emailBcc)
      nextLink.emailBccEnabled = nextState.emailBccEnabled === true
      nextLink.emailSubject = trimValue(nextState.emailSubject)
      nextLink.emailBody = trimValue(nextState.emailBody)
      break
    }
    case 'phone': {
      const normalizedPhone = trimValue(nextState.phoneNumber)
      nextLink[normalizedField] = buildPhoneHref(normalizedPhone)
      nextLink.phoneNumber = normalizedPhone
      break
    }
    default: {
      nextLink[normalizedField] = normalizeExternalLinkDestination(nextState.externalUrl)
      nextLink.openInNewTab = nextState.openInNewTab === true

      if (nextLink.openInNewTab) {
        nextLink.target = '_blank'
        nextLink.rel = 'noreferrer noopener'
      }
      break
    }
  }

  return nextLink
}

export function resolveLinkRenderConfig(link, { defaultType = 'external', destinationField = 'href' } = {}) {
  const normalizedLink = normalizeLinkObject(link)
  const type = detectLinkType(normalizedLink, { defaultType, destinationField })
  const state = resolveLinkEditorState(normalizedLink, { defaultType, destinationField })

  if (type === 'internal') {
    const destination = normalizeSiteOriginDestination(state.internalPath) || normalizeInternalLinkDestination(state.internalPath)

    return {
      destination,
      href: '',
      isInternal: true,
      rel: undefined,
      target: undefined,
      to: destination,
      type,
    }
  }

  const destination =
    type === 'email'
      ? buildMailtoHref(state)
      : type === 'phone'
        ? buildPhoneHref(state.phoneNumber)
        : normalizeExternalLinkDestination(state.externalUrl)

  return {
    destination,
    href: destination,
    isInternal: false,
    rel: type === 'external' && state.openInNewTab ? 'noreferrer noopener' : undefined,
    target: type === 'external' && state.openInNewTab ? '_blank' : undefined,
    to: '',
    type,
  }
}

export function buildRouteOptionLabel(route, path, isAlias = false) {
  const label = trimValue(route?.label ?? route?.navLabel ?? route?.title ?? route?.key)
  const title = trimValue(route?.title)
  const descriptor = isAlias ? 'Alias' : ''

  return [label, title && title !== label ? title : '', descriptor, path].filter(Boolean).join(' | ') || path
}

export function buildRouteOptions(routeInventory = []) {
  const seenPaths = new Set()

  return routeInventory.flatMap((route) => {
    if (trimValue(route?.group) === 'internal') {
      return []
    }

    const pathCandidates = [route?.path, ...(Array.isArray(route?.routeAliases) ? route.routeAliases : [])]

    return pathCandidates.reduce((options, candidatePath, index) => {
      const normalizedPath = normalizeInternalLinkDestination(candidatePath)

      if (!normalizedPath || normalizedPath.includes(':') || seenPaths.has(normalizedPath)) {
        return options
      }

      seenPaths.add(normalizedPath)
      options.push({
        label: buildRouteOptionLabel(route, normalizedPath, index > 0),
        value: normalizedPath,
      })
      return options
    }, [])
  })
}

export function mergeRouteOptions(routeOptions = [], routeSuggestions = [], currentValue = '') {
  const mergedOptions = []
  const seenValues = new Set()

  const addOption = (optionOrValue) => {
    const option =
      typeof optionOrValue === 'string'
        ? { label: normalizeInternalLinkDestination(optionOrValue), value: normalizeInternalLinkDestination(optionOrValue) }
        : {
            label: trimValue(optionOrValue?.label) || normalizeInternalLinkDestination(optionOrValue?.value),
            value: normalizeInternalLinkDestination(optionOrValue?.value),
          }

    if (!option.value || seenValues.has(option.value)) {
      return
    }

    seenValues.add(option.value)
    mergedOptions.push(option)
  }

  routeOptions.forEach(addOption)
  routeSuggestions.forEach(addOption)

  const normalizedCurrentValue = normalizeInternalLinkDestination(currentValue)

  if (normalizedCurrentValue && !seenValues.has(normalizedCurrentValue)) {
    mergedOptions.unshift({
      label: `Current Route | ${normalizedCurrentValue}`,
      value: normalizedCurrentValue,
    })
  }

  return mergedOptions
}
