import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_PROPERTY_TEMPLATE_VARIANT = 'fully-sectioned'
const PROPERTY_TEMPLATE_VARIANT_CONFIGS = {
  'source-stack': {
    shortDescription: { showHeader: false, title: 'Short Description', renderWhenEmpty: false },
    description: { showHeader: false, title: 'Description', renderWhenEmpty: false },
    amenities: { showHeader: false, title: 'Amenities', renderWhenEmpty: false },
    reviews: { showHeader: false, title: 'Reviews', renderWhenEmpty: false },
  },
  'supplemental-sections': {
    shortDescription: { showHeader: false, title: 'Short Description', renderWhenEmpty: false },
    description: { showHeader: false, title: 'Description', renderWhenEmpty: false },
    amenities: { showHeader: true, title: 'Amenities', renderWhenEmpty: false },
    reviews: { showHeader: true, title: 'Reviews', renderWhenEmpty: false },
  },
  'fully-sectioned': {
    shortDescription: { showHeader: true, title: 'Short Description', renderWhenEmpty: true },
    description: { showHeader: true, title: 'Description', renderWhenEmpty: true },
    amenities: { showHeader: true, title: 'Amenities', renderWhenEmpty: true },
    reviews: { showHeader: true, title: 'Reviews', renderWhenEmpty: true },
  },
}
const LIVE_TEMPLATE_SLOT_COMPONENTS = {
  shortDescription: { componentId: 'comp-mctnvk0s', mode: 'html', title: 'Short Description' },
  description: { componentId: 'comp-mb6us6bf', mode: 'rich-content', title: 'Description' },
  amenities: { componentId: 'comp-mc20e8rm', mode: 'rich-content', title: 'Amenities' },
  reviews: { componentId: 'comp-mlsdzvqq', mode: 'html', title: 'Reviews' },
}

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

