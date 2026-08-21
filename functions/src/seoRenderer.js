const SITE_ORIGIN = 'https://www.stjohnhouserentals.com'
const SITE_NAME = 'St. John House Rentals'
const DEFAULT_SITE_DESCRIPTION =
  'Browse St. John vacation rentals, ferry information, charter boats, and island travel resources.'
const DEFAULT_SOCIAL_IMAGE_VERSION = '20260727'
const DEFAULT_SOCIAL_IMAGE = `${SITE_ORIGIN}/social-preview.jpg?v=${DEFAULT_SOCIAL_IMAGE_VERSION}`
const DEFAULT_SOCIAL_IMAGE_WIDTH = 1200
const DEFAULT_SOCIAL_IMAGE_HEIGHT = 630
const DEFAULT_SOCIAL_IMAGE_TYPE = 'image/jpeg'

const CANONICAL_PATH_ALIASES = {
  '/car-rental-ferry-boat-info': '/car-barge-information',
  '/ferrys': '/passenger-ferry',
  '/for-sale': '/property-for-sale',
  '/st-john-rentals': '/',
}

const STATIC_SEO_ROUTES = [
  {
    path: '/',
    title: 'Rental Accommodations | St. John House Rentals',
    description: 'Discover St. John rental accommodations, villa stays, and island homes for your Caribbean trip.',
    priority: '1.0',
    changefreq: 'weekly',
  },
  {
    path: '/about-us',
    title: 'About | St. John House Rentals',
    description: 'Learn about St. John House Rentals, local island guides connecting visitors with St. John homes and services.',
    priority: '0.8',
    changefreq: 'monthly',
  },
  {
    path: '/for-rent',
    title: 'St. John House Rentals | Wide Selection of Properties',
    description: 'Explore St. John House Rentals: wide selection of properties for the perfect Caribbean getaway.',
    priority: '0.9',
    changefreq: 'weekly',
  },
  {
    path: '/property-for-sale',
    title: 'Property For Sale | St. John House Rentals',
    description: 'Explore St. John property for sale, island real estate resources, and local contact information.',
    priority: '0.7',
    changefreq: 'monthly',
  },
  {
    path: '/car-barge-information',
    title: 'Car Barge Information | St. John House Rentals',
    description: 'Get St. Thomas to St. John car barge information, schedules, rates, and travel tips for rental vehicles.',
    priority: '0.8',
    changefreq: 'monthly',
  },
  {
    path: '/cbtest',
    title: 'Car Barge Information | St. John House Rentals',
    description: 'Get St. Thomas to St. John car barge information, schedules, rates, and travel tips for rental vehicles.',
    priority: '0.3',
    changefreq: 'monthly',
  },
  {
    path: '/passenger-ferry',
    title: 'Passenger Ferry | St. John House Rentals',
    description: 'Find passenger ferry schedules, departure points, rates, and travel tips for getting to St. John.',
    priority: '0.8',
    changefreq: 'monthly',
  },
  {
    path: '/cars',
    title: 'St. John Car Rentals | St. John House Rentals',
    description: 'Rent 4WD cars on St. John or St. Thomas. Navigate island roads and the car ferry with local rental options.',
    priority: '0.8',
    changefreq: 'monthly',
  },
  {
    path: '/boats',
    title: 'Charter Boats | St. John House Rentals',
    description: 'Find sailboat and powerboat charters in St. John waters, including snorkel tours and day sails.',
    priority: '0.8',
    changefreq: 'monthly',
  },
  {
    path: '/map',
    title: 'Local Attractions | St. John House Rentals',
    description: 'Use the St. John map to find beaches, trails, restaurants, and local island attractions.',
    priority: '0.7',
    changefreq: 'monthly',
  },
  {
    path: '/advertise',
    title: 'Advertise | St. John House Rentals',
    description: 'Advertise your St. John rental property with a local vacation rental site serving island visitors since 1999.',
    priority: '0.6',
    changefreq: 'monthly',
  },
  {
    path: '/privacy-policy',
    title: 'Privacy Policy | St. John House Rentals',
    description: 'Read how St. John House Rentals protects and manages personal data submitted through this website.',
    priority: '0.3',
    changefreq: 'yearly',
  },
  {
    path: '/terms-of-agreement',
    title: 'Terms of Agreement | St. John House Rentals',
    description: 'Read the terms of agreement for using St. John House Rentals rental advertising and service information.',
    priority: '0.3',
    changefreq: 'yearly',
  },
  {
    path: '/blog',
    title: 'Blog | St. John House Rentals',
    description: 'Read St. John House Rentals blog updates, island guides, travel tips, and local stories.',
    priority: '0.5',
    changefreq: 'monthly',
  },
  {
    path: '/jewelry',
    title: 'Jewelry | St. John House Rentals',
    description: 'Explore unique St. John jewelry, handmade designs, and island-inspired keepsakes.',
    priority: '0.4',
    changefreq: 'monthly',
  },
  {
    path: '/links',
    title: 'Helpful St. John Links | St. John House Rentals',
    description: 'Find essential St. John links for local services, tourism information, transportation, and trip planning.',
    priority: '0.5',
    changefreq: 'monthly',
  },
  {
    path: '/st-john-book',
    title: 'St. John Books | St. John House Rentals',
    description: 'Find books about St. John, travel guides, and local stories to enrich your island visit.',
    priority: '0.4',
    changefreq: 'monthly',
  },
  {
    path: '/art',
    title: 'Art | St. John House Rentals',
    description: 'Discover local St. John art, galleries, and handcrafted island pieces inspired by the Caribbean.',
    priority: '0.4',
    changefreq: 'monthly',
  },
]

