export const SITE_ORIGIN = 'https://www.stjohnhouserentals.com'
export const SITE_NAME = 'St. John House Rentals'
export const DEFAULT_SITE_DESCRIPTION =
  'Browse St. John vacation rentals, ferry information, charter boats, and island travel resources.'
export const DEFAULT_SOCIAL_IMAGE_VERSION = '20260727'
export const DEFAULT_SOCIAL_IMAGE = `${SITE_ORIGIN}/social-preview.jpg?v=${DEFAULT_SOCIAL_IMAGE_VERSION}`
export const DEFAULT_SOCIAL_IMAGE_WIDTH = 1200
export const DEFAULT_SOCIAL_IMAGE_HEIGHT = 630
export const DEFAULT_SOCIAL_IMAGE_TYPE = 'image/jpeg'

export const CANONICAL_PATH_ALIASES = {
  '/car-rental-ferry-boat-info': '/car-barge-information',
  '/ferrys': '/passenger-ferry',
  '/for-sale': '/property-for-sale',
  '/st-john-rentals': '/for-rent',
}

export const STATIC_SEO_ROUTES = [
  {
    path: '/',
    title: 'St. John House Rentals | Wide Selection of Properties',
    description: 'Explore St. John House Rentals: wide selection of properties for the perfect Caribbean getaway.',
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
    title: 'Rental Accommodations | St. John House Rentals',
    description: 'Discover St. John rental accommodations, villa stays, and island homes for your Caribbean trip.',
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

function normalizePathname(pathname = '/') {
  const rawPathname = String(pathname || '/').split('?')[0].split('#')[0].trim() || '/'
  const withSlash = rawPathname.startsWith('/') ? rawPathname : `/${rawPathname}`
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : '/'
}

function normalizeTitleForComparison(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function titleIncludesSiteName(title) {
  const normalizedTitle = normalizeTitleForComparison(title)
  return normalizedTitle.includes('stjohnhouserental')
}

export function buildSeoTitle(title = '') {
  const normalizedTitle = String(title ?? '').replace(/\s+/g, ' ').trim()

  if (!normalizedTitle || titleIncludesSiteName(normalizedTitle)) {
    return normalizedTitle || SITE_NAME
  }

  return `${normalizedTitle} | ${SITE_NAME}`
}

export function getCanonicalPath(pathname = '/') {
  const normalizedPathname = normalizePathname(pathname)

  if (CANONICAL_PATH_ALIASES[normalizedPathname]) {
    return CANONICAL_PATH_ALIASES[normalizedPathname]
  }

  if (normalizedPathname.startsWith('/1bedroom/')) {
    return `/rental-properties/${normalizedPathname.slice('/1bedroom/'.length)}`
  }

  return normalizedPathname
}

export function buildCanonicalUrl(pathname = '/') {
  const canonicalPath = getCanonicalPath(pathname)
  return `${SITE_ORIGIN}${canonicalPath === '/' ? '/' : canonicalPath}`
}

export function getStaticSeoRoute(pathname = '/') {
  return staticSeoRouteByPath.get(getCanonicalPath(pathname)) ?? null
}

export function getStaticSeoMeta(pathname = '/') {
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

export function toAbsoluteUrl(value) {
  const normalizedValue = String(value ?? '').trim()

  if (!normalizedValue) {
    return ''
  }

  if (/^https?:\/\//i.test(normalizedValue)) {
    return normalizedValue
  }

  return `${SITE_ORIGIN}${normalizedValue.startsWith('/') ? normalizedValue : `/${normalizedValue}`}`
}

export function buildSiteJsonLd() {
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

export function buildWebPageJsonLd({
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

export function buildBreadcrumbJsonLd(items = []) {
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
