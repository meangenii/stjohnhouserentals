import { assertExactBlockTypeKeys } from './blockContract.js'
import { createBlockCollectionItem } from './blockDefaults.js'

function makeInspectorItemId() {
  return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const SPACER_SIZE_OPTIONS = [
  { label: 'Small', value: 'small' },
  { label: 'Medium', value: 'medium' },
  { label: 'Large', value: 'large' },
]

const IMAGE_TEXT_POSITION_OPTIONS = [
  { label: 'Image left', value: 'left' },
  { label: 'Image right', value: 'right' },
]

const DIRECTORY_SOURCE_OPTIONS = [
  { label: 'Rental properties', value: 'properties' },
  { label: 'Charter boats', value: 'charters' },
]

const FEATURE_ICON_OPTIONS = [
  { label: 'Star', value: 'star' },
  { label: 'Check', value: 'check' },
  { label: 'Pin', value: 'pin' },
  { label: 'Tag', value: 'tag' },
]

const CONTACT_DETAIL_TYPE_OPTIONS = [
  { label: 'Text', value: 'text' },
  { label: 'Phone', value: 'phone' },
  { label: 'Link', value: 'link' },
]

function textField(path, label, options = {}) {
  return { label, path, widget: 'text', ...options }
}

function richHtmlField(path, label, options = {}) {
  return { label, path, widget: 'richHtml', ...options }
}

function enumField(path, label, options, extra = {}) {
  return { label, options, path, widget: 'enum', ...extra }
}

function linkField({ defaultType = 'internal', destinationField = 'path', destinationLabel = 'Link', label = 'Link', labelLabel = 'Text', labelPath, linkPath }) {
  return {
    defaultType,
    destinationField,
    destinationLabel,
    label,
    labelLabel,
    labelPath,
    linkPath,
    widget: 'link',
  }
}

function imageField(path = ['image'], label = 'Image') {
  return { label, path, widget: 'image' }
}

function colorField(path, label) {
  return { label, path, widget: 'color' }
}

function stringListField(path, idPath, label, singularLabel) {
  return {
    idPath,
    label,
    makeId: makeInspectorItemId,
    path,
    singularLabel,
    widget: 'stringList',
  }
}

function collectionItemFactory(type, collection) {
  return ({ makeId = makeInspectorItemId } = {}) => createBlockCollectionItem(type, collection, { makeId })
}

export const blockInspectorSchemas = {
  hero: {
    fields: [
      textField(['title'], 'Title', { multiline: true, rows: 3 }),
      textField(['lead'], 'Lead', { multiline: true, rows: 4 }),
      imageField(['image'], 'Hero image'),
      linkField({
        defaultType: 'internal',
        destinationField: 'path',
        destinationLabel: 'Button link',
        label: 'Button',
        labelLabel: 'Button text',
        labelPath: ['action', 'label'],
        linkPath: ['action'],
      }),
      colorField(['action', 'backgroundColor'], 'Button color'),
    ],
  },
  'image-text-split': {
    fields: [
      textField(['kicker'], 'Kicker'),
      textField(['title'], 'Title', { multiline: true, rows: 3 }),
      richHtmlField(['body'], 'Body'),
      enumField(['imagePosition'], 'Image side', IMAGE_TEXT_POSITION_OPTIONS),
      imageField(['image'], 'Section image'),
      linkField({
        defaultType: 'internal',
        destinationField: 'path',
        destinationLabel: 'Link',
        label: 'Link',
        labelLabel: 'Link text',
        labelPath: ['action', 'label'],
        linkPath: ['action'],
      }),
    ],
  },
  'feature-grid': {
    fields: [
      textField(['title'], 'Title', { multiline: true, rows: 3 }),
      {
        fields: [
          enumField(['kind'], 'Icon', FEATURE_ICON_OPTIONS),
          textField(['title'], 'Title'),
          textField(['body'], 'Description', { multiline: true, rows: 3 }),
        ],
        label: 'Features',
        makeItem: collectionItemFactory('feature-grid', 'items'),
        path: ['items'],
        singularLabel: 'Feature',
        widget: 'objectList',
      },
    ],
  },
  'rich-text': {
    fields: [richHtmlField(['html'], 'Text')],
  },
  image: {
    fields: [textField(['caption'], 'Caption', { multiline: true, rows: 3 }), imageField(['image'])],
  },
  'cta-band': {
    fields: [
      textField(['title'], 'Title', { multiline: true, rows: 3 }),
      textField(['body'], 'Body', { multiline: true, rows: 4 }),
      linkField({
        defaultType: 'internal',
        destinationField: 'path',
        destinationLabel: 'Button link',
        label: 'Button',
        labelLabel: 'Button text',
        labelPath: ['action', 'label'],
        linkPath: ['action'],
      }),
      colorField(['action', 'backgroundColor'], 'Button color'),
    ],
  },
  testimonials: {
    fields: [
      {
        fields: [
          textField(['quote'], 'Quote', { multiline: true, rows: 4 }),
          textField(['author'], 'Author'),
        ],
        label: 'Testimonials',
        makeItem: collectionItemFactory('testimonials', 'items'),
        path: ['items'],
        singularLabel: 'Testimonial',
        widget: 'objectList',
      },
    ],
  },
  'image-gallery': {
    fields: [
      {
        fields: [imageField([], 'Gallery image')],
        label: 'Images',
        makeItem: collectionItemFactory('image-gallery', 'images'),
        path: ['images'],
        singularLabel: 'Image',
        widget: 'objectList',
      },
    ],
  },
  spacer: {
    fields: [enumField(['size'], 'Size', SPACER_SIZE_OPTIONS)],
  },
  'directory-embed': {
    fields: [textField(['title'], 'Title'), enumField(['source'], 'Source', DIRECTORY_SOURCE_OPTIONS)],
  },
  'contact-form': {
    fields: [
      textField(['title'], 'Title', { multiline: true, rows: 3 }),
      textField(['intro'], 'Intro', { multiline: true, rows: 4 }),
    ],
  },
  'contact-details': {
    fields: [
      {
        fields: [
          textField(['label'], 'Label'),
          enumField(['type'], 'Type', CONTACT_DETAIL_TYPE_OPTIONS),
          textField(['value'], 'Text', { visibleWhen: { equals: 'text', path: ['type'] } }),
          textField(['value'], 'Phone number', { inputType: 'tel', visibleWhen: { equals: 'phone', path: ['type'] } }),
          {
            ...linkField({
              defaultType: 'external',
              destinationField: 'href',
              destinationLabel: 'Link',
              label: 'Link',
              labelLabel: 'Link text',
              labelPath: ['value'],
              linkPath: [],
            }),
            visibleWhen: { equals: 'link', path: ['type'] },
          },
        ],
        label: 'Details',
        makeItem: collectionItemFactory('contact-details', 'items'),
        path: ['items'],
        singularLabel: 'Detail',
        widget: 'objectList',
      },
    ],
  },
  schedule: {
    fields: [
      textField(['title'], 'Title'),
      {
        fields: [
          textField(['heading'], 'Heading'),
          stringListField(['times'], ['timeIds'], 'Times', 'time'),
        ],
        label: 'Columns',
        makeItem: collectionItemFactory('schedule', 'columns'),
        path: ['columns'],
        singularLabel: 'Column',
        widget: 'objectList',
      },
      stringListField(['notes'], ['noteIds'], 'Notes', 'note'),
    ],
  },
  'rate-table': {
    fields: [
      textField(['heading'], 'Heading'),
      {
        fields: [
          textField(['label'], 'Label'),
          stringListField(['values'], ['valueIds'], 'Values', 'value'),
        ],
        label: 'Rows',
        makeItem: collectionItemFactory('rate-table', 'rows'),
        path: ['rows'],
        singularLabel: 'Row',
        widget: 'objectList',
      },
      stringListField(['footer'], ['footerIds'], 'Footer lines', 'footer line'),
      linkField({
        defaultType: 'external',
        destinationField: 'path',
        destinationLabel: 'Link',
        label: 'Link',
        labelLabel: 'Link text',
        labelPath: ['link', 'label'],
        linkPath: ['link'],
      }),
    ],
  },
  group: {
    fields: [
      {
        fields: [textField(['title'], 'Card title'), imageField(['image'], 'Card image')],
        label: 'Cards',
        makeItem: collectionItemFactory('group', 'items'),
        path: ['items'],
        singularLabel: 'Card',
        widget: 'objectList',
      },
    ],
  },
  row: {
    fields: [],
  },
  'two-column-text': {
    fields: [richHtmlField(['left'], 'Left column'), richHtmlField(['right'], 'Right column')],
  },
  'business-list': {
    fields: [
      textField(['title'], 'Title', { multiline: true, rows: 3 }),
      {
        fields: [
          linkField({
            defaultType: 'external',
            destinationField: 'website',
            destinationLabel: 'Website',
            label: 'Business website',
            labelLabel: 'Business name',
            labelPath: ['name'],
            linkPath: [],
          }),
          stringListField(['phones'], ['phoneIds'], 'Phone numbers', 'phone number'),
        ],
        label: 'Businesses',
        makeItem: collectionItemFactory('business-list', 'items'),
        path: ['items'],
        singularLabel: 'Business',
        widget: 'objectList',
      },
    ],
  },
}

assertExactBlockTypeKeys(Object.keys(blockInspectorSchemas), 'Block inspector schemas')

export function getBlockInspectorSchema(type) {
  return blockInspectorSchemas[String(type ?? '').trim()] ?? null
}

export function getBlockInspectorFields(type) {
  return getBlockInspectorSchema(type)?.fields ?? []
}