const staticSeoRouteByPath = new Map(STATIC_SEO_ROUTES.map((route) => [route.path, route]))

const HTML_ENTITY_DECODE_MAP = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
}

function decodeBasicHtmlEntities(value) {
  return String(value ?? '').replace(
    /&(?:nbsp|amp|lt|gt|quot|#39|apos);/gi,
    (match) => HTML_ENTITY_DECODE_MAP[match.toLowerCase()] ?? match,
  )
}

function htmlToPlainText(value) {
  return decodeBasicHtmlEntities(
    String(value ?? '')
      .replace(/<\/p>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
}

function normalizeText(value) {
  return htmlToPlainText(value).replace(/\s+/g, ' ').trim()
}

function normalizePathname(pathname = '/') {
  const normalizedPathname = String(pathname || '/').split('?')[0].split('#')[0].trim() || '/'
  const withSlash = normalizedPathname.startsWith('/') ? normalizedPathname : `/${normalizedPathname}`
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : '/'
}

function xmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function htmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function escapeJsonForScript(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}

function normalizeTitleForComparison(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function titleIncludesSiteName(title) {
  const normalizedTitle = normalizeTitleForComparison(title)
  return normalizedTitle.includes('stjohnhouserental')
}

function buildSeoTitle(title = '') {
  const normalizedTitle = String(title ?? '').replace(/\s+/g, ' ').trim()

  if (!normalizedTitle || titleIncludesSiteName(normalizedTitle)) {
    return normalizedTitle || SITE_NAME
  }

  return `${normalizedTitle} | ${SITE_NAME}`
}

function getCanonicalPath(pathname = '/') {
  const normalizedPathname = normalizePathname(pathname)

  if (CANONICAL_PATH_ALIASES[normalizedPathname]) {
    return CANONICAL_PATH_ALIASES[normalizedPathname]
  }

  if (normalizedPathname.startsWith('/1bedroom/')) {
    return `/rental-properties/${normalizedPathname.slice('/1bedroom/'.length)}`
  }

  return normalizedPathname
}

function buildCanonicalUrl(pathname = '/') {
  const canonicalPath = getCanonicalPath(pathname)
  return `${SITE_ORIGIN}${canonicalPath === '/' ? '/' : canonicalPath}`
}

function getStaticSeoMeta(pathname = '/') {
  const canonicalPath = getCanonicalPath(pathname)
  const route = staticSeoRouteByPath.get(canonicalPath)

  if (!route) {
    return null
  }

  return {
    ...route,
    canonicalPath,
    canonicalUrl: buildCanonicalUrl(canonicalPath),
    image: route.image || DEFAULT_SOCIAL_IMAGE,
    imageAlt: route.imageAlt || SITE_NAME,
  }
}

function toAbsoluteUrl(value) {
  const normalizedValue = String(value ?? '').trim()

  if (!normalizedValue) {
    return ''
  }

  if (/^https?:\/\//i.test(normalizedValue)) {
    return normalizedValue
  }

  return `${SITE_ORIGIN}${normalizedValue.startsWith('/') ? normalizedValue : `/${normalizedValue}`}`
}

function buildSiteJsonLd() {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SITE_NAME,
      url: `${SITE_ORIGIN}/`,
      logo: toAbsoluteUrl('/favicon.svg'),
      sameAs: ['https://www.facebook.com/houserentalsVI/'],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      url: `${SITE_ORIGIN}/`,
      publisher: {
        '@type': 'Organization',
        name: SITE_NAME,
      },
    },
  ]
}

function buildWebPageJsonLd({
  title = SITE_NAME,
  description = DEFAULT_SITE_DESCRIPTION,
  canonicalUrl = `${SITE_ORIGIN}/`,
  image = DEFAULT_SOCIAL_IMAGE,
} = {}) {
  const payload = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: buildSeoTitle(title),
    description: String(description || DEFAULT_SITE_DESCRIPTION).replace(/\s+/g, ' ').trim(),
    url: canonicalUrl,
    isPartOf: {
      '@type': 'WebSite',
      name: SITE_NAME,
      url: `${SITE_ORIGIN}/`,
    },
  }
  const imageUrl = toAbsoluteUrl(typeof image === 'string' ? image : image?.url || image?.src)

  if (imageUrl) {
    payload.image = imageUrl
  }

  return payload
}

function buildBreadcrumbJsonLd(items = []) {
  const itemListElement = items
    .map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: String(item?.name ?? '').trim(),
      item: toAbsoluteUrl(item?.path || item?.url),
    }))
    .filter((item) => item.name && item.item)

  if (itemListElement.length === 0) {
    return null
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement,
  }
}

