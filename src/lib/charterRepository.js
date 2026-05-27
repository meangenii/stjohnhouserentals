import { getRouteSlugVariants } from './routeSlug'

const liveCatalogUrl = '/liveCharterCatalog.json'

let charterCatalogPromise

function cloneData(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeImageAsset(asset) {
  if (!asset?.url) {
    return null
  }

  return {
    url: String(asset.url).trim(),
    alt: String(asset.alt ?? '').trim(),
    title: String(asset.title ?? '').trim(),
    width: asset.width ?? null,
    height: asset.height ?? null,
  }
}

function normalizeCharterRecord(record) {
  if (!record?.slug || !record?.name) {
    return null
  }

  const externalLinks = Array.isArray(record.externalLinks)
    ? record.externalLinks
        .map((link) => ({
          href: String(link?.href ?? '').trim(),
          label: String(link?.label ?? '').trim(),
          isMailto: Boolean(link?.isMailto),
          isPhone: Boolean(link?.isPhone),
          isInternal: Boolean(link?.isInternal),
        }))
        .filter((link) => link.href && link.label)
    : []

  return {
    ...record,
    id: record.id ?? record.slug,
    slug: String(record.slug).trim(),
    path: String(record.path ?? `/charter-boat-rentals/${record.slug}`).trim(),
    name: String(record.name).trim(),
    shortDescription: String(record.shortDescription ?? '').trim(),
    phoneNumber: String(record.phoneNumber ?? '').trim(),
    email: String(record.email ?? '').trim(),
    website: String(record.website ?? '').trim(),
    heroImage: normalizeImageAsset(record.heroImage),
    pageTitle: String(record.pageTitle ?? '').trim(),
    contentHtml: String(record.contentHtml ?? '').trim(),
    externalLinks,
  }
}

function attachAdjacentCharters(charter, charters) {
  const index = charters.findIndex((candidate) => candidate.slug === charter.slug)

  if (index === -1) {
    return charter
  }

  const previousCharter = charters[index - 1]
  const nextCharter = charters[index + 1]

  return {
    ...charter,
    previousCharter: previousCharter
      ? { slug: previousCharter.slug, name: previousCharter.name, path: previousCharter.path }
      : null,
    nextCharter: nextCharter
      ? { slug: nextCharter.slug, name: nextCharter.name, path: nextCharter.path }
      : null,
  }
}

async function loadCatalog() {
  if (!charterCatalogPromise) {
    charterCatalogPromise = fetch(liveCatalogUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Charter catalog request failed with status ${response.status}`)
        }

        return response.json()
      })
      .then((payload) => {
        const charters = Array.isArray(payload?.charters)
          ? payload.charters.map((charter) => normalizeCharterRecord(charter)).filter(Boolean)
          : []
        const index = new Map()

        charters.forEach((charter) => {
          getRouteSlugVariants(charter.slug).forEach((variant) => {
            if (!index.has(variant)) {
              index.set(variant, charter)
            }
          })
        })

        return {
          charters,
          index,
        }
      })
  }

  return charterCatalogPromise
}

export async function listCharters() {
  const catalog = await loadCatalog()
  return cloneData(catalog.charters)
}

export async function getCharterBySlug(slug) {
  const catalog = await loadCatalog()
  const charter = getRouteSlugVariants(slug)
    .map((variant) => catalog.index.get(variant))
    .find(Boolean)

  if (!charter) {
    return null
  }

  return cloneData(attachAdjacentCharters(charter, catalog.charters))
}
