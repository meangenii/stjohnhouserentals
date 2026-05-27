import { getRouteSlugVariants } from './routeSlug'

const liveCatalogUrl = '/livePropertyCatalog.json'

let propertyCatalogPromise

function cloneData(value) {
  return JSON.parse(JSON.stringify(value))
}

function formatBedroomLabel(bedrooms) {
  return `${bedrooms} Bedroom${bedrooms === 1 ? '' : 's'}`
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

function normalizePropertyRecord(record) {
  if (!record?.slug || !record?.name) {
    return null
  }

  const gallery = Array.isArray(record.gallery)
    ? record.gallery.map((asset) => normalizeImageAsset(asset)).filter(Boolean)
    : []
  const heroImage = normalizeImageAsset(record.heroImage) ?? gallery[0] ?? null
  const facts = Array.isArray(record.facts) ? record.facts.map((fact) => String(fact).trim()).filter(Boolean) : []
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
    path: String(record.path ?? `/rental-properties/${record.slug}`).trim(),
    name: String(record.name).trim(),
    price: String(record.price ?? '').trim(),
    bedrooms: Number(record.bedrooms) || 0,
    bathrooms: Number(record.bathrooms) || 0,
    maxGuests: Number(record.maxGuests) || 0,
    shortDescription: String(record.shortDescription ?? '').trim(),
    facts,
    bedroomLabel: formatBedroomLabel(Number(record.bedrooms) || 0),
    location: String(record.location ?? '').trim(),
    descriptionHtml: String(record.descriptionHtml ?? '').trim(),
    amenitiesHtml: String(record.amenitiesHtml ?? '').trim(),
    reviewsHtml: String(record.reviewsHtml ?? '').trim(),
    reviewEntries: Array.isArray(record.reviewEntries) ? record.reviewEntries : [],
    heroImage,
    gallery,
    externalLinks,
    pageTitle: String(record.pageTitle ?? '').trim(),
  }
}

function groupProperties(properties) {
  const groups = new Map()

  properties.forEach((property) => {
    if (!groups.has(property.bedrooms)) {
      groups.set(property.bedrooms, {
        bedrooms: property.bedrooms,
        label: formatBedroomLabel(property.bedrooms),
        properties: [],
      })
    }

    groups.get(property.bedrooms).properties.push(property)
  })

  return Array.from(groups.values())
}

function attachAdjacentProperties(property, properties) {
  const index = properties.findIndex((candidate) => candidate.slug === property.slug)

  if (index === -1) {
    return property
  }

  const previousProperty = properties[index - 1]
  const nextProperty = properties[index + 1]

  return {
    ...property,
    previousProperty: previousProperty
      ? { slug: previousProperty.slug, name: previousProperty.name, path: previousProperty.path }
      : null,
    nextProperty: nextProperty
      ? { slug: nextProperty.slug, name: nextProperty.name, path: nextProperty.path }
      : null,
  }
}

async function loadCatalog() {
  if (!propertyCatalogPromise) {
    propertyCatalogPromise = fetch(liveCatalogUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Property catalog request failed with status ${response.status}`)
        }

        return response.json()
      })
      .then((payload) => {
        const properties = Array.isArray(payload?.properties)
          ? payload.properties.map((property) => normalizePropertyRecord(property)).filter(Boolean)
          : []
        const index = new Map()

        properties.forEach((property) => {
          getRouteSlugVariants(property.slug).forEach((variant) => {
            if (!index.has(variant)) {
              index.set(variant, property)
            }
          })
        })

        return {
          properties,
          groups: groupProperties(properties),
          index,
        }
      })
  }

  return propertyCatalogPromise
}

export async function listBedroomGroups() {
  const catalog = await loadCatalog()
  return cloneData(catalog.groups)
}

export async function listProperties() {
  const catalog = await loadCatalog()
  return cloneData(catalog.properties)
}

export async function getPropertyBySlug(slug) {
  const catalog = await loadCatalog()
  const property = getRouteSlugVariants(slug)
    .map((variant) => catalog.index.get(variant))
    .find(Boolean)

  if (!property) {
    return null
  }

  return cloneData(attachAdjacentProperties(property, catalog.properties))
}

export async function saveAdminProperty() {
  throw new Error('Admin property editing is disabled for the live-site parity build.')
}

export function resetAdminProperties() {}

export async function getMockPropertyCount() {
  const catalog = await loadCatalog()
  return catalog.properties.length
}

export function isMockPropertyData() {
  return false
}