function getImageUrl(image) {
  if (typeof image === 'string') {
    return toAbsoluteUrl(image)
  }

  return toAbsoluteUrl(image?.url || image?.src)
}

function normalizePositiveInteger(value) {
  const number = Number.parseInt(value, 10)
  return Number.isFinite(number) && number > 0 ? String(number) : ''
}

function getImageWidth(image, imageUrl) {
  if (isDefaultSocialImageUrl(imageUrl)) {
    return String(DEFAULT_SOCIAL_IMAGE_WIDTH)
  }

  return typeof image === 'object' && image ? normalizePositiveInteger(image.width) : ''
}

function getImageHeight(image, imageUrl) {
  if (isDefaultSocialImageUrl(imageUrl)) {
    return String(DEFAULT_SOCIAL_IMAGE_HEIGHT)
  }

  return typeof image === 'object' && image ? normalizePositiveInteger(image.height) : ''
}

function inferImageTypeFromUrl(imageUrl) {
  let pathname

  try {
    pathname = new URL(imageUrl).pathname
  } catch {
    pathname = String(imageUrl ?? '').split('?')[0]
  }

  const normalizedPathname = String(pathname).toLowerCase()

  if (/\.(?:jpg|jpeg)$/.test(normalizedPathname)) {
    return 'image/jpeg'
  }

  if (/\.png$/.test(normalizedPathname)) {
    return 'image/png'
  }

  if (/\.webp$/.test(normalizedPathname)) {
    return 'image/webp'
  }

  if (/\.gif$/.test(normalizedPathname)) {
    return 'image/gif'
  }

  return ''
}

