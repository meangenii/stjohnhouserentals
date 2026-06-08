import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as cheerio from 'cheerio'
import { mediaCatalog } from '../shared/mediaCatalog.js'
import { isLegacyMediaUrl, rewriteValueWithMediaManifest } from '../shared/mediaLibrary.js'

const BASE_URL = 'https://www.stjohnhouserentals.com'
const DEFAULT_PROPERTY_TEMPLATE_VARIANT = 'fully-sectioned'
const SNAPSHOT_CONCURRENCY = 3
const FETCH_RETRY_LIMIT = 4
const AUXILIARY_PUBLIC_ASSETS = [{ routePath: '/blog-feed.xml', publicFileName: 'blog-feed.xml', referenceFile: 'xml/blog-feed.xml' }]

const STATIC_ROUTE_CONFIG = [
  { key: 'home', path: '/', navLabel: 'Home', group: 'primary' },
  { key: 'aboutUs', path: '/about-us', navLabel: 'About', group: 'primary' },
  { key: 'houseRentals', path: '/st-john-rentals', navLabel: 'House Rentals', group: 'primary' },
  {
    key: 'rentalAccommodations',
    path: '/for-rent',
    navLabel: 'Rental Accommodations',
    group: 'primary',
  },
  {
    key: 'propertyForSale',
    path: '/property-for-sale',
    navLabel: 'Property For Sale',
    group: 'primary',
  },
  {
    key: 'carBargeInformation',
    path: '/car-barge-information',
    navLabel: 'Car Barge Information',
    group: 'travel',
  },
  {
    key: 'passengerFerry',
    path: '/passenger-ferry',
    navLabel: 'Passenger Ferry',
    group: 'travel',
  },
  { key: 'ferrys', path: '/ferrys', navLabel: 'Ferrys', group: 'travel' },
  { key: 'stJohnCarRentals', path: '/cars', navLabel: 'St John Car Rentals', group: 'travel' },
  { key: 'charterBoats', path: '/boats', navLabel: 'Charter Boats', group: 'travel' },
  { key: 'localAttractions', path: '/map', navLabel: 'Local Attractions', group: 'travel' },
  { key: 'advertise', path: '/advertise', navLabel: 'Advertise', group: 'primary' },
  { key: 'privacyPolicy', path: '/privacy-policy', navLabel: 'Privacy Policy', group: 'legal' },
  {
    key: 'termsOfAgreement',
    path: '/terms-of-agreement',
    navLabel: 'Terms of Agreement',
    group: 'legal',
  },
  { key: 'blog', path: '/blog', navLabel: 'Blog', group: 'secondary' },
  { key: 'jewelry', path: '/jewelry', navLabel: 'Jewelry', group: 'secondary' },
  { key: 'links', path: '/links', navLabel: 'Links', group: 'secondary' },
  { key: 'stJohnBook', path: '/st-john-book', navLabel: 'St John Books', group: 'secondary' },
  { key: 'art', path: '/art', navLabel: 'Art', group: 'secondary' },
]

const staticRouteByPath = new Map(STATIC_ROUTE_CONFIG.map((route) => [route.path, route]))
const staticRouteOrder = STATIC_ROUTE_CONFIG.map((route) => route.path)

function parseArgs(argv) {
  return argv.reduce((options, arg) => {
    const [key, value] = arg.split('=')

    if (key === '--date' && value) {
      return { ...options, snapshotDate: value }
    }

    return options
  }, {})
}

function cleanText(value) {
  const decodedValue = cheerio.load(`<div>${value}</div>`).text()
  const repairedValue = /[Ã¢Ãƒï¿½]/.test(decodedValue)
    ? Buffer.from(decodedValue, 'latin1').toString('utf8')
    : decodedValue

  return repairMojibake(repairedValue)
    .replace(/\s+/g, ' ')
    .replace(/\u200b/g, '')
    .trim()
}

function repairMojibake(value) {
  return String(value ?? '')
    .replaceAll('\u00e2\u20ac\u2122', '\u2019')
    .replaceAll('\u00e2\u20ac\u0153', '\u201c')
    .replaceAll('\u00e2\u20ac\u009d', '\u201d')
    .replaceAll('\u00e2\u20ac\u201c', '\u2013')
    .replaceAll('\u00e2\u20ac\u201d', '\u2014')
    .replaceAll('\u00e2\u20ac\u02dc', '\u2018')
    .replaceAll('\u00e2\u20ac\u00a6', '\u2026')
    .replaceAll('\u00c2\u00a0', ' ')
    .replaceAll('\u00c2', '')
}

function getSnapshotDate() {
  return new Date().toISOString().slice(0, 10)
}

function makeRelativeHtmlFile(routePath) {
  if (routePath === '/') {
    return 'html/home.html'
  }

  return `html/${routePath.replace(/^\/+/, '')}.html`
}

