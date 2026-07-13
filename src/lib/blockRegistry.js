import {
  BusinessListBlockRenderer,
  ContactDetailsBlockRenderer,
  ContactFormBlockRenderer,
  CtaBandBlockRenderer,
  DirectoryEmbedBlockRenderer,
  DirectoryEmbedBlockSettings,
  FeatureGridBlockRenderer,
  GroupBlockRenderer,
  HeroBannerBlockRenderer,
  ImageBlockRenderer,
  ImageGalleryBlockRenderer,
  ImageTextSplitBlockRenderer,
  ImageTextSplitBlockSettings,
  RateTableBlockRenderer,
  RichTextBlockRenderer,
  RowBlockRenderer,
  RowBlockSettings,
  ScheduleBlockRenderer,
  SpacerBlockRenderer,
  SpacerBlockSettings,
  TestimonialsBlockRenderer,
  TwoColumnTextBlockRenderer,
} from '../components/blocks/BlockRenderers'

export function makeBlockId() {
  return `block-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const blockCategories = [
  { key: 'layout', label: 'Layout' },
  { key: 'content', label: 'Content' },
  { key: 'media', label: 'Media' },
  { key: 'dynamic', label: 'Dynamic' },
]

// Block types that create a nested BlockList (a card, a column, ...). Nesting these inside
// each other is allowed up to MAX_STRUCTURAL_NESTING_DEPTH so pages can compose freely without
// letting the tree grow unbounded.
export const STRUCTURAL_BLOCK_TYPES = ['group', 'row']
export const MAX_STRUCTURAL_NESTING_DEPTH = 3

export const blockDefinitions = {
  hero: {
    category: 'layout',
    defaultData: () => ({ action: { backgroundColor: '', label: '', path: '/' }, image: { kind: 'image' }, lead: '', title: 'New hero banner' }),
    label: 'Hero Banner',
    Renderer: HeroBannerBlockRenderer,
  },
  'image-text-split': {
    category: 'layout',
    defaultData: () => ({
      action: { label: '', path: '/' },
      body: '<p>Add your text here…</p>',
      image: { kind: 'image' },
      imagePosition: 'left',
      kicker: '',
      title: 'New section',
    }),
    label: 'Image + Text Split',
    Renderer: ImageTextSplitBlockRenderer,
    Settings: ImageTextSplitBlockSettings,
  },
  'feature-grid': {
    category: 'content',
    defaultData: () => ({ items: [], title: 'Why choose us' }),
    label: 'Feature Grid',
    Renderer: FeatureGridBlockRenderer,
  },
  'rich-text': {
    category: 'content',
    defaultData: () => ({ html: '<p>Add your text here…</p>' }),
    label: 'Rich Text',
    Renderer: RichTextBlockRenderer,
  },
  image: {
    category: 'media',
    defaultData: () => ({ caption: '', image: { kind: 'image' } }),
    label: 'Image',
    Renderer: ImageBlockRenderer,
  },
  'cta-band': {
    category: 'content',
    defaultData: () => ({ action: { backgroundColor: '', label: 'Learn More', path: '/' }, body: '', title: 'Call to action' }),
    label: 'Call-to-Action Band',
    Renderer: CtaBandBlockRenderer,
  },
  testimonials: {
    category: 'content',
    defaultData: () => ({ items: [] }),
    label: 'Testimonials / Reviews',
    Renderer: TestimonialsBlockRenderer,
  },
  'image-gallery': {
    category: 'media',
    defaultData: () => ({ images: [] }),
    label: 'Image Gallery',
    Renderer: ImageGalleryBlockRenderer,
  },
  spacer: {
    category: 'layout',
    defaultData: () => ({ size: 'medium' }),
    label: 'Spacer / Divider',
    Renderer: SpacerBlockRenderer,
    Settings: SpacerBlockSettings,
  },
  'directory-embed': {
    category: 'dynamic',
    defaultData: () => ({ source: 'properties', title: 'Available Now' }),
    label: 'Property / Charter Directory',
    Renderer: DirectoryEmbedBlockRenderer,
    Settings: DirectoryEmbedBlockSettings,
  },
  'contact-form': {
    category: 'dynamic',
    defaultData: () => ({ intro: 'We’ll get back to you soon.', title: 'Get in Touch' }),
    label: 'Contact / Inquiry Form',
    Renderer: ContactFormBlockRenderer,
  },
  'contact-details': {
    category: 'content',
    defaultData: () => ({ items: [] }),
    label: 'Contact Details',
    Renderer: ContactDetailsBlockRenderer,
  },
  schedule: {
    category: 'content',
    defaultData: () => ({ columns: [], notes: [], title: 'Schedule' }),
    label: 'Schedule / Timetable',
    Renderer: ScheduleBlockRenderer,
  },
  'rate-table': {
    category: 'content',
    defaultData: () => ({ footer: [], heading: 'Rates', link: { label: '', path: '' }, rows: [] }),
    label: 'Rate Table',
    Renderer: RateTableBlockRenderer,
  },
  group: {
    category: 'layout',
    defaultData: () => ({ items: [] }),
    label: 'Repeating Cards',
    Renderer: GroupBlockRenderer,
  },
  row: {
    category: 'layout',
    defaultData: () => ({
      columns: [
        { blocks: [], id: makeBlockId(), width: 1 },
        { blocks: [], id: makeBlockId(), width: 1 },
      ],
    }),
    label: 'Columns',
    Renderer: RowBlockRenderer,
    Settings: RowBlockSettings,
  },
  'two-column-text': {
    category: 'layout',
    defaultData: () => ({ left: '<p>Add your text here…</p>', right: '<p>Add your text here…</p>' }),
    label: 'Two-Column Text',
    Renderer: TwoColumnTextBlockRenderer,
  },
  'business-list': {
    category: 'content',
    defaultData: () => ({ items: [], title: 'Local Businesses' }),
    label: 'Business / Contact List',
    Renderer: BusinessListBlockRenderer,
  },
}

export function getBlockDefinition(type) {
  return blockDefinitions[type] ?? null
}

export function listBlockDefinitions() {
  return Object.entries(blockDefinitions).map(([type, definition]) => ({ type, ...definition }))
}