function getImageType(image, imageUrl) {
  if (isDefaultSocialImageUrl(imageUrl)) {
    return DEFAULT_SOCIAL_IMAGE_TYPE
  }

  const contentType = typeof image === 'object' && image ? normalizeText(image.contentType || image.type || image.mimeType) : ''

  if (/^image\//i.test(contentType)) {
    return contentType
  }

  return inferImageTypeFromUrl(imageUrl)
}

function isDefaultSocialImageUrl(imageUrl) {
  try {
    const defaultUrl = new URL(DEFAULT_SOCIAL_IMAGE)
    const candidateUrl = new URL(toAbsoluteUrl(imageUrl))
    return defaultUrl.origin === candidateUrl.origin && defaultUrl.pathname === candidateUrl.pathname
  } catch {
    return toAbsoluteUrl(imageUrl).split('?')[0] === DEFAULT_SOCIAL_IMAGE.split('?')[0]
  }
}

function getImageAlt(image, fallback) {
  return normalizeText(image?.alt || image?.title || fallback)
}

function buildPropertyDescription(property) {
  const shortDescription = normalizeText(property.shortDescription)

  if (shortDescription) {
    return shortDescription
  }

  const facts = Array.isArray(property.facts) ? property.facts.map((fact) => normalizeText(fact)).filter(Boolean) : []

  if (facts.length > 0) {
    return `St. John vacation rental ${property.name}: ${facts.join(', ')}.`
  }

  return `View ${property.name}, a St. John vacation rental, and contact the owner or manager directly.`
}

function buildCharterDescription(charter) {
  const shortDescription = normalizeText(charter.shortDescription)

  if (shortDescription) {
    return shortDescription
  }

  return `View ${charter.name}, a St. John charter boat listing, and contact the operator directly.`
}

function addRoute(routeMap, route) {
  const path = normalizePathname(route.path)
  const canonicalPath = route.canonicalPath ? normalizePathname(route.canonicalPath) : getCanonicalPath(path)
  const title = normalizeText(route.title) || SITE_NAME
  const description = normalizeText(route.description) || DEFAULT_SITE_DESCRIPTION

  routeMap.set(path, {
    ...route,
    path,
    canonicalPath,
    canonicalUrl: route.canonicalUrl || buildCanonicalUrl(canonicalPath),
    description,
    image: route.image || DEFAULT_SOCIAL_IMAGE,
    imageAlt: normalizeText(route.imageAlt) || SITE_NAME,
    priority: route.priority || '0.6',
    changefreq: route.changefreq || 'monthly',
    title,
  })
}

function createStaticRoutes() {
  const routeMap = new Map()

  STATIC_SEO_ROUTES.forEach((route) => addRoute(routeMap, route))

  Object.entries(CANONICAL_PATH_ALIASES).forEach(([aliasPath, canonicalPath]) => {
    const canonicalMeta = getStaticSeoMeta(canonicalPath)

    if (!canonicalMeta) {
      return
    }

    addRoute(routeMap, {
      ...canonicalMeta,
      path: aliasPath,
      canonicalPath,
      includeInSitemap: false,
    })
  })

  return routeMap
}

function createPropertyRoute(property, pathname = '') {
  const path = normalizePathname(property.path || `/rental-properties/${property.slug}`)
  const routePath = pathname ? normalizePathname(pathname) : path
  const route = {
    path: routePath,
    canonicalPath: path,
    canonicalUrl: buildCanonicalUrl(path),
    title: `${property.pageTitle || property.name} | St. John Vacation Rental`,
    description: buildPropertyDescription(property),
    image: property.heroImage,
    imageAlt: getImageAlt(property.heroImage, property.name),
    priority: '0.7',
    changefreq: 'weekly',
    type: 'article',
    structuredData: buildBreadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Rental Accommodations', path: '/for-rent' },
      { name: property.name, path },
    ]),
  }

  if (routePath !== path) {
    route.includeInSitemap = false
  }

  return route
}