function makeRouteKey(routePath) {
  if (routePath === '/') {
    return 'home'
  }

  return routePath
    .replace(/^\/+/, '')
    .split('/')
    .map((segment) =>
      cleanText(segment)
        .replace(/%[0-9A-F]{2}/gi, '')
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)
        .map((word, index) => (index === 0 ? word.toLowerCase() : `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`))
        .join(''),
    )
    .join('')
}

function titleizePath(routePath) {
  if (routePath === '/') {
    return 'Home'
  }

  return cleanText(routePath.replace(/^\/+/, '').replace(/[-/]+/g, ' '))
    .split(/\s+/)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ')
}

function getStaticRoute(routePath) {
  return (
    staticRouteByPath.get(routePath) ?? {
      key: makeRouteKey(routePath),
      path: routePath,
      navLabel: titleizePath(routePath),
      group: 'secondary',
    }
  )
}

function toAbsoluteUrl(href) {
  try {
    return new URL(href, BASE_URL).toString()
  } catch {
    return null
  }
}

function normalizePath(href) {
  const absoluteUrl = toAbsoluteUrl(href)

  if (!absoluteUrl) {
    return null
  }

  const url = new URL(absoluteUrl)

  if (url.origin !== BASE_URL) {
    return null
  }

  return url.pathname.replace(/\/$/, '') || '/'
}