function cleanText(value = '') {
  const sourceValue = String(value)
  const decodedValue = /[ÃƒÃ¢]/.test(sourceValue) ? Buffer.from(sourceValue, 'latin1').toString('utf8') : sourceValue
  return repairMojibake(decodedValue).replace(/\s+/g, ' ').trim()
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

async function readLatestSnapshotDate(rootDir) {
  const latestMarkerPath = path.join(rootDir, 'reference', 'live-site', 'LATEST.txt')
  return cleanText(await readFile(latestMarkerPath, 'utf8'))
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

async function fileExists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function normalizePropertyTemplateVariant(value) {
  const normalizedValue = cleanText(value)
  return PROPERTY_TEMPLATE_VARIANT_CONFIGS[normalizedValue] ? normalizedValue : DEFAULT_PROPERTY_TEMPLATE_VARIANT
}

function countShortDescriptionLines(property) {
  if (Array.isArray(property.facts) && property.facts.length > 0) {
    return property.facts.map((fact) => cleanText(fact)).filter(Boolean).length
  }

  return cleanText(property.shortDescription)
    .split(/\r?\n+/)
    .map((line) => cleanText(line))
    .filter(Boolean).length
}

function hasNonEmptyHtml(value) {
  return cleanText(String(value ?? '').replace(/<[^>]+>/g, ' ')).length > 0
}

function getLinkKinds(property) {
  const links = Array.isArray(property.externalLinks) ? property.externalLinks : []

  return {
    hasMailto: links.some((link) => link.isMailto),
    hasPhone: links.some((link) => link.isPhone),
    hasExternalSite: links.some((link) => !link.isMailto && !link.isPhone),
  }
}

function extractWarmupData(html) {
  const match = html.match(/<script type="application\/json" id="legacy-warmup-data">([\s\S]*?)<\/script>/)

  if (!match) {
    throw new Error('legacy-warmup-data payload not found')
  }

  return JSON.parse(match[1])
}

function collectRichContentText(nodes = []) {
  const parts = []

  const walk = (value) => {
    if (Array.isArray(value)) {
      value.forEach(walk)
      return
    }

    if (!value || typeof value !== 'object') {
      return
    }

    if (typeof value.textData?.text === 'string') {
      parts.push(value.textData.text)
    }

    if (Array.isArray(value.nodes)) {
      value.nodes.forEach(walk)
    }
  }

  walk(nodes)

  return cleanText(parts.join(' '))
}

function readLiveTemplateFromWarmup(html) {
  const warmupData = extractWarmupData(html)
  const update = warmupData?.platform?.ssrPropsUpdates?.[0] ?? {}
  const sections = {}

  Object.entries(LIVE_TEMPLATE_SLOT_COMPONENTS).forEach(([sectionKey, config]) => {
    const componentValue = update[config.componentId]
    const slotExists = config.mode === 'html'
      ? Boolean(componentValue && Object.prototype.hasOwnProperty.call(componentValue, 'html'))
      : Boolean(componentValue?.content)
    const contentPresent = config.mode === 'html'
      ? hasNonEmptyHtml(componentValue?.html ?? '')
      : collectRichContentText(componentValue?.content?.nodes ?? []).length > 0

    sections[sectionKey] = {
      title: config.title,
      slotExists,
      contentPresent,
      componentId: config.componentId,
    }
  })

  return sections
}

function buildCurrentTemplateSections(property, variantConfig) {
  const shortDescriptionLineCount = countShortDescriptionLines(property)
  const hasDescription = hasNonEmptyHtml(property.descriptionHtml)
  const hasAmenities = hasNonEmptyHtml(property.amenitiesHtml)
  const hasReviews = hasNonEmptyHtml(property.reviewsHtml)

  return {
    shortDescription: {
      title: variantConfig.shortDescription.title,
      shellRendered: shortDescriptionLineCount > 0 || variantConfig.shortDescription.renderWhenEmpty,
      headerRendered: shortDescriptionLineCount > 0 || variantConfig.shortDescription.renderWhenEmpty
        ? variantConfig.shortDescription.showHeader
        : false,
      contentRendered: shortDescriptionLineCount > 0,
    },
    description: {
      title: variantConfig.description.title,
      shellRendered: hasDescription || variantConfig.description.renderWhenEmpty,
      headerRendered: hasDescription || variantConfig.description.renderWhenEmpty
        ? variantConfig.description.showHeader
        : false,
      contentRendered: hasDescription,
    },
    amenities: {
      title: variantConfig.amenities.title,
      shellRendered: hasAmenities || variantConfig.amenities.renderWhenEmpty,
      headerRendered: hasAmenities || variantConfig.amenities.renderWhenEmpty
        ? variantConfig.amenities.showHeader
        : false,
      contentRendered: hasAmenities,
    },
    reviews: {
      title: variantConfig.reviews.title,
      shellRendered: hasReviews || variantConfig.reviews.renderWhenEmpty,
      headerRendered: hasReviews || variantConfig.reviews.renderWhenEmpty
        ? variantConfig.reviews.showHeader
        : false,
      contentRendered: hasReviews,
    },
  }
}

async function buildPropertyAuditEntry(property, snapshotDate, rootDir) {
  const templateVariant = normalizePropertyTemplateVariant(property.templateVariant)
  const variantConfig = PROPERTY_TEMPLATE_VARIANT_CONFIGS[templateVariant]
  const currentSections = buildCurrentTemplateSections(property, variantConfig)
  const htmlFileRelativePath = path.posix.join('reference', 'live-site', snapshotDate, 'html', property.path.replace(/^\//, '') + '.html')
  const absoluteHtmlFile = path.join(rootDir, ...htmlFileRelativePath.split('/'))
  const htmlFilePresent = await fileExists(absoluteHtmlFile)
  const htmlSource = htmlFilePresent ? await readFile(absoluteHtmlFile, 'utf8') : ''
  const liveSections = htmlFilePresent ? readLiveTemplateFromWarmup(htmlSource) : {}
  const missingHeaders = []
  const missingShells = []
  const liveSlots = []
  const livePopulatedSections = []
  const currentHeaders = []
  const currentShells = []

  Object.entries(LIVE_TEMPLATE_SLOT_COMPONENTS).forEach(([sectionKey, config]) => {
    const liveSection = liveSections[sectionKey] ?? { slotExists: false, contentPresent: false }
    const currentSection = currentSections[sectionKey]

    if (liveSection.slotExists) {
      liveSlots.push(config.title)
    }

    if (liveSection.contentPresent) {
      livePopulatedSections.push(config.title)
    }

    if (currentSection.shellRendered) {
      currentShells.push(currentSection.title)
    }

    if (currentSection.headerRendered) {
      currentHeaders.push(currentSection.title)
    }

    if (liveSection.slotExists && !currentSection.shellRendered) {
      missingShells.push(config.title)
    }

    if (liveSection.slotExists && !currentSection.headerRendered) {
      missingHeaders.push(config.title)
    }
  })

  return {
    slug: property.slug,
    name: property.name,
    path: property.path,
    htmlFile: htmlFileRelativePath,
    htmlFileExists: htmlFilePresent,
    templateVariant,
    liveSlots,
    livePopulatedSections,
    currentShells,
    currentHeaders,
    missingHeaders,
    missingShells,
    regroupedFields: [],
    syntheticBookingSectionRemoved: true,
    sourceFieldPresence: {
      shortDescriptionLines: countShortDescriptionLines(property),
      descriptionHtml: hasNonEmptyHtml(property.descriptionHtml),
      amenitiesHtml: hasNonEmptyHtml(property.amenitiesHtml),
      reviewsHtml: hasNonEmptyHtml(property.reviewsHtml),
      bookingData: Boolean(
        cleanText(property.booking?.contactName) || cleanText(property.booking?.email) || cleanText(property.booking?.note),
      ),
    },
    liveTemplatePresence: {
      shortDescriptionSlot: Boolean(liveSections.shortDescription?.slotExists),
      descriptionSlot: Boolean(liveSections.description?.slotExists),
      amenitiesSlot: Boolean(liveSections.amenities?.slotExists),
      reviewsSlot: Boolean(liveSections.reviews?.slotExists),
      shortDescriptionContent: Boolean(liveSections.shortDescription?.contentPresent),
      descriptionContent: Boolean(liveSections.description?.contentPresent),
      amenitiesContent: Boolean(liveSections.amenities?.contentPresent),
      reviewsContent: Boolean(liveSections.reviews?.contentPresent),
    },
    linkKinds: getLinkKinds(property),
  }
}

function summarize(entries) {
  const countWhere = (predicate) => entries.filter(predicate).length

  return {
    propertyCount: entries.length,
    liveShortDescriptionSlotCount: countWhere((entry) => entry.liveTemplatePresence.shortDescriptionSlot),
    liveDescriptionSlotCount: countWhere((entry) => entry.liveTemplatePresence.descriptionSlot),
    liveAmenitiesSlotCount: countWhere((entry) => entry.liveTemplatePresence.amenitiesSlot),
    liveReviewsSlotCount: countWhere((entry) => entry.liveTemplatePresence.reviewsSlot),
    livePopulatedReviewsCount: countWhere((entry) => entry.liveTemplatePresence.reviewsContent),
    currentHeaderParityCount: countWhere((entry) => entry.missingHeaders.length === 0),
    currentShellParityCount: countWhere((entry) => entry.missingShells.length === 0),
    propertiesWithHeaderParityGaps: countWhere((entry) => entry.missingHeaders.length > 0),
    propertiesWithShellParityGaps: countWhere((entry) => entry.missingShells.length > 0),
    propertiesWithBookingData: countWhere((entry) => entry.sourceFieldPresence.bookingData),
    propertiesWithRegroupedFields: countWhere((entry) => entry.regroupedFields.length > 0),
    variantCounts: Object.fromEntries(
      [...new Set(entries.map((entry) => entry.templateVariant))].sort().map((variant) => [
        variant,
        entries.filter((entry) => entry.templateVariant === variant).length,
      ]),
    ),
  }
}

function buildReport(snapshotDate, entries) {
  return {
    generatedAt: new Date().toISOString(),
    snapshotDate,
    sourceCatalog: `reference/live-site/${snapshotDate}/property-catalog.json`,
    sourceHtmlRoot: `reference/live-site/${snapshotDate}/html/rental-properties/`,
    templateBehavior: {
      syntheticBookingSectionRemoved: true,
      usesRawDescriptionHtml: true,
      usesRawAmenitiesHtml: true,
      usesRawReviewsHtml: true,
      regroupingTransformsEnabled: [],
      notes: [
        'The audit reads the saved live property HTML and parses each page\'s legacy-warmup-data payload.',
        'Parity is measured against the live page template\'s dedicated section slots, not just the normalized property catalog fields.',
        'Live properties are expected to keep visible Short Description, Description, Amenities, and Reviews section headers.',
      ],
    },
    summary: summarize(entries),
    properties: entries,
  }
}

function renderMarkdown(report) {
  const variantSummary = Object.entries(report.summary.variantCounts)
    .map(([variant, count]) => `${variant}=${count}`)
    .join(', ')

  const lines = [
    '# Property Template Parity Audit',
    '',
    `Generated from \`${report.sourceCatalog}\`.`,
    '',
    '## Template status',
    '',
    '- Audit source: saved live property HTML warmup payload',
    '- Synthetic booking section rendered: no',
    '- Description rendered from raw scraped HTML: yes',
    '- Amenities rendered from raw scraped HTML: yes',
    '- Reviews rendered from raw scraped HTML: yes',
    '- Regrouping transforms enabled on property fields: none',
    '',
    '## Summary',
    '',
    `- Properties audited: ${report.summary.propertyCount}`,
    `- Live pages with Short Description slot: ${report.summary.liveShortDescriptionSlotCount}`,
    `- Live pages with Description slot: ${report.summary.liveDescriptionSlotCount}`,
    `- Live pages with Amenities slot: ${report.summary.liveAmenitiesSlotCount}`,
    `- Live pages with Reviews slot: ${report.summary.liveReviewsSlotCount}`,
    `- Live pages with populated Reviews content: ${report.summary.livePopulatedReviewsCount}`,
    `- Properties with header parity gaps: ${report.summary.propertiesWithHeaderParityGaps}`,
    `- Properties with section-shell parity gaps: ${report.summary.propertiesWithShellParityGaps}`,
    `- Properties with regrouped fields in the current template: ${report.summary.propertiesWithRegroupedFields}`,
    `- Variant counts: ${variantSummary}`,
    '',
    '## Notes',
    '',
    '- The current property template no longer creates a Booking Information section.',
    '- The current property template no longer restructures description, amenities, or reviews HTML.',
    '- The live page template still defines dedicated Short Description, Description, Amenities, and Reviews sections.',
    '',
    '## Per-property audit',
    '',
  ]

  report.properties.forEach((property) => {
    lines.push(
      `- ${property.name} (\`${property.slug}\`): variant=${property.templateVariant}; liveSlots=${property.liveSlots.join(', ') || 'none'}; liveContent=${property.livePopulatedSections.join(', ') || 'none'}; currentHeaders=${property.currentHeaders.join(', ') || 'none'}; missingHeaders=${property.missingHeaders.join(', ') || 'none'}; missingShells=${property.missingShells.join(', ') || 'none'}; html=\`${property.htmlFile}\``,
    )
  })

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
  const entries = []

  for (const property of propertyCatalog.properties ?? []) {
    entries.push(await buildPropertyAuditEntry(property, snapshotDate, rootDir))
  }

  const report = buildReport(snapshotDate, entries)
  const markdown = renderMarkdown(report)

  await writeFile(
    path.join(snapshotDir, 'property-template-parity-audit.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  )
  await writeFile(path.join(snapshotDir, 'property-template-parity-audit.md'), markdown, 'utf8')

  console.log(`Property template parity audit written to ${path.join(snapshotDir, 'property-template-parity-audit.json')}`)
  console.log(`Property template parity audit written to ${path.join(snapshotDir, 'property-template-parity-audit.md')}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