function createPropertyRoutes(properties) {
  const routes = []

  properties
    .filter((property) => property?.active !== false && property?.slug && property?.name)
    .forEach((property) => {
      const route = createPropertyRoute(property)
      routes.push(route)

      if (Number(property.bedrooms) === 1) {
        routes.push({
          ...route,
          path: `/1bedroom/${property.slug}`,
          canonicalPath: route.path,
          includeInSitemap: false,
        })
      }
    })

  return routes
}

function createCharterRoute(charter, pathname = '') {
  const path = normalizePathname(charter.path || `/charter-boat-rentals/${charter.slug}`)
  const routePath = pathname ? normalizePathname(pathname) : path

  return {
    path: routePath,
    canonicalPath: path,
    canonicalUrl: buildCanonicalUrl(path),
    title: `${charter.pageTitle || charter.name} | St. John Charter Boat`,
    description: buildCharterDescription(charter),
    image: charter.heroImage,
    imageAlt: getImageAlt(charter.heroImage, charter.name),
    priority: '0.6',
    changefreq: 'monthly',
    type: 'article',
    structuredData: buildBreadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Charter Boats', path: '/boats' },
      { name: charter.name, path },
    ]),
  }
}

function createCharterRoutes(charters) {
  return charters
    .filter((charter) => charter?.active !== false && charter?.slug && charter?.name)
    .map((charter) => createCharterRoute(charter))
}

function createSeoRoutes({ properties = [], charters = [] } = {}) {
  const routeMap = createStaticRoutes()

  ;[...createPropertyRoutes(properties), ...createCharterRoutes(charters)].forEach((route) => addRoute(routeMap, route))

  return Array.from(routeMap.values())
}