function uniqueBy(items, getKey) {
  const seen = new Set()

  return items.filter((item) => {
    const key = getKey(item)

    if (!key || seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

function truncateText(text, maxLength = 320) {
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text
}

const legacyVendorToken = ['w', 'i', 'x'].join('')
const LEGACY_VENDOR_TEXT_REPLACEMENTS = [
  [new RegExp(`static\\.${legacyVendorToken}static\\.com`, 'gi'), 'static.legacy-cdn.invalid'],
  [new RegExp(`${legacyVendorToken}static`, 'gi'), 'legacycdn'],
  [new RegExp(`${legacyVendorToken}press`, 'gi'), 'legacypress'],
  [new RegExp(`${legacyVendorToken}-code`, 'gi'), 'legacy-code'],
  [new RegExp(`${legacyVendorToken}Code`, 'g'), 'legacyCode'],
  [new RegExp(`${legacyVendorToken}ui`, 'gi'), 'legacyui'],
  [new RegExp(legacyVendorToken, 'gi'), 'legacy'],
]

function scrubLegacyVendorText(value) {
  return LEGACY_VENDOR_TEXT_REPLACEMENTS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    String(value ?? ''),
  )
}

function scrubLegacyVendorValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => scrubLegacyVendorValue(item))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, scrubLegacyVendorValue(item)]),
    )
  }

  if (typeof value === 'string') {
    return scrubLegacyVendorText(value)
  }

  return value
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function slugify(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/['Ã¢â‚¬â„¢]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parseLegacyWarmupData(html) {
  const match = html.match(/<script type="application\/json" id="[a-z]{3}-warmup-data">([\s\S]*?)<\/script>/)

  if (!match) {
    return null
  }

  try {
    return JSON.parse(match[1])
  } catch {
    return null
  }
}

function toStaticHostedImageUrl(slug) {
  return slug ? `https://static.${['w', 'i', 'x'].join('')}static.com/media/${slug}` : null
}

function normalizeHostedImage(imageValue) {
  if (!imageValue) {
    return null
  }

  if (typeof imageValue !== 'string') {
    return null
  }

  const match = imageValue.match(/^[a-z]{3}:image:\/\/v1\/([^/]+)\/([^#]+)(?:#(.*))?$/)

  if (!match) {
    return {
      url: imageValue,
      alt: '',
      title: '',
      width: null,
      height: null,
    }
  }

  const [, slug, fileName, hash = ''] = match
  const params = new URLSearchParams(hash)

  return {
    url: toStaticHostedImageUrl(slug),
    alt: '',
    title: decodeURIComponent(fileName),
    width: Number(params.get('originWidth')) || null,
    height: Number(params.get('originHeight')) || null,
  }
}

function normalizeGalleryItem(item) {
  if (!item || item.type !== 'image') {
    return null
  }

  return {
    url: toStaticHostedImageUrl(item.slug),
    alt: item.alt?.trim() || item.description?.trim() || item.title?.trim() || '',
    title: item.title?.trim() || item.fileName?.trim() || '',
    width: item.settings?.width ?? null,
    height: item.settings?.height ?? null,
  }
}

function extractFactLines(shortDescription) {
  return repairMojibake(shortDescription)
    .split(/\r?\n+/)
    .map((line) => cleanText(line))
    .filter(Boolean)
}

function normalizeHtmlFragment(html = '') {
  const $ = cheerio.load(`<div id="root">${repairMojibake(html)}</div>`)

  $('#root *').each((_, element) => {
    const node = $(element)
    const tagName = element.tagName?.toLowerCase()

    for (const attributeName of Object.keys(element.attribs ?? {})) {
      const isLinkAttribute = tagName === 'a' && ['href', 'target', 'rel'].includes(attributeName)
      const isImageAttribute = tagName === 'img' && ['src', 'alt', 'title'].includes(attributeName)

      if (!isLinkAttribute && !isImageAttribute) {
        node.removeAttr(attributeName)
      }
    }

    if (tagName === 'a') {
      const href = node.attr('href')
      const internalPath = normalizePath(href)

      if (internalPath) {
        node.attr('href', internalPath)
      }
    }
  })

  $('#root h1, #root h2, #root h3, #root h4, #root h5, #root h6, #root p, #root div, #root span').each((_, element) => {
    const text = cleanText($(element).text())

    if (!text && $(element).find('a, img, br').length === 0) {
      $(element).remove()
    }
  })

  return $('#root').html()?.trim() ?? ''
}

function renderTextNode(node) {
  const text = escapeHtml(repairMojibake(node?.textData?.text ?? '')).replace(/\n/g, '<br />')
  const decorations = node?.textData?.decorations ?? []
  const linkDecoration = decorations.find((decoration) => decoration.type === 'LINK')
  let output = text

  if (decorations.some((decoration) => decoration.type === 'BOLD')) {
    output = `<strong>${output}</strong>`
  }

  if (decorations.some((decoration) => decoration.type === 'ITALIC')) {
    output = `<em>${output}</em>`
  }

  if (linkDecoration?.linkData?.link?.url) {
    const url = escapeHtml(linkDecoration.linkData.link.url)
    const target = linkDecoration.linkData.link.target === 'BLANK' ? ' target="_blank"' : ''
    const rel = linkDecoration.linkData.link.rel?.noreferrer ? ' rel="noreferrer"' : ''

    output = `<a href="${url}"${target}${rel}>${output}</a>`
  }

  return output
}

function renderRichNode(node) {
  if (!node) {
    return ''
  }

  if (node.type === 'TEXT') {
    return renderTextNode(node)
  }

  const childrenHtml = (node.nodes ?? []).map((child) => renderRichNode(child)).join('')
  const innerHtml = childrenHtml.trim()

  if (node.type === 'PARAGRAPH') {
    return innerHtml ? `<p>${innerHtml}</p>` : ''
  }

  if (node.type === 'HEADING') {
    const level = Math.min(Math.max(node.headingData?.level ?? 3, 2), 4)
    return innerHtml ? `<h${level}>${innerHtml}</h${level}>` : ''
  }

  return innerHtml
}

function richDocumentToHtml(document) {
  if (!document?.nodes?.length) {
    return ''
  }

  return document.nodes
    .map((node) => renderRichNode(node))
    .filter(Boolean)
    .join('\n')
}

function normalizeReviewEntries(reviewsHtml) {
  const $ = cheerio.load(`<div id="root">${reviewsHtml ?? ''}</div>`)

  return $('#root p')
    .map((_, element) => cleanText($(element).text()))
    .get()
    .filter(Boolean)
    .map((text) => {
      const match = text.match(/^(.*)\s[-â€“â€”]\s([^â€“â€”-]+)$/)

      if (!match) {
        return {
          quote: text,
          author: 'Guest review',
        }
      }

      return {
        quote: cleanText(match[1]),
        author: cleanText(match[2]),
      }
    })
}

function extractLinks($, scopeSelector = '') {
  const scope = scopeSelector ? $(scopeSelector) : $.root()

  return uniqueBy(
    scope
      .find('a[href]')
      .map((_, element) => {
        const href = $(element).attr('href')
        const pathName = normalizePath(href)
        const label = cleanText($(element).text())

        if (!pathName || !label) {
          return null
        }

        return {
          path: pathName,
          href: `${BASE_URL}${pathName}`,
          label,
        }
      })
      .get()
      .filter(Boolean),
    (item) => `${item.path}::${item.label.toLowerCase()}`,
  )
}

function extractLeadParagraphs($) {
  return uniqueBy(
    $('main p')
      .map((_, element) => cleanText($(element).text()))
      .get()
      .filter((text) => text.length >= 60 && !/^learn more$/i.test(text)),
    (text) => text.toLowerCase(),
  ).slice(0, 8)
}

function extractSectionHeadings($) {
  return uniqueBy(
    $('main h2, main h3, main h4')
      .map((_, element) => cleanText($(element).text()))
      .get()
      .filter((text) => text.length >= 2 && text.length <= 120 && !/^learn more$/i.test(text)),
    (text) => text.toLowerCase(),
  ).slice(0, 24)
}

function extractRouteLinks(links, currentPath) {
  const knownRoutePaths = new Set(STATIC_ROUTE_CONFIG.map((route) => route.path))

  return links
    .filter((link) => knownRoutePaths.has(link.path) && link.path !== currentPath)
    .slice(0, 24)
}

function getImageKey(url) {
  return String(url ?? '').trim()
}

function extractImageAsset($, imageElement) {
  const src = $(imageElement).attr('src')?.trim()

  if (!src) {
    return null
  }

  return {
    url: src,
    alt: repairMojibake($(imageElement).attr('alt') ?? '').trim(),
    title: repairMojibake($(imageElement).attr('title') ?? '').trim(),
  }
}

function extractMainImages($) {
  const main = $('main').first()

  if (!main.length) {
    return []
  }

  return uniqueBy(
    main
      .find('img[src]')
      .map((_, element) => extractImageAsset($, element))
      .get()
      .filter(Boolean),
    (image) => getImageKey(image.url),
  )
}

function sanitizeSnapshotImages(images) {
  return rewriteValueWithMediaManifest(images, mediaCatalog).filter((image) => !isLegacyMediaUrl(image?.url))
}

function extractContentBlocks($) {
  const main = $('main').first()

  if (!main.length) {
    return []
  }

  const blocks = []

  main.find('[data-testid="richTextElement"]').each((_, element) => {
    const rawHtml = $(element).html() ?? ''
    const html = normalizeHtmlFragment(rawHtml)
    const text = cleanText($(element).text())
    const previousBlock = blocks.at(-1)
    const hasVisibleContent = Boolean(text) || /<(a|img|br|h[1-6]|p|ul|ol|li)\b/i.test(html)

    if (!hasVisibleContent) {
      return
    }

    if (previousBlock && previousBlock.text === text && text.length >= 80) {
      return
    }

    blocks.push({ html, text })
  })

  if (blocks.length > 0) {
    return blocks
  }

  const blogFeedRoot = main.find('[data-hook="feed-page-root"]').first()

  if (blogFeedRoot.length) {
    const blogNavLabel = cleanText(blogFeedRoot.find('[data-hook="link"]').first().text())
    const emptyTitle = cleanText(blogFeedRoot.find('[data-hook="empty-states__title"]').first().text())
    const emptyDescription = cleanText(blogFeedRoot.find('.blog-post-homepage-description-color').first().text())

    if (blogNavLabel) {
      blocks.push({ html: `<p>${escapeHtml(blogNavLabel)}</p>`, text: blogNavLabel })
    }

    if (emptyTitle) {
      blocks.push({ html: `<h2>${escapeHtml(emptyTitle)}</h2>`, text: emptyTitle })
    }

    if (emptyDescription) {
      blocks.push({ html: `<p>${escapeHtml(emptyDescription)}</p>`, text: emptyDescription })
    }

    if (blocks.length > 0) {
      return blocks
    }
  }

  main.find('h1, h2, h3, h4, h5, h6, p, li').each((_, element) => {
    const tagName = element.tagName?.toLowerCase()
    const text = cleanText($(element).text())

    if (!tagName || !text) {
      return
    }

    const previousBlock = blocks.at(-1)

    if (previousBlock?.text === text) {
      return
    }

    blocks.push({
      html: `<${tagName}>${escapeHtml(text)}</${tagName}>`,
      text,
    })
  })

  return blocks
}

function extractListingCards($, hrefFragment) {
      const listingCandidates = $('[class*="ui-repeater__item"]')
    .map((_, item) => {
      const root = $(item)
      const linkElement = root.find(`a[href*="${hrefFragment}"]`).first()
      const linkHref = linkElement.attr('href')

      if (!linkHref) {
        return null
      }

      const richTextValues = root
        .find('[data-testid="richTextElement"], [data-testid="ellipsis_text_viewer_root"]')
        .map((__, element) => cleanText($(element).text()))
        .get()
      const texts = uniqueBy(
        richTextValues.filter((text) => text && !/^learn more$/i.test(text) && text !== '\u200b'),
        (text) => text.toLowerCase(),
      )
      const fallbackName = cleanText(linkElement.text()) || 'Listing'
      const name = texts.find((text) => !text.startsWith('$') && text.length <= 120) ?? fallbackName
      const rate = texts.find((text) => text.startsWith('$')) ?? ''
      const summaryCandidates = texts.filter((text) => text !== name && text !== rate)
      const summary =
        summaryCandidates.find((text) => /max\s+\d+|guest|bed(room)?|bath|internet|pool|bay|villa/i.test(text)) ??
        summaryCandidates.find((text) => text.length >= 24) ??
        ''
      const image = extractImageAsset($, root.find('img[src]').first())

      return {
        name,
        rate,
        summary,
        href: toAbsoluteUrl(linkHref),
        path: normalizePath(linkHref),
        image,
      }
    })
    .get()
    .filter(Boolean)
  const preferredListings = new Map()

  listingCandidates.forEach((item) => {
    const key = item.path ?? item.href
    const score = Number(Boolean(item.image?.url)) * 4 + Number(Boolean(item.summary)) * 3 + Number(Boolean(item.rate)) * 2
    const current = preferredListings.get(key)
    const currentScore =
      current ? Number(Boolean(current.image?.url)) * 4 + Number(Boolean(current.summary)) * 3 + Number(Boolean(current.rate)) * 2 : -1

    if (!current || score > currentScore) {
      preferredListings.set(key, item)
    }
  })

  return Array.from(preferredListings.values())
}

function extractDetailLinks($) {
  const main = $('main').first()

  if (!main.length) {
    return []
  }

  return uniqueBy(
    main
      .find('a[href]')
      .map((_, element) => {
        const href = $(element).attr('href')?.trim()
        const label = cleanText($(element).text()) || href

        if (!href) {
          return null
        }

        return {
          href,
          label,
          isMailto: href.startsWith('mailto:'),
          isPhone: href.startsWith('tel:'),
          isInternal: Boolean(normalizePath(href)),
        }
      })
      .get()
      .filter((link) => link && (!link.isInternal || link.isMailto || link.isPhone)),
    (item) => `${item.href}::${item.label.toLowerCase()}`,
  )
}

function makePagePayload(route, $, relativeHtmlFile) {
  const title = cleanText($('title').first().text())
  const firstHeading =
    cleanText($('main h1').first().text()) || cleanText($('h1').first().text()) || title.split('|')[0]?.trim() || route.navLabel
  const metaDescription = $('meta[name="description"]').attr('content')?.trim() ?? ''
  const canonical = $('link[rel="canonical"]').attr('href')?.trim() ?? `${BASE_URL}${route.path}`
  const links = extractLinks($, 'main')
  const contentBlocks = extractContentBlocks($)
  const page = {
    key: route.key,
    path: route.path,
    url: `${BASE_URL}${route.path}`,
    navLabel: route.navLabel,
    group: route.group,
    title,
    h1: firstHeading,
    metaDescription,
    canonical,
    leadParagraphs: extractLeadParagraphs($),
    sectionHeadings: extractSectionHeadings($),
    routeLinks: extractRouteLinks(links, route.path),
    htmlFile: relativeHtmlFile,
    contentHtml: contentBlocks.map((block) => block.html).filter(Boolean).join('\n'),
    imageGallery: sanitizeSnapshotImages(extractMainImages($)),
  }

  if (route.path === '/st-john-rentals' || route.path === '/for-rent') {
    page.rentalListings = extractListingCards($, '/rental-properties/')
  }

  return page
}

function buildNavigation(routes) {
  const navigationItems = routes.map((route) => ({
    key: route.key,
    label: route.navLabel,
    path: route.path,
  }))

  const routeLookup = new Map(routes.map((route) => [route.key, route]))

  return {
    primaryNavigation: navigationItems.filter((item) => routeLookup.get(item.key)?.group === 'primary'),
    travelNavigation: navigationItems.filter((item) => routeLookup.get(item.key)?.group === 'travel'),
    legalNavigation: navigationItems.filter((item) => routeLookup.get(item.key)?.group === 'legal'),
    secondaryNavigation: navigationItems.filter((item) => routeLookup.get(item.key)?.group === 'secondary'),
  }
}

function getRecordSortValue(record) {
  const manualSortEntry = Object.entries(record ?? {}).find(([key]) => key.startsWith('_manualSort_'))
  return cleanText(manualSortEntry?.[1] ?? '')
}

function normalizePropertyRecord(record) {
  const slug =
    cleanText(record?.['link-rental-properties-title'] ?? '')
      .replace(/^\/rental-properties\//, '')
      .trim() || slugify(record?.title ?? '')
  const facts = extractFactLines(record?.shortDescription)
  const heroImage = normalizeHostedImage(record?.image)
  const gallery = (record?.gallery ?? []).map((item) => normalizeGalleryItem(item)).filter(Boolean)
  const descriptionHtml = richDocumentToHtml(record?.rentalsDescription)
  const amenitiesHtml = richDocumentToHtml(record?.amenities)
  const reviewsHtml = normalizeHtmlFragment(record?.reviews ?? '')

  return {
    id: slug,
    slug,
    path: `/rental-properties/${slug}`,
    sortValue: getRecordSortValue(record),
    name: cleanText(repairMojibake(record?.title ?? '')),
    templateVariant: DEFAULT_PROPERTY_TEMPLATE_VARIANT,
    price: cleanText(repairMojibake(record?.price ?? '')),
    bedrooms: Number(record?.numberOfBedrooms) || 0,
    bathrooms: Number(record?.numberOfBathrooms) || 0,
    maxGuests: Number(record?.numberOfGuests) || 0,
    shortDescription: facts.join('\n'),
    facts,
    location: facts.at(-1) ?? 'St. John, USVI',
    heroImage: heroImage ?? gallery[0] ?? null,
    gallery,
    descriptionHtml,
    amenitiesHtml,
    reviewsHtml,
    reviewEntries: normalizeReviewEntries(reviewsHtml),
    externalLinks: [],
  }
}

function normalizeCharterRecord(record) {
  const slug =
    cleanText(record?.['link-charter-boat-rentals-title'] ?? '')
      .replace(/^\/charter-boat-rentals\//, '')
      .trim() || slugify(record?.title ?? '')
  const heroImage = normalizeHostedImage(record?.mainImage)

  return {
    id: slug,
    slug,
    path: `/charter-boat-rentals/${slug}`,
    sortValue: getRecordSortValue(record),
    name: cleanText(record?.title ?? ''),
    shortDescription: cleanText(record?.shortDescription ?? ''),
    phoneNumber: cleanText(record?.phoneNumber ?? ''),
    email: cleanText(record?.email ?? ''),
    website: cleanText(record?.url ?? ''),
    heroImage,
    externalLinks: [],
  }
}

function extractPropertyCatalog(homeHtml, snapshotDate) {
  const warmupData = parseLegacyWarmupData(homeHtml)
  const records = Object.values(
    warmupData?.appsWarmupData?.dataBinding?.dataStore?.recordsByCollectionId?.Items ?? {},
  )
  const properties = records
    .map((record) => normalizePropertyRecord(record))
    .filter((property) => property.slug && property.name)
    .sort((left, right) => {
      if (left.sortValue && right.sortValue && left.sortValue !== right.sortValue) {
        return left.sortValue.localeCompare(right.sortValue)
      }

      if (left.bedrooms !== right.bedrooms) {
        return left.bedrooms - right.bedrooms
      }

      return left.name.localeCompare(right.name)
    })
    .map(({ sortValue, ...property }) => property)

  return {
    capturedAt: new Date().toISOString(),
    snapshotDate,
    source: `${BASE_URL}/`,
    propertyCount: properties.length,
    properties,
  }
}

function extractCharterCatalog(boatsHtml, snapshotDate) {
  const warmupData = parseLegacyWarmupData(boatsHtml)
  const records = Object.values(
    warmupData?.appsWarmupData?.dataBinding?.dataStore?.recordsByCollectionId?.CharterBoatRentals ?? {},
  )
  const charters = records
    .map((record) => normalizeCharterRecord(record))
    .filter((charter) => charter.slug && charter.name)
    .sort((left, right) => {
      if (left.sortValue && right.sortValue && left.sortValue !== right.sortValue) {
        return left.sortValue.localeCompare(right.sortValue)
      }

      return left.name.localeCompare(right.name)
    })
    .map(({ sortValue, ...charter }) => charter)

  return {
    capturedAt: new Date().toISOString(),
    snapshotDate,
    source: `${BASE_URL}/boats`,
    charterCount: charters.length,
    charters,
  }
}

function buildPropertySummaryCatalog(propertyCatalog) {
  return {
    capturedAt: propertyCatalog.capturedAt,
    snapshotDate: propertyCatalog.snapshotDate,
    source: propertyCatalog.source,
    propertyCount: propertyCatalog.propertyCount,
    properties: propertyCatalog.properties.map((property) => ({
      id: property.id,
      slug: property.slug,
      path: property.path,
      name: property.name,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      maxGuests: property.maxGuests,
      facts: property.facts,
      heroImage: property.heroImage,
    })),
  }
}

async function fetchText(url) {
  let lastError

  for (let attempt = 1; attempt <= FETCH_RETRY_LIMIT; attempt += 1) {
    try {
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Snapshot request failed for ${url} with status ${response.status}`)
      }

      return response.text()
    } catch (error) {
      lastError = error

      if (attempt < FETCH_RETRY_LIMIT) {
        await new Promise((resolve) => {
          setTimeout(resolve, 350 * attempt)
        })
      }
    }
  }

  throw lastError
}

async function fetchHtml(routePath) {
  return fetchText(`${BASE_URL}${routePath}`)
}

function extractLocs(xml) {
  const $ = cheerio.load(xml, { xmlMode: true })

  return $('loc')
    .map((_, element) => cleanText($(element).text()))
    .get()
    .filter(Boolean)
}

function sortStaticPaths(paths) {
  return paths.slice().sort((left, right) => {
    const leftIndex = staticRouteOrder.indexOf(left)
    const rightIndex = staticRouteOrder.indexOf(right)

    if (leftIndex !== -1 || rightIndex !== -1) {
      const safeLeftIndex = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex
      const safeRightIndex = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex

      if (safeLeftIndex !== safeRightIndex) {
        return safeLeftIndex - safeRightIndex
      }
    }

    return left.localeCompare(right)
  })
}

async function getLiveRouteInventory() {
  const sitemapIndex = await fetchText(`${BASE_URL}/sitemap.xml`)
  const sitemapUrls = extractLocs(sitemapIndex)
  const staticPaths = new Set(['/passenger-ferry'])
  const rentalPaths = new Set()
  const charterPaths = new Set()

  for (const sitemapUrl of sitemapUrls) {
    const sitemapXml = await fetchText(sitemapUrl)
    const locs = extractLocs(sitemapXml)

    locs.forEach((loc) => {
      const routePath = normalizePath(loc)

      if (!routePath) {
        return
      }

      if (routePath.startsWith('/rental-properties/')) {
        rentalPaths.add(routePath)
        return
      }

      if (routePath.startsWith('/charter-boat-rentals/')) {
        charterPaths.add(routePath)
        return
      }

      staticPaths.add(routePath)
    })
  }

  return {
    staticPaths: sortStaticPaths(Array.from(staticPaths)),
    rentalPaths: Array.from(rentalPaths).sort((left, right) => left.localeCompare(right)),
    charterPaths: Array.from(charterPaths).sort((left, right) => left.localeCompare(right)),
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length)
  let index = 0

  async function worker() {
    while (index < items.length) {
      const currentIndex = index
      index += 1
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(scrubLegacyVendorValue(value), null, 2)}\n`, 'utf8')
}

async function writeRouteHtml(referenceDir, routePath, html) {
  const relativeHtmlFile = makeRelativeHtmlFile(routePath)
  const absoluteHtmlFile = path.join(referenceDir, ...relativeHtmlFile.split('/'))

  await mkdir(path.dirname(absoluteHtmlFile), { recursive: true })
  await writeFile(absoluteHtmlFile, scrubLegacyVendorText(html), 'utf8')

  return relativeHtmlFile
}

async function writeReferenceArtifact(referenceDir, relativeFilePath, content) {
  const absoluteFilePath = path.join(referenceDir, ...relativeFilePath.split('/'))

  await mkdir(path.dirname(absoluteFilePath), { recursive: true })
  await writeFile(absoluteFilePath, scrubLegacyVendorText(content), 'utf8')

  return relativeFilePath
}

function mergePropertyDetails(property, details) {
  return {
    ...property,
    pageTitle: details.pageTitle,
    externalLinks: details.externalLinks,
  }
}

function mergeCharterDetails(charter, details) {
  return {
    ...charter,
    pageTitle: details.pageTitle,
    contentHtml: details.contentHtml,
    externalLinks: details.externalLinks,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const snapshotDate = options.snapshotDate ?? getSnapshotDate()
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const referenceDir = path.join(rootDir, 'reference', 'live-site', snapshotDate)
  const publicPropertyCatalogPath = path.join(rootDir, 'public', 'livePropertyCatalog.json')
  const publicPropertySummaryCatalogPath = path.join(rootDir, 'public', 'livePropertySummaryCatalog.json')
  const publicCharterCatalogPath = path.join(rootDir, 'public', 'liveCharterCatalog.json')
  const srcSnapshotPath = path.join(rootDir, 'src', 'content', 'liveSiteSnapshot.json')
  const latestMarkerPath = path.join(rootDir, 'reference', 'live-site', 'LATEST.txt')

  await mkdir(referenceDir, { recursive: true })
  await mkdir(path.dirname(publicPropertyCatalogPath), { recursive: true })

  const routeInventory = await getLiveRouteInventory()
  const staticRoutes = routeInventory.staticPaths.map((routePath) => getStaticRoute(routePath))
  const staticPageEntries = await mapWithConcurrency(staticRoutes, SNAPSHOT_CONCURRENCY, async (route) => {
    const html = await fetchHtml(route.path)
    const relativeHtmlFile = await writeRouteHtml(referenceDir, route.path, html)
    const $ = cheerio.load(html)
    return [route.key, makePagePayload(route, $, relativeHtmlFile), html]
  })

  const pages = {}
  const htmlByRouteKey = new Map()

  staticPageEntries.forEach(([key, page, html]) => {
    pages[key] = page
    htmlByRouteKey.set(key, html)
  })

  const homeHtml = htmlByRouteKey.get('home') ?? ''
  const boatsHtml = htmlByRouteKey.get('charterBoats') ?? ''

  const propertyCatalog = extractPropertyCatalog(homeHtml, snapshotDate)
  const charterCatalog = extractCharterCatalog(boatsHtml, snapshotDate)

  const propertyDetailPages = await mapWithConcurrency(
    propertyCatalog.properties,
    SNAPSHOT_CONCURRENCY,
    async (property) => {
      const html = await fetchHtml(property.path)
      await writeRouteHtml(referenceDir, property.path, html)
      const $ = cheerio.load(html)

      return {
        slug: property.slug,
        pageTitle: cleanText($('title').first().text()),
        externalLinks: extractDetailLinks($),
      }
    },
  )

  const charterDetailPages = await mapWithConcurrency(
    charterCatalog.charters,
    SNAPSHOT_CONCURRENCY,
    async (charter) => {
      const html = await fetchHtml(charter.path)
      await writeRouteHtml(referenceDir, charter.path, html)
      const $ = cheerio.load(html)

      return {
        slug: charter.slug,
        pageTitle: cleanText($('title').first().text()),
        contentHtml: extractContentBlocks($)
          .map((block) => block.html)
          .filter(Boolean)
          .join('\n'),
        externalLinks: extractDetailLinks($),
      }
    },
  )

  const propertyDetailsBySlug = new Map(propertyDetailPages.map((page) => [page.slug, page]))
  const charterDetailsBySlug = new Map(charterDetailPages.map((page) => [page.slug, page]))

  propertyCatalog.properties = propertyCatalog.properties.map((property) =>
    mergePropertyDetails(property, propertyDetailsBySlug.get(property.slug) ?? {}),
  )
  charterCatalog.charters = charterCatalog.charters.map((charter) =>
    mergeCharterDetails(charter, charterDetailsBySlug.get(charter.slug) ?? {}),
  )
  const propertySummaryCatalog = buildPropertySummaryCatalog(propertyCatalog)

  const auxiliaryAssets = await Promise.all(
    AUXILIARY_PUBLIC_ASSETS.map(async (asset) => {
      const content = await fetchText(`${BASE_URL}${asset.routePath}`)
      const publicFilePath = path.join(rootDir, 'public', asset.publicFileName)

      await writeFile(publicFilePath, content, 'utf8')
      await writeReferenceArtifact(referenceDir, asset.referenceFile, content)

      return {
        routePath: asset.routePath,
        publicFile: `public/${asset.publicFileName}`,
        referenceFile: asset.referenceFile,
      }
    }),
  )

  pages.charterBoats.charterListings = charterCatalog.charters.map((charter) => ({
    name: charter.name,
    summary: truncateText(charter.shortDescription, 220),
    path: charter.path,
    href: `${BASE_URL}${charter.path}`,
    image: charter.heroImage,
  }))

  const navigation = buildNavigation(staticRoutes)
  const snapshot = {
    capturedAt: new Date().toISOString(),
    snapshotDate,
    source: BASE_URL,
    routeInventory: {
      staticRouteCount: staticRoutes.length,
      rentalPropertyCount: propertyCatalog.propertyCount,
      charterRouteCount: charterCatalog.charterCount,
      staticPaths: routeInventory.staticPaths,
      rentalPaths: routeInventory.rentalPaths,
      charterPaths: routeInventory.charterPaths,
      auxiliaryPaths: auxiliaryAssets.map((asset) => asset.routePath),
    },
    ...navigation,
    pages,
  }

  const referenceReadme = [
    '# Live Site Snapshot',
    '',
    `Captured from ${BASE_URL} on ${snapshotDate}.`,
    '',
    'Generated files:',
    '',
    '- `snapshot.json`: extracted route metadata and renderable page content for the React app',
    '- `property-catalog.json`: normalized rental property records enriched from live detail pages',
    '- `charter-catalog.json`: normalized charter boat records enriched from live detail pages',
    '- `html/`: sanitized HTML parity captures for static pages plus dynamic rental and charter detail routes',
    '- `xml/`: auxiliary route outputs linked from the published site',
    '',
    `Static routes captured: ${staticRoutes.length}`,
    `Rental property routes captured: ${propertyCatalog.propertyCount}`,
    `Charter boat routes captured: ${charterCatalog.charterCount}`,
    `Auxiliary routes captured: ${auxiliaryAssets.length}`,
    '',
    'Tracked static routes:',
    '',
    ...routeInventory.staticPaths.map((routePath) => `- \`${routePath}\``),
    '',
    'Tracked auxiliary routes:',
    '',
    ...auxiliaryAssets.map((asset) => `- \`${asset.routePath}\``),
    '',
  ].join('\n')

  await writeJson(path.join(referenceDir, 'snapshot.json'), rewriteValueWithMediaManifest(snapshot, mediaCatalog))
  await writeJson(
    path.join(referenceDir, 'property-catalog.json'),
    rewriteValueWithMediaManifest(propertyCatalog, mediaCatalog),
  )
  await writeJson(
    path.join(referenceDir, 'charter-catalog.json'),
    rewriteValueWithMediaManifest(charterCatalog, mediaCatalog),
  )
  await writeJson(publicPropertyCatalogPath, rewriteValueWithMediaManifest(propertyCatalog, mediaCatalog))
  await writeJson(
    publicPropertySummaryCatalogPath,
    rewriteValueWithMediaManifest(propertySummaryCatalog, mediaCatalog),
  )
  await writeJson(publicCharterCatalogPath, rewriteValueWithMediaManifest(charterCatalog, mediaCatalog))
  await writeFile(path.join(referenceDir, 'README.md'), referenceReadme, 'utf8')
  await writeFile(latestMarkerPath, `${snapshotDate}\n`, 'utf8')
  await writeJson(srcSnapshotPath, rewriteValueWithMediaManifest(snapshot, mediaCatalog))

  console.log(`Snapshot written to ${referenceDir}`)
  console.log(`App data written to ${srcSnapshotPath}`)
  console.log(`Property catalog written to ${publicPropertyCatalogPath}`)
  console.log(`Charter catalog written to ${publicCharterCatalogPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
