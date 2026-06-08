import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as cheerio from 'cheerio'

const SELF_DOMAIN = 'stjohnhouserentals.com'
const SEASONAL_RATE_RE = /\b(high season|low season|summer|winter|spring|fall|shoulder season)\b/i
const WEEKLY_RATE_RE = /\/week|\bweekly\b/i
const MONTHLY_RATE_RE = /\/month|\bmonthly\b/i
const MINIMUM_STAY_RE = /\bminimum\b/i
const HOTEL_TAX_RE = /\bhotel tax\b/i
const BOOKING_CONTACT_RE = /\bbooking contact\b/i
const CANCELLATION_RE = /\b(cancellation policy|trip cancellation|deposit is required|refund)\b/i
const DIRECT_BOOKING_RE = /\b(to book direct|book direct)\b/i

const ARCHETYPE_DEFINITIONS = [
  {
    key: 'vrboImportedStructured',
    label: 'VRBO-imported structured pages',
    description:
      'Structured amenity headings, review content, and a VRBO referral link dominate these pages. They read like imported marketplace listings rather than owner-written rate sheets.',
    match: (features) => features.hasVrboLink && features.hasStructuredAmenities && !features.hasPhone,
  },
  {
    key: 'directSeasonalManager',
    label: 'Direct seasonal manager pages',
    description:
      'These pages keep booking direct on-page, expose a phone number, avoid partner-site referrals, and rely on seasonal rate tables plus flat amenity lists.',
    match: (features) => !features.hasPartnerSite && features.hasPhone && features.hasSeasonalRates,
  },
  {
    key: 'hybridSeasonalReferral',
    label: 'Hybrid seasonal referral pages',
    description:
      'These still show direct phone/email contact, but they also send users to partner sites, media tours, or availability calendars while keeping seasonal rate copy on the page.',
    match: (features) => features.hasPartnerSite && features.hasPhone && features.hasSeasonalRates,
  },
  {
    key: 'emailOnlyLightweight',
    label: 'Email-only lightweight pages',
    description:
      'Lean owner-direct pages with no phone number and no partner-site handoff. They are lighter on reviews and usually simpler in amenity formatting.',
    match: (features) => !features.hasPartnerSite && !features.hasPhone,
  },
  {
    key: 'directNarrativeManager',
    label: 'Direct narrative manager pages',
    description:
      'Direct manager contact is still on-page, but these pages lean more on narrative sales copy than seasonal rate tables.',
    match: (features) => !features.hasPartnerSite && features.hasPhone,
  },
  {
    key: 'partnerSeasonalSelfServe',
    label: 'Partner seasonal self-serve pages',
    description:
      'Availability moves off-site, no phone number is shown, and the page keeps seasonal rate language on-site as a light self-serve funnel.',
    match: (features) => features.hasPartnerSite && !features.hasPhone && features.hasSeasonalRates,
  },
  {
    key: 'hybridNarrativeManager',
    label: 'Hybrid narrative manager pages',
    description:
      'A small set of pages mixes direct manager contact with partner-site referrals but does not rely on seasonal rate tables.',
    match: (features) => features.hasPartnerSite && features.hasPhone,
  },
  {
    key: 'partnerNarrativeSelfServe',
    label: 'Partner narrative self-serve pages',
    description:
      'These pages point visitors to a partner site, skip the phone number, and behave more like a narrative teaser than a full pricing sheet.',
    match: (features) => features.hasPartnerSite && !features.hasPhone,
  },
]

function parseArgs(argv) {
  return argv.reduce((options, arg) => {
    const [key, value] = arg.split('=')

    if (key === '--date' && value) {
      return { ...options, snapshotDate: value }
    }

    return options
  }, {})
}

function getRootDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

function decodeHtml(value = '') {
  return cheerio.load(`<div>${value}</div>`).text()
}

