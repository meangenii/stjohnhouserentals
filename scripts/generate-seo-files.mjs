import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CANONICAL_PATH_ALIASES,
  DEFAULT_SITE_DESCRIPTION,
  DEFAULT_SOCIAL_IMAGE,
  DEFAULT_SOCIAL_IMAGE_HEIGHT,
  DEFAULT_SOCIAL_IMAGE_TYPE,
  DEFAULT_SOCIAL_IMAGE_WIDTH,
  SITE_NAME,
  STATIC_SEO_ROUTES,
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
const distDir = resolve(rootDir, 'dist')
const functionsGeneratedDir = resolve(rootDir, 'functions', 'src', 'generated')

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
  return String(value ?? '').replace(/&(?:nbsp|amp|lt|gt|quot|#39|apos);/gi, (match) => HTML_ENTITY_DECODE_MAP[match.toLowerCase()] ?? match)
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

async function removeGeneratedStaticSeoFiles() {
  await Promise.all([
    rm(resolve(distDir, 'sitemap.xml'), { force: true }),
    rm(resolve(distDir, 'robots.txt'), { force: true }),
    rm(resolve(distDir, 'rental-properties'), { force: true, recursive: true }),
    rm(resolve(distDir, '1bedroom'), { force: true, recursive: true }),
    rm(resolve(distDir, 'charter-boat-rentals'), { force: true, recursive: true }),
  ])
}

async function writeDynamicSeoShell() {
  try {
    const baseHtml = await readFile(resolve(distDir, 'index.html'), 'utf8')
    await writeIfChanged(resolve(functionsGeneratedDir, 'indexShell.html'), baseHtml)
  } catch {
    return
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

function isDefaultSocialImageUrl(imageUrl) {
  try {
    const defaultUrl = new URL(DEFAULT_SOCIAL_IMAGE)
    const candidateUrl = new URL(toAbsoluteUrl(imageUrl))
    return defaultUrl.origin === candidateUrl.origin && defaultUrl.pathname === candidateUrl.pathname
  } catch {
    return toAbsoluteUrl(imageUrl).split('?')[0] === DEFAULT_SOCIAL_IMAGE.split('?')[0]
  }
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
  const routeMap = createStaticRoutes()
  const routes = Array.from(routeMap.values())

  await removeGeneratedStaticSeoFiles()
  await writeDynamicSeoShell()
  await generatePrerenderedHtml(routes)
}

main().catch((error) => {
  console.error('Unable to generate SEO files.')
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
