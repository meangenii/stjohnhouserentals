import propertyTemplateVariantManifest from '../../shared/propertyTemplateVariants.json'

export const DEFAULT_PROPERTY_TEMPLATE_VARIANT = propertyTemplateVariantManifest.defaultVariant
export const PROPERTY_TEMPLATE_VARIANT_OPTIONS = propertyTemplateVariantManifest.variants

const SECTION_TITLES = {
  shortDescription: 'Short Description',
  description: 'Description',
  amenities: 'Amenities',
  reviews: 'Reviews',
}

const PROPERTY_TEMPLATE_VARIANT_CONFIGS = {
  'source-stack': {
    id: 'source-stack',
    sectionOrder: ['shortDescription', 'description', 'amenities', 'reviews'],
    sections: {
      shortDescription: { showHeader: false, title: SECTION_TITLES.shortDescription, renderWhenEmpty: false },
      description: { showHeader: false, title: SECTION_TITLES.description, renderWhenEmpty: false },
      amenities: { showHeader: false, title: SECTION_TITLES.amenities, renderWhenEmpty: false },
      reviews: { showHeader: false, title: SECTION_TITLES.reviews, renderWhenEmpty: false },
    },
  },
  'supplemental-sections': {
    id: 'supplemental-sections',
    sectionOrder: ['shortDescription', 'description', 'amenities', 'reviews'],
    sections: {
      shortDescription: { showHeader: false, title: SECTION_TITLES.shortDescription, renderWhenEmpty: false },
      description: { showHeader: false, title: SECTION_TITLES.description, renderWhenEmpty: false },
      amenities: { showHeader: true, title: SECTION_TITLES.amenities, renderWhenEmpty: false },
      reviews: { showHeader: true, title: SECTION_TITLES.reviews, renderWhenEmpty: false },
    },
  },
  'fully-sectioned': {
    id: 'fully-sectioned',
    sectionOrder: ['shortDescription', 'description', 'amenities', 'reviews'],
    sections: {
      shortDescription: { showHeader: true, title: SECTION_TITLES.shortDescription, renderWhenEmpty: true },
      description: { showHeader: true, title: SECTION_TITLES.description, renderWhenEmpty: true },
      amenities: { showHeader: true, title: SECTION_TITLES.amenities, renderWhenEmpty: true },
      reviews: { showHeader: true, title: SECTION_TITLES.reviews, renderWhenEmpty: false },
    },
  },
}

export function normalizePropertyTemplateVariant(value) {
  const normalizedValue = String(value ?? '').trim()
  return PROPERTY_TEMPLATE_VARIANT_CONFIGS[normalizedValue] ? normalizedValue : DEFAULT_PROPERTY_TEMPLATE_VARIANT
}

export function getPropertyTemplateVariantConfig(value) {
  return PROPERTY_TEMPLATE_VARIANT_CONFIGS[normalizePropertyTemplateVariant(value)]
}
