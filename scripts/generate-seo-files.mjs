import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CANONICAL_PATH_ALIASES,
  DEFAULT_SITE_DESCRIPTION,
  DEFAULT_SOCIAL_IMAGE,
  SITE_NAME,
  SITE_ORIGIN,
  STATIC_SEO_ROUTES,
  buildBreadcrumbJsonLd,
  buildCanonicalUrl,
  buildSeoTitle,
  buildSiteJsonLd,
  buildWebPageJsonLd,
  getCanonicalPath,
  getStaticSeoMeta,
  toAbsoluteUrl,
} from '../shared/seoMetadata.js'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(scriptDir, '..')
const publicDir = resolve(rootDir, 'public')
const distDir = resolve(rootDir, 'dist')

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
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

async function readJsonArtifact(relativePath, fallback) {
  try {
    return JSON.parse(await readFile(resolve(rootDir, relativePath), 'utf8'))
  } catch {
    return fallback
  }
}

async function writeIfChanged(targetPath, content) {
  try {
    const currentContent = await readFile(targetPath, 'utf8')

    if (currentContent === content) {
      return
    }
  } catch {}

  await mkdir(dirname(targetPath), { recursive: true })
  await writeFile(targetPath, content, 'utf8')
}

function getImageUrl(image) {
  if (typeof image === 'string') {
    return toAbsoluteUrl(image)
  }

  return toAbsoluteUrl(image?.url || image?.src)
}

function getImageAlt(image, fallback) {
  return normalizeText(image?.alt || image?.title || fallback)
}

function buildPropertyDescription(property) {
  const shortDescription = normalizeText(property.shortDescription)

  if (shortDescription) {
    return shortDescription
  }

  const facts = Array.isArray(property.facts)
    ? property.facts.map((fact) => normalizeText(fact)).filter(Boolean)
    : []

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

function createPropertyRoutes(properties) {
  const routes = []

  properties
    .filter((property) => property?.active !== false && property?.slug && property?.name)
    .forEach((property) => {
      const path = normalizePathname(property.path || `/rental-properties/${property.slug}`)
      const route = {
        path,
        title: `${property.name} | St. John Vacation Rental`,
        description: buildPropertyDescription(property),
        image: getImageUrl(property.heroImage),
        imageAlt: getImageAlt(property.heroImage, property.name),
        priority: '0.7',
        changefreq: 'weekly',
        type: 'article',
        structuredData: buildBreadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'St. John Rentals', path: '/st-john-rentals' },
          { name: property.name, path },
        ]),
      }

      routes.push(route)

      if (Number(property.bedrooms) === 1) {
        routes.push({
          ...route,
          path: `/1bedroom/${property.slug}`,
          canonicalPath: path,
          includeInSitemap: false,
        })
      }
    })

  return routes
}

function createCharterRoutes(charters) {
  return charters
    .filter((charter) => charter?.active !== false && charter?.slug && charter?.name)
    .map((charter) => {
      const path = normalizePathname(charter.path || `/charter-boat-rentals/${charter.slug}`)

      return {
        path,
        title: `${charter.name} | St. John Charter Boat`,
        description: buildCharterDescription(charter),
        image: getImageUrl(charter.heroImage),
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
    })
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
    `    <meta property="og:image:alt" content="${htmlEscape(imageAlt)}" data-seo-prerender="true" />`,
    '    <meta name="twitter:card" content="summary_large_image" data-seo-prerender="true" />',
    `    <meta name="twitter:title" content="${htmlEscape(title)}" data-seo-prerender="true" />`,
    `    <meta name="twitter:description" content="${htmlEscape(description)}" data-seo-prerender="true" />`,
    `    <meta name="twitter:image" content="${htmlEscape(imageUrl)}" data-seo-prerender="true" />`,
    `    <script type="application/ld+json" data-seo-prerender="true">${escapeJsonForScript(structuredData)}</script>`,
  ].join('\n')
}

function injectPrerenderHead(baseHtml, route) {
  const prerenderHead = buildPrerenderHead(route)
  const withoutManagedHead = baseHtml
    .replace(/\s*<title>[\s\S]*?<\/title>/i, '')
    .replace(/\s*<meta\s+name=["']description["'][^>]*>\s*/gi, '\n')
    .replace(/\s*<meta\s+(?:name|property)=["'](?:robots|theme-color|twitter:[^"']+|og:[^"']+)["'][^>]*>\s*/gi, '\n')
    .replace(/\s*<link\s+rel=["']canonical["'][^>]*>\s*/gi, '\n')
    .replace(/\s*<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>\s*/gi, '\n')

  return withoutManagedHead.replace(/\s*<\/head>/i, `\n${prerenderHead}\n  </head>`)
}

function getRouteHtmlTarget(pathname) {
  if (pathname === '/') {
    return resolve(distDir, 'index.html')
  }

  const relativePath = `${pathname.replace(/^\/+/, '')}.html`
  return resolve(distDir, relativePath)
}

async function generatePrerenderedHtml(routes) {
  let baseHtml = ''

  try {
    baseHtml = await readFile(resolve(distDir, 'index.html'), 'utf8')
  } catch {
    return
  }

  await Promise.all(
    routes.map((route) => writeIfChanged(getRouteHtmlTarget(route.path), injectPrerenderHead(baseHtml, route))),
  )
}

async function main() {
  const propertySummaryPayload = await readJsonArtifact('public/livePropertySummaryCatalog.json', { properties: [] })
  const charterPayload = await readJsonArtifact('public/liveCharterCatalog.json', { charters: [] })
  const routeMap = createStaticRoutes()

  ;[
    ...createPropertyRoutes(propertySummaryPayload.properties ?? []),
    ...createCharterRoutes(charterPayload.charters ?? []),
  ].forEach((route) => addRoute(routeMap, route))

  const routes = Array.from(routeMap.values())
  const sitemap = buildSitemap(routes)
  const robots = buildRobotsTxt()

  await Promise.all([
    writeIfChanged(resolve(publicDir, 'sitemap.xml'), sitemap),
    writeIfChanged(resolve(publicDir, 'robots.txt'), robots),
    writeIfChanged(resolve(distDir, 'sitemap.xml'), sitemap),
    writeIfChanged(resolve(distDir, 'robots.txt'), robots),
    generatePrerenderedHtml(routes),
  ])
}

main().catch((error) => {
  console.error('Unable to generate SEO files.')
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
