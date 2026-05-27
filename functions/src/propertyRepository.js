const propertyDirectory = require('../../shared/propertyDirectory.json')

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function formatBedroomLabel(bedrooms) {
  return `${bedrooms} Bedroom${bedrooms === 1 ? '' : 's'}`
}

function formatBathroomLabel(bathrooms) {
  return `${bathrooms} Bath${bathrooms === 1 ? '' : 's'}`
}

function buildBaseProperty(name, bedrooms) {
  const slug = slugify(name)
  const maxGuests = bedrooms * 2
  const bathrooms = bedrooms === 1 ? 1 : bedrooms

  return {
    id: slug,
    slug,
    path: `/rental-properties/${slug}`,
    name,
    bedrooms,
    bedroomLabel: formatBedroomLabel(bedrooms),
    maxGuests,
    bathrooms,
    bathroomLabel: formatBathroomLabel(bathrooms),
    location: 'St. John, USVI',
    shortDescription: `${name} is a ${bedrooms}-bedroom St. John villa with breezy outdoor living, easy beach access, and room for up to ${maxGuests} guests.`,
    highlights: ['Island Views', 'Pool', 'Internet'],
    description: [
      `${name} is part of the working mock catalog used while the Firebase build is still offline.`,
      `This ${bedrooms}-bedroom villa profile is structured to match the data that will eventually come from Firestore, including summary facts, long-form description, amenities, and reviews.`,
      'For now, the record is served from Cloud Functions test data.'
    ],
    booking: {
      contactName: 'Test Booking Contact',
      email: 'bookings@example.test',
      note: 'This entry is powered by local test data and is ready to be swapped to Firebase later.'
    },
    amenityGroups: [
      {
        title: 'Essentials',
        items: ['Air conditioning', 'Wireless internet', 'Linens provided', 'Beach towels']
      },
      {
        title: 'Kitchen',
        items: ['Coffee maker', 'Dining table', 'Microwave', 'Refrigerator']
      },
      {
        title: 'Outside',
        items: ['Outdoor seating', 'Island-view deck', 'Parking', 'Private entry']
      }
    ],
    reviews: [
      {
        quote: `We loved our stay at ${name}. The location and outdoor spaces made it easy to settle into island time.`,
        author: 'Guest review'
      }
    ]
  }
}

function mergeProperty(baseProperty, override = {}) {
  const merged = {
    ...baseProperty,
    ...override
  }

  merged.highlights = override.highlights || baseProperty.highlights
  merged.description = override.description || baseProperty.description
  merged.amenityGroups = override.amenityGroups || baseProperty.amenityGroups
  merged.reviews = override.reviews || baseProperty.reviews
  merged.booking = {
    ...baseProperty.booking,
    ...(override.booking || {})
  }
  merged.bedroomLabel = formatBedroomLabel(merged.bedrooms)
  merged.bathroomLabel = formatBathroomLabel(merged.bathrooms)
  merged.path = `/rental-properties/${merged.slug}`

  return merged
}

function buildCatalog(seed) {
  const groups = seed.bedroomGroups.map((group) => {
    const properties = group.names
      .map((name) => {
        const slug = slugify(name)
        const override = seed.propertyOverrides && seed.propertyOverrides[slug]
        return mergeProperty(buildBaseProperty(name, group.bedrooms), override)
      })
      .sort((left, right) => left.name.localeCompare(right.name))

    return {
      bedrooms: group.bedrooms,
      label: group.label,
      properties
    }
  })

  return {
    groups,
    properties: groups.flatMap((group) => group.properties)
  }
}

const catalog = buildCatalog(propertyDirectory)
const propertyIndex = new Map(catalog.properties.map((property) => [property.slug, property]))

exports.listBedroomGroups = function listBedroomGroups() {
  return catalog.groups
}

exports.listProperties = function listProperties() {
  return catalog.properties
}

exports.getPropertyBySlug = function getPropertyBySlug(slug) {
  return propertyIndex.get(slug) || null
}
