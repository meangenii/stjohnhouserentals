import { assertExactBlockTypeKeys, BLOCK_DEFINITION_VERSION, BLOCK_TYPES, getBlockDefinitionVersion } from './blockContract.js'

export { BLOCK_DEFINITION_VERSION, BLOCK_TYPES }

export function makeBlockId() {
  return `block-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function makeStableId(makeId) {
  const candidate = typeof makeId === 'function' ? makeId() : makeBlockId()
  return String(candidate ?? '').trim() || makeBlockId()
}

const blockDefaultFactories = {
  hero: () => ({
    action: { backgroundColor: '', label: '', path: '/' },
    image: { kind: 'image' },
    lead: '',
    title: 'New hero banner',
  }),
  'image-text-split': () => ({
    action: { label: '', path: '/' },
    body: '<p>Add your text here...</p>',
    image: { kind: 'image' },
    imagePosition: 'left',
    kicker: '',
    title: 'New section',
  }),
  'feature-grid': () => ({ items: [], title: 'Why choose us' }),
  'rich-text': () => ({ html: '<p>Add your text here...</p>' }),
  image: () => ({ caption: '', image: { kind: 'image' } }),
  'cta-band': () => ({
    action: { backgroundColor: '', label: 'Learn More', path: '/' },
    body: '',
    title: 'Call to action',
  }),
  testimonials: () => ({ items: [] }),
  'image-gallery': () => ({ images: [] }),
  spacer: () => ({ size: 'medium' }),
  'directory-embed': () => ({ source: 'properties', title: 'Available Now' }),
  'contact-form': () => ({ intro: "We'll get back to you soon.", title: 'Get in Touch' }),
  'contact-details': () => ({ items: [] }),
  schedule: () => ({ columns: [], notes: [], title: 'Schedule' }),
  'rate-table': () => ({ footer: [], heading: 'Rates', link: { label: '', path: '' }, rows: [] }),
  group: () => ({ items: [] }),
  row: ({ makeId } = {}) => ({
    columns: [
      { blocks: [], id: makeStableId(makeId), width: 1 },
      { blocks: [], id: makeStableId(makeId), width: 1 },
    ],
  }),
  'two-column-text': () => ({ left: '<p>Add your text here...</p>', right: '<p>Add your text here...</p>' }),
  'business-list': () => ({ items: [], title: 'Local Businesses' }),
}

const blockCollectionItemFactories = {
  'feature-grid.items': ({ makeId }) => ({ body: '', id: makeStableId(makeId), kind: 'star', title: 'New feature' }),
  'testimonials.items': ({ makeId }) => ({ author: '', id: makeStableId(makeId), quote: '' }),
  'image-gallery.images': ({ makeId }) => ({ alt: '', id: makeStableId(makeId), kind: 'image', title: '' }),
  'contact-details.items': ({ makeId }) => ({
    href: '',
    id: makeStableId(makeId),
    label: 'Label',
    linkType: 'external',
    type: 'text',
    value: '',
  }),
  'schedule.columns': ({ makeId }) => ({ heading: 'New column', id: makeStableId(makeId), timeIds: [], times: [] }),
  'rate-table.rows': ({ makeId }) => ({
    id: makeStableId(makeId),
    label: '',
    valueIds: [makeStableId(makeId)],
    values: [''],
  }),
  'group.items': ({ makeId }) => ({ blocks: [], id: makeStableId(makeId), image: { kind: 'image' }, title: 'New card' }),
  'business-list.items': ({ makeId }) => ({
    id: makeStableId(makeId),
    name: 'Business name',
    phoneIds: [makeStableId(makeId)],
    phones: [''],
    website: '',
  }),
}

export const BLOCK_COLLECTION_ITEM_KEYS = Object.freeze(Object.keys(blockCollectionItemFactories))

assertExactBlockTypeKeys(Object.keys(blockDefaultFactories), 'Block default factories')

export function createBlockDefaultData(type, options = {}) {
  const factory = blockDefaultFactories[String(type ?? '').trim()]
  return factory ? factory(options) : null
}

export function createBlockCollectionItem(type, collection, { makeId = makeBlockId } = {}) {
  const key = `${String(type ?? '').trim()}.${String(collection ?? '').trim()}`
  const factory = blockCollectionItemFactories[key]

  return factory ? factory({ makeId }) : null
}

export function createBlockRecord(type, { makeId = makeBlockId } = {}) {
  const normalizedType = String(type ?? '').trim()
  const data = createBlockDefaultData(normalizedType, { makeId })

  if (!data) {
    return null
  }

  return {
    ...data,
    id: makeStableId(makeId),
    type: normalizedType,
    version: getBlockDefinitionVersion(normalizedType),
  }
}