function buildSitemap(routes) {
  const sitemapRoutes = routes
    .filter((route) => route.includeInSitemap !== false)
    .sort((first, second) => first.path.localeCompare(second.path))
  const entries = sitemapRoutes
    .map((route) => {
      const imageUrl = getImageUrl(route.image)
      const imageEntry = imageUrl
        ? [
            '    <image:image>',
            `      <image:loc>${xmlEscape(imageUrl)}</image:loc>`,
            route.imageAlt ? `      <image:caption>${xmlEscape(route.imageAlt)}</image:caption>` : '',
            '    </image:image>',
          ]
            .filter(Boolean)
            .join('\n')
        : ''

      return [
        '  <url>',
        `    <loc>${xmlEscape(route.canonicalUrl)}</loc>`,
        `    <changefreq>${xmlEscape(route.changefreq)}</changefreq>`,
        `    <priority>${xmlEscape(route.priority)}</priority>`,
        imageEntry,
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    entries,
    '</urlset>',
    '',
  ].join('\n')
}

function buildRobotsTxt() {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    '',
    `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
    '',
  ].join('\n')
}

function buildStructuredData(route) {
  return [
    ...buildSiteJsonLd(),
    buildWebPageJsonLd({
      title: route.title,
      description: route.description,
      canonicalUrl: route.canonicalUrl,
      image: route.image,
    }),
    route.structuredData,
  ].filter(Boolean)
}

function buildPrerenderHead(route) {
  const title = buildSeoTitle(route.title)
  const description = normalizeText(route.description) || DEFAULT_SITE_DESCRIPTION
  const imageUrl = getImageUrl(route.image) || DEFAULT_SOCIAL_IMAGE
  const imageAlt = route.imageAlt || SITE_NAME
  const imageWidth = getImageWidth(route.image, imageUrl)
  const imageHeight = getImageHeight(route.image, imageUrl)
  const imageType = getImageType(route.image, imageUrl)
  const robots = route.robots || 'index, follow'
  const structuredData = buildStructuredData(route)

  return [
    `    <title>${htmlEscape(title)}</title>`,
    `    <meta name="description" content="${htmlEscape(description)}" data-seo-prerender="true" />`,
    `    <meta name="robots" content="${htmlEscape(robots)}" data-seo-prerender="true" />`,
    '    <meta name="theme-color" content="#f5f1e8" data-seo-prerender="true" />',
    `    <link rel="canonical" href="${htmlEscape(route.canonicalUrl)}" data-seo-prerender="true" />`,
    `    <meta property="og:site_name" content="${htmlEscape(SITE_NAME)}" data-seo-prerender="true" />`,
    `    <meta property="og:type" content="${htmlEscape(route.type || 'website')}" data-seo-prerender="true" />`,
    `    <meta property="og:title" content="${htmlEscape(title)}" data-seo-prerender="true" />`,
    `    <meta property="og:description" content="${htmlEscape(description)}" data-seo-prerender="true" />`,
    `    <meta property="og:url" content="${htmlEscape(route.canonicalUrl)}" data-seo-prerender="true" />`,
    `    <meta property="og:image" content="${htmlEscape(imageUrl)}" data-seo-prerender="true" />`,
    `    <meta property="og:image:secure_url" content="${htmlEscape(imageUrl)}" data-seo-prerender="true" />`,
    `    <meta property="og:image:alt" content="${htmlEscape(imageAlt)}" data-seo-prerender="true" />`,
    imageWidth ? `    <meta property="og:image:width" content="${imageWidth}" data-seo-prerender="true" />` : '',
    imageHeight ? `    <meta property="og:image:height" content="${imageHeight}" data-seo-prerender="true" />` : '',
    imageType ? `    <meta property="og:image:type" content="${htmlEscape(imageType)}" data-seo-prerender="true" />` : '',
    '    <meta name="twitter:card" content="summary_large_image" data-seo-prerender="true" />',
    `    <meta name="twitter:title" content="${htmlEscape(title)}" data-seo-prerender="true" />`,
    `    <meta name="twitter:description" content="${htmlEscape(description)}" data-seo-prerender="true" />`,
    `    <meta name="twitter:image" content="${htmlEscape(imageUrl)}" data-seo-prerender="true" />`,
    `    <script type="application/ld+json" data-seo-prerender="true">${escapeJsonForScript(structuredData)}</script>`,
  ]
    .filter(Boolean)
    .join('\n')
}

function injectPrerenderHead(baseHtml, route) {
  const prerenderHead = buildPrerenderHead(route)
  const withoutManagedHead = String(baseHtml || '')
    .replace(/\s*<title>[\s\S]*?<\/title>/i, '')
    .replace(/\s*<meta\s+name=["']description["'][^>]*>\s*/gi, '\n')
    .replace(/\s*<meta\s+(?:name|property)=["'](?:robots|theme-color|twitter:[^"']+|og:[^"']+)["'][^>]*>\s*/gi, '\n')
    .replace(/\s*<link\s+rel=["']canonical["'][^>]*>\s*/gi, '\n')
    .replace(/\s*<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>\s*/gi, '\n')

  return withoutManagedHead.replace(/\s*<\/head>/i, `\n${prerenderHead}\n  </head>`)
}

function createNotFoundRoute(pathname = '/') {
  const canonicalPath = normalizePathname(pathname)

  return {
    path: canonicalPath,
    canonicalPath,
    canonicalUrl: buildCanonicalUrl(canonicalPath),
    title: 'Page Not Found',
    description: DEFAULT_SITE_DESCRIPTION,
    image: DEFAULT_SOCIAL_IMAGE,
    imageAlt: SITE_NAME,
    robots: 'noindex, nofollow',
    priority: '0.0',
    changefreq: 'yearly',
  }
}

module.exports = {
  buildRobotsTxt,
  buildSitemap,
  createCharterRoute,
  createNotFoundRoute,
  createPropertyRoute,
  createSeoRoutes,
  createStaticRoutes,
  injectPrerenderHead,
  normalizePathname,
}