function repairMojibake(value = '') {
  return String(value)
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

function cleanText(value = '') {
  const decodedValue = decodeHtml(value)
  const repairedValue = /[Ãâ]/.test(decodedValue) ? Buffer.from(decodedValue, 'latin1').toString('utf8') : decodedValue

  return repairMojibake(repairedValue)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripHtml(html = '') {
  return cleanText(String(html).replace(/<br\s*\/?>/gi, ' '))
}

function round(value, digits = 1) {
  return Number(value.toFixed(digits))
}

function percent(count, total) {
  if (!total) {
    return 0
  }

  return round((count / total) * 100, 1)
}

async function readLatestSnapshotDate(rootDir) {
  const latestMarkerPath = path.join(rootDir, 'reference', 'live-site', 'LATEST.txt')
  return cleanText(await readFile(latestMarkerPath, 'utf8'))
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

function getExternalDomains(property) {
  return (property.externalLinks ?? [])
    .filter((link) => !link.isMailto && !link.isPhone)
    .map((link) => {
      try {
        return new URL(link.href).hostname.replace(/^www\./, '').replace(/^atwww\./, '')
      } catch {
        return ''
      }
    })
    .filter(Boolean)
}

function buildFeatures(property) {
  const descriptionText = stripHtml(property.descriptionHtml)
  const amenitiesText = stripHtml(property.amenitiesHtml)
  const allDomainsRaw = getExternalDomains(property)
  const allDomains = [...new Set(allDomainsRaw)]
  const selfDomains = allDomains.filter((domain) => domain === SELF_DOMAIN)
  const partnerDomainsRaw = allDomainsRaw.filter((domain) => domain !== SELF_DOMAIN)
  const partnerDomains = [...new Set(partnerDomainsRaw)]
  const hasPhone = (property.externalLinks ?? []).some((link) => link.isPhone)
  const hasMailto = (property.externalLinks ?? []).some((link) => link.isMailto)
  const hasPartnerSite = partnerDomains.length > 0
  const reviewCount = property.reviewEntries?.length ?? 0
  const galleryCount = property.gallery?.length ?? 0

  return {
    descriptionText,
    amenitiesText,
    allDomains,
    selfDomains: [...new Set(selfDomains)],
    partnerDomainsRaw,
    partnerDomains: [...new Set(partnerDomains)],
    hasPrice: Boolean(property.price),
    hasPhone,
    hasMailto,
    hasPartnerSite,
    hasVrboLink: partnerDomains.includes('vrbo.com'),
    hasStructuredAmenities: /<h[2-6]\b/i.test(property.amenitiesHtml ?? ''),
    hasSeasonalRates: SEASONAL_RATE_RE.test(descriptionText),
    hasWeeklyRateLanguage: WEEKLY_RATE_RE.test(descriptionText),
    hasMonthlyRateLanguage: MONTHLY_RATE_RE.test(descriptionText),
    hasMinimumStayLanguage: MINIMUM_STAY_RE.test(descriptionText),
    hasHotelTaxLanguage: HOTEL_TAX_RE.test(descriptionText),
    hasBookingContactLanguage: BOOKING_CONTACT_RE.test(descriptionText),
    hasCancellationPolicyLanguage: CANCELLATION_RE.test(descriptionText),
    hasDirectBookingLanguage: DIRECT_BOOKING_RE.test(descriptionText),
    reviewCount,
    hasReviews: reviewCount > 0,
    galleryCount,
  }
}

function classifyArchetype(features) {
  const match = ARCHETYPE_DEFINITIONS.find((definition) => definition.match(features))
  return match ?? ARCHETYPE_DEFINITIONS.at(-1)
}

function average(values) {
  if (!values.length) {
    return 0
  }

  const total = values.reduce((sum, value) => sum + value, 0)
  return round(total / values.length, 2)
}

function buildAssignments(properties) {
  return properties.map((property) => {
    const features = buildFeatures(property)
    const archetype = classifyArchetype(features)

    return {
      slug: property.slug,
      name: cleanText(property.name),
      path: property.path,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      maxGuests: property.maxGuests,
      price: property.price,
      archetypeKey: archetype.key,
      archetypeLabel: archetype.label,
      features,
    }
  })
}

function buildBookingFlowSummary(assignments) {
  const flows = [
    {
      key: 'direct-email-only',
      label: 'Direct email only',
      match: (assignment) => assignment.features.hasMailto && !assignment.features.hasPhone && !assignment.features.hasPartnerSite,
    },
    {
      key: 'direct-phone-email',
      label: 'Direct phone plus email',
      match: (assignment) => assignment.features.hasPhone && !assignment.features.hasPartnerSite,
    },
    {
      key: 'hybrid-phone-email-plus-partner',
      label: 'Phone/email plus partner referral',
      match: (assignment) => assignment.features.hasPhone && assignment.features.hasPartnerSite,
    },
    {
      key: 'partner-self-serve',
      label: 'Partner self-serve only',
      match: (assignment) => !assignment.features.hasPhone && assignment.features.hasPartnerSite,
    },
  ]

  return flows.map((flow) => {
    const matches = assignments.filter(flow.match)
    return {
      key: flow.key,
      label: flow.label,
      count: matches.length,
      sharePercent: percent(matches.length, assignments.length),
      sampleListings: matches.slice(0, 5).map((assignment) => assignment.name),
    }
  })
}

function buildContentSummary(assignments) {
  const properties = assignments.map((assignment) => assignment.features)

  return {
    averageGalleryImages: average(properties.map((features) => features.galleryCount)),
    withStructuredAmenities: properties.filter((features) => features.hasStructuredAmenities).length,
    withReviews: properties.filter((features) => features.hasReviews).length,
    withoutReviews: properties.filter((features) => !features.hasReviews).length,
    withHeadlinePriceField: properties.filter((features) => features.hasPrice).length,
    withoutHeadlinePriceField: properties.filter((features) => !features.hasPrice).length,
    withSeasonalRateLanguage: properties.filter((features) => features.hasSeasonalRates).length,
    withWeeklyRateLanguage: properties.filter((features) => features.hasWeeklyRateLanguage).length,
    withMonthlyRateLanguage: properties.filter((features) => features.hasMonthlyRateLanguage).length,
    withMinimumStayLanguage: properties.filter((features) => features.hasMinimumStayLanguage).length,
    withHotelTaxLanguage: properties.filter((features) => features.hasHotelTaxLanguage).length,
    withBookingContactLanguage: properties.filter((features) => features.hasBookingContactLanguage).length,
    withCancellationPolicyLanguage: properties.filter((features) => features.hasCancellationPolicyLanguage).length,
    withDirectBookingLanguage: properties.filter((features) => features.hasDirectBookingLanguage).length,
  }
}

function buildExternalDomainSummary(assignments) {
  const domainCounts = new Map()
  const listingCoverageCounts = new Map()

  assignments.forEach((assignment) => {
    assignment.features.partnerDomainsRaw.forEach((domain) => {
      domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1)
    })

    assignment.features.partnerDomains.forEach((domain) => {
      const listingSet = listingCoverageCounts.get(domain) ?? new Set()
      listingSet.add(assignment.slug)
      listingCoverageCounts.set(domain, listingSet)
    })
  })

  return [...domainCounts.entries()]
    .map(([domain, linkCount]) => ({
      domain,
      linkCount,
      listingCount: listingCoverageCounts.get(domain)?.size ?? 0,
    }))
    .sort((left, right) => right.listingCount - left.listingCount || right.linkCount - left.linkCount || left.domain.localeCompare(right.domain))
}

function buildArchetypeSummary(assignments) {
  return ARCHETYPE_DEFINITIONS.map((definition) => {
    const matches = assignments.filter((assignment) => assignment.archetypeKey === definition.key)
    const featureSet = matches.map((assignment) => assignment.features)

    return {
      key: definition.key,
      label: definition.label,
      description: definition.description,
      count: matches.length,
      sharePercent: percent(matches.length, assignments.length),
      averageBedrooms: average(matches.map((assignment) => assignment.bedrooms)),
      averageGalleryImages: average(featureSet.map((features) => features.galleryCount)),
      reviewCoveragePercent: percent(featureSet.filter((features) => features.hasReviews).length, matches.length),
      headlinePriceCoveragePercent: percent(featureSet.filter((features) => features.hasPrice).length, matches.length),
      sampleListings: matches.slice(0, 6).map((assignment) => assignment.name),
      slugs: matches.map((assignment) => assignment.slug),
    }
  }).filter((archetype) => archetype.count > 0)
}

function buildReport(snapshotDate, propertyCatalog, assignments) {
  const bookingFlows = buildBookingFlowSummary(assignments)
  const contentSummary = buildContentSummary(assignments)
  const externalDomains = buildExternalDomainSummary(assignments)
  const archetypes = buildArchetypeSummary(assignments)

  return {
    generatedAt: new Date().toISOString(),
    snapshotDate,
    sourceCatalog: `reference/live-site/${snapshotDate}/property-catalog.json`,
    propertyCount: propertyCatalog.propertyCount,
    listingPathPrefix: '/rental-properties/',
    notes: [
      'Counts are based on the normalized detail-page scrape, not the list-card summaries.',
      `Links back to ${SELF_DOMAIN} are treated as self-links and excluded from partner referral counts.`,
    ],
    bookingFlows,
    contentSummary,
    externalDomains,
    archetypes,
    assignments: assignments.map((assignment) => ({
      slug: assignment.slug,
      name: cleanText(assignment.name),
      archetypeKey: assignment.archetypeKey,
      archetypeLabel: assignment.archetypeLabel,
      partnerDomains: assignment.features.partnerDomains,
      reviewCount: assignment.features.reviewCount,
      galleryCount: assignment.features.galleryCount,
      hasPrice: assignment.features.hasPrice,
      hasPhone: assignment.features.hasPhone,
      hasStructuredAmenities: assignment.features.hasStructuredAmenities,
      hasSeasonalRates: assignment.features.hasSeasonalRates,
    })),
  }
}

function renderMarkdownReport(report) {
  const lines = [
    '# Rental Listing Pattern Report',
    '',
    `Generated from \`${report.sourceCatalog}\`.`,
    '',
    '## Snapshot coverage',
    '',
    `- Snapshot date: \`${report.snapshotDate}\``,
    `- Rental detail pages analyzed: ${report.propertyCount}`,
    `- Listing route prefix: \`${report.listingPathPrefix}\``,
    ...report.notes.map((note) => `- ${note}`),
    '',
    '## Booking flow patterns',
    '',
    ...report.bookingFlows.flatMap((flow) => [
      `- ${flow.label}: ${flow.count} listings (${flow.sharePercent}%)`,
      `  Sample listings: ${flow.sampleListings.join(', ') || 'None'}`,
    ]),
    '',
    '## Content signals',
    '',
    `- Average gallery size: ${report.contentSummary.averageGalleryImages} images`,
    `- Listings with structured amenity headings: ${report.contentSummary.withStructuredAmenities}`,
    `- Listings with review content: ${report.contentSummary.withReviews}`,
    `- Listings without review content: ${report.contentSummary.withoutReviews}`,
    `- Listings with a headline price field: ${report.contentSummary.withHeadlinePriceField}`,
    `- Listings without a headline price field: ${report.contentSummary.withoutHeadlinePriceField}`,
    `- Listings with seasonal rate language: ${report.contentSummary.withSeasonalRateLanguage}`,
    `- Listings with weekly rate language: ${report.contentSummary.withWeeklyRateLanguage}`,
    `- Listings with monthly rate language: ${report.contentSummary.withMonthlyRateLanguage}`,
    `- Listings with minimum-stay language: ${report.contentSummary.withMinimumStayLanguage}`,
    `- Listings with hotel-tax language: ${report.contentSummary.withHotelTaxLanguage}`,
    `- Listings with explicit booking-contact language: ${report.contentSummary.withBookingContactLanguage}`,
    `- Listings with cancellation/refund language: ${report.contentSummary.withCancellationPolicyLanguage}`,
    `- Listings with direct-booking language: ${report.contentSummary.withDirectBookingLanguage}`,
    '',
    '## Archetypes',
    '',
  ]

  report.archetypes.forEach((archetype, index) => {
    lines.push(`${index + 1}. ${archetype.label} - ${archetype.count} listings (${archetype.sharePercent}%)`)
    lines.push(`   ${archetype.description}`)
    lines.push(`   Average bedrooms: ${archetype.averageBedrooms}`)
    lines.push(`   Average gallery size: ${archetype.averageGalleryImages}`)
    lines.push(`   Review coverage: ${archetype.reviewCoveragePercent}%`)
    lines.push(`   Headline-price coverage: ${archetype.headlinePriceCoveragePercent}%`)
    lines.push(`   Sample listings: ${archetype.sampleListings.join(', ')}`)
  })

  lines.push('')
  lines.push('## Top partner domains')
  lines.push('')

  report.externalDomains.slice(0, 12).forEach((domain) => {
    lines.push(`- ${domain.domain}: ${domain.listingCount} listings, ${domain.linkCount} links`)
  })

  lines.push('')
  lines.push('## Output files')
  lines.push('')
  lines.push(`- \`reference/live-site/${report.snapshotDate}/listing-pattern-report.json\``)
  lines.push(`- \`reference/live-site/${report.snapshotDate}/listing-pattern-report.md\``)
  lines.push('')

  return `${lines.join('\n')}\n`
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const rootDir = getRootDir()
  const snapshotDate = options.snapshotDate ?? (await readLatestSnapshotDate(rootDir))
  const snapshotDir = path.join(rootDir, 'reference', 'live-site', snapshotDate)
  const propertyCatalogPath = path.join(snapshotDir, 'property-catalog.json')
  const propertyCatalog = await readJson(propertyCatalogPath)
  const assignments = buildAssignments(propertyCatalog.properties)
  const report = buildReport(snapshotDate, propertyCatalog, assignments)
  const markdown = renderMarkdownReport(report)

  await writeFile(path.join(snapshotDir, 'listing-pattern-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(path.join(snapshotDir, 'listing-pattern-report.md'), markdown, 'utf8')

  console.log(`Listing pattern report written to ${path.join(snapshotDir, 'listing-pattern-report.json')}`)
  console.log(`Listing pattern report written to ${path.join(snapshotDir, 'listing-pattern-report.md')}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
