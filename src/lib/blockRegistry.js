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
import {
  assertExactBlockTypeKeys,
  BLOCK_TYPES,
  getBlockDefinitionVersion,
  MAX_STRUCTURAL_NESTING_DEPTH,
  STRUCTURAL_BLOCK_TYPES,
} from './blockContract'
import { createBlockDefaultData, createBlockRecord, makeBlockId } from './blockDefaults'
import { getBlockInspectorSchema } from './blockInspectorSchema'
import { migrateBlockRecord } from './blockMigrations'

export { createBlockRecord, makeBlockId, MAX_STRUCTURAL_NESTING_DEPTH, STRUCTURAL_BLOCK_TYPES }

export const blockCategories = [
  { key: 'layout', label: 'Layout' },
  { key: 'content', label: 'Content' },
  { key: 'media', label: 'Media' },
  { key: 'dynamic', label: 'Dynamic' },
]

const blockRendererDefinitions = {
  hero: {
    category: 'layout',
    label: 'Hero Banner',
    layout: 'bleed',
    Renderer: HeroBannerBlockRenderer,
    schema: getBlockInspectorSchema('hero'),
  },
  'image-text-split': {
    category: 'layout',
    label: 'Image + Text Split',
    layout: 'contained',
    Renderer: ImageTextSplitBlockRenderer,
    schema: getBlockInspectorSchema('image-text-split'),
    Settings: ImageTextSplitBlockSettings,
  },
  'feature-grid': {
    category: 'content',
    label: 'Feature Grid',
    layout: 'contained',
    Renderer: FeatureGridBlockRenderer,
    schema: getBlockInspectorSchema('feature-grid'),
  },
  'rich-text': {
    category: 'content',
    label: 'Rich Text',
    layout: 'contained',
    Renderer: RichTextBlockRenderer,
    schema: getBlockInspectorSchema('rich-text'),
  },
  image: {
    category: 'media',
    label: 'Image',
    layout: 'contained',
    Renderer: ImageBlockRenderer,
    schema: getBlockInspectorSchema('image'),
  },
  'cta-band': {
    category: 'content',
    label: 'Call-to-Action Band',
    layout: 'bleed',
    Renderer: CtaBandBlockRenderer,
    schema: getBlockInspectorSchema('cta-band'),
  },
  testimonials: {
    category: 'content',
    label: 'Testimonials / Reviews',
    layout: 'contained',
    Renderer: TestimonialsBlockRenderer,
    schema: getBlockInspectorSchema('testimonials'),
  },
  'image-gallery': {
    category: 'media',
    label: 'Image Gallery',
    layout: 'contained',
    Renderer: ImageGalleryBlockRenderer,
    schema: getBlockInspectorSchema('image-gallery'),
  },
  spacer: {
    category: 'layout',
    label: 'Spacer / Divider',
    layout: 'bleed',
    Renderer: SpacerBlockRenderer,
    schema: getBlockInspectorSchema('spacer'),
    Settings: SpacerBlockSettings,
  },
  'directory-embed': {
    category: 'dynamic',
    label: 'Property / Charter Directory',
    layout: 'bleed',
    Renderer: DirectoryEmbedBlockRenderer,
    schema: getBlockInspectorSchema('directory-embed'),
    Settings: DirectoryEmbedBlockSettings,
  },
  'contact-form': {
    category: 'dynamic',
    label: 'Contact / Inquiry Form',
    layout: 'contained',
    Renderer: ContactFormBlockRenderer,
    schema: getBlockInspectorSchema('contact-form'),
  },
  'contact-details': {
    category: 'content',
    label: 'Contact Details',
    layout: 'contained',
    Renderer: ContactDetailsBlockRenderer,
    schema: getBlockInspectorSchema('contact-details'),
  },
  schedule: {
    category: 'content',
    label: 'Schedule / Timetable',
    layout: 'contained',
    Renderer: ScheduleBlockRenderer,
    schema: getBlockInspectorSchema('schedule'),
  },
  'rate-table': {
    category: 'content',
    label: 'Rate Table',
    layout: 'contained',
    Renderer: RateTableBlockRenderer,
    schema: getBlockInspectorSchema('rate-table'),
  },
  group: {
    category: 'layout',
    label: 'Repeating Cards',
    layout: 'contained',
    Renderer: GroupBlockRenderer,
    schema: getBlockInspectorSchema('group'),
  },
  row: {
    category: 'layout',
    label: 'Columns',
    layout: 'contained',
    Renderer: RowBlockRenderer,
    schema: getBlockInspectorSchema('row'),
    Settings: RowBlockSettings,
  },
  'two-column-text': {
    category: 'layout',
    label: 'Two-Column Text',
    layout: 'contained',
    Renderer: TwoColumnTextBlockRenderer,
    schema: getBlockInspectorSchema('two-column-text'),
  },
  'business-list': {
    category: 'content',
    label: 'Business / Contact List',
    layout: 'contained',
    Renderer: BusinessListBlockRenderer,
    schema: getBlockInspectorSchema('business-list'),
  },
}

assertExactBlockTypeKeys(Object.keys(blockRendererDefinitions), 'Block renderer definitions')

export const blockDefinitions = Object.fromEntries(
  BLOCK_TYPES.map((type) => [
    type,
    {
      ...blockRendererDefinitions[type],
      defaultData: (options = {}) => createBlockDefaultData(type, options),
      migrate: (block) => migrateBlockRecord(block, { expectedType: type }).block,
      schema: getBlockInspectorSchema(type),
      type,
      version: getBlockDefinitionVersion(type),
    },
  ]),
)

export function getBlockDefinition(type) {
  return blockDefinitions[type] ?? null
}

export function listBlockDefinitions() {
  return Object.entries(blockDefinitions).map(([type, definition]) => ({ type, ...definition }))
}
