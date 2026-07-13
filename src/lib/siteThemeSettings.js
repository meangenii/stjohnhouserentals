import {
  BLOCK_ALIGN_OPTIONS,
  BLOCK_BORDER_OPTIONS,
  BLOCK_BORDER_RADIUS_OPTIONS,
  BLOCK_SPACING_OPTIONS,
  BLOCK_WIDTH_OPTIONS,
  normalizeBlockStyle,
} from './blockStyle'

export const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i
const SAFE_CSS_VALUE_PATTERN = /^[#%(),./0-9a-z\s'"-]+$/i
const SAFE_RULE_OVERRIDE_VALUE_PATTERN = /^[^{};<>]{1,240}$/
const SAFE_CSS_PROPERTY_PATTERN = /^[a-z-]+$/i
const UNSAFE_CSS_VALUE_PATTERN = /(?:@import|expression\s*\(|javascript\s*:|url\s*\()/i

const DEFAULT_ELEMENT_STYLE_PRESETS = [
  {
    custom: false,
    enabled: true,
    id: 'soft-section',
    label: 'Soft Section',
    style: {
      background: { color: 'var(--surface-soft)', type: 'color' },
      border: 'none',
      borderRadius: 'small',
      color: '',
      spacing: 'medium',
      width: 'full',
    },
  },
  {
    custom: false,
    enabled: true,
    id: 'feature-card',
    label: 'Feature Card',
    style: {
      background: { color: 'var(--card-background)', type: 'color' },
      border: 'thin',
      borderRadius: 'large',
      color: '',
      spacing: 'medium',
      width: 'contained',
    },
  },
  {
    custom: false,
    enabled: true,
    id: 'cta-band',
    label: 'CTA Band',
    style: {
      align: 'center',
      background: { color: 'var(--home-band)', type: 'color' },
      border: 'none',
      borderRadius: 'small',
      color: 'var(--hero-text)',
      spacing: 'large',
      width: 'full',
    },
  },
  {
    custom: false,
    enabled: true,
    id: 'narrow-callout',
    label: 'Narrow Callout',
    style: {
      align: 'center',
      background: { color: 'var(--surface-pale)', type: 'color' },
      border: 'thin',
      borderRadius: 'large',
      color: '',
      spacing: 'medium',
      width: 'narrow',
    },
  },
]

const DEFAULT_SITE_THEME_SETTINGS = {
  colors: {
    buttonGhostBackground: '#f7fbff',
    buttonGhostBorder: '#c8d9fb',
    buttonGhostText: '#2269ff',
    buttonPrimaryBackground: '#0b2b5f',
    buttonPrimaryText: '#ffffff',
    buttonSecondaryBackground: '#ffffff',
    buttonSecondaryText: '#0b2b5f',
    cardBackground: '#ffffff',
    brandSky: '#37a5dd',
    brandBlue: '#2269ff',
    brandNavy: '#0b2b5f',
    brandNavyDeep: '#07214a',
    action: '#18750c',
    footerBlue: '#6ea7dd',
    homeBand: '#1d2f63',
    surface: '#ffffff',
    surfaceSoft: '#f4f8fc',
    surfacePale: '#f5fbff',
    text: '#111111',
    muted: '#556273',
    border: '#d7e2ec',
    heroLeadText: '#f5f9ff',
    heroText: '#ffffff',
  },
  typography: {
    bodySize: '12pt',
    bodyLineHeight: '1.6',
    bodyFont: "'DM Sans', 'Segoe UI', sans-serif",
    cardTitleSize: '18pt',
    displayFont: "'Unna', Georgia, serif",
    accentSize: '12pt',
    accentWeight: '400',
    accentSpacing: '0px',
    headingWeight: '400',
    heroTitleSize: '58pt',
    richTextH1Size: '36pt',
    richTextH2Size: '28pt',
    richTextH3Size: '22.5pt',
    richTextH4Size: '18pt',
    richTextH5Size: '15pt',
    richTextH6Size: '12pt',
    richTextPSize: '12pt',
    sectionTitleSize: '52pt',
  },
  layout: {
    chromeWidth: '1940px',
    pageWidth: '1180px',
    wideWidth: '1380px',
    heroHeight: '400px',
    heroImageAspect: '16 / 5',
    shadow: '0 18px 36px rgba(7, 33, 74, 0.08)',
  },
  components: {
    bandRadius: '12px',
    buttonFontWeight: '600',
    buttonPaddingX: '18px',
    buttonPaddingY: '12px',
    buttonRadius: '999px',
    buttonShadow: '0 16px 30px rgba(7, 33, 74, 0.16)',
    cardPadding: '22px',
    cardRadius: '16px',
    heroOverlayOpacity: '0.14',
    heroPaddingY: '48px',
    mediaRadius: '22px',
    pillRadius: '999px',
    sectionPaddingTop: '35px',
  },
  elementStyles: DEFAULT_ELEMENT_STYLE_PRESETS,
  ruleOverrides: {},
}

const THEME_VARIABLE_MAP = {
  colors: {
    action: ['--brand-orange', '--brand-orange-hover'],
    border: ['--border'],
    brandBlue: ['--brand-blue', '--inline-link-color'],
    brandNavy: ['--brand-navy', '--inline-link-hover-color'],
    brandNavyDeep: ['--brand-navy-deep'],
    brandSky: ['--brand-sky'],
    buttonGhostBackground: ['--button-ghost-background'],
    buttonGhostBorder: ['--button-ghost-border'],
    buttonGhostText: ['--button-ghost-text'],
    buttonPrimaryBackground: ['--button-primary-background'],
    buttonPrimaryText: ['--button-primary-text'],
    buttonSecondaryBackground: ['--button-secondary-background'],
    buttonSecondaryText: ['--button-secondary-text'],
    cardBackground: ['--card-background'],
    footerBlue: ['--footer-blue'],
    homeBand: ['--home-band'],
    heroLeadText: ['--hero-lead-text'],
    heroText: ['--hero-text'],
    muted: ['--muted'],
    surface: ['--surface'],
    surfacePale: ['--surface-pale'],
    surfaceSoft: ['--surface-soft'],
    text: ['--text'],
  },
  typography: {
    accentSize: ['--accent-header-size'],
    accentSpacing: ['--accent-header-spacing'],
    accentWeight: ['--accent-header-weight'],
    bodyLineHeight: ['--body-line-height'],
    bodySize: ['--body-font-size'],
    bodyFont: ['--font-body'],
    cardTitleSize: ['--card-title-size'],
    displayFont: ['--font-display'],
    headingWeight: ['--heading-weight'],
    heroTitleSize: ['--hero-title-size'],
    richTextH1Size: ['--rich-text-h1-size'],
    richTextH2Size: ['--rich-text-h2-size'],
    richTextH3Size: ['--rich-text-h3-size'],
    richTextH4Size: ['--rich-text-h4-size'],
    richTextH5Size: ['--rich-text-h5-size'],
    richTextH6Size: ['--rich-text-h6-size'],
    richTextPSize: ['--rich-text-p-size'],
    sectionTitleSize: ['--section-title-size'],
  },
  layout: {
    chromeWidth: ['--chrome-width'],
    heroHeight: ['--page-hero-height'],
    heroImageAspect: ['--page-hero-image-aspect'],
    pageWidth: ['--page-width'],
    shadow: ['--shadow'],
    wideWidth: ['--wide-width'],
  },
  components: {
    bandRadius: ['--band-radius'],
    buttonFontWeight: ['--button-font-weight'],
    buttonPaddingX: ['--button-padding-x'],
    buttonPaddingY: ['--button-padding-y'],
    buttonRadius: ['--button-radius'],
    buttonShadow: ['--button-shadow'],
    cardPadding: ['--card-padding'],
    cardRadius: ['--card-radius'],
    heroOverlayOpacity: ['--hero-overlay-opacity'],
    heroPaddingY: ['--hero-padding-y'],
    mediaRadius: ['--media-radius'],
    pillRadius: ['--pill-radius'],
    sectionPaddingTop: ['--section-padding-top'],
  },
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeHexColor(value, fallback) {
  const candidate = String(value ?? '').trim()

  if (HEX_COLOR_PATTERN.test(candidate)) {
    return candidate.toLowerCase()
  }

  return fallback
}

function normalizeCssTokenValue(value, fallback) {
  const candidate = String(value ?? '').trim()

  if (!candidate || candidate.length > 120 || !SAFE_CSS_VALUE_PATTERN.test(candidate)) {
    return fallback
  }

  return candidate
}

function normalizeCssRuleOverrideValue(value) {
  const candidate = String(value ?? '').replace(/\s+/g, ' ').trim()

  if (!candidate || !SAFE_RULE_OVERRIDE_VALUE_PATTERN.test(candidate) || UNSAFE_CSS_VALUE_PATTERN.test(candidate)) {
    return ''
  }

  return candidate
}

function normalizeCssRuleSelector(value) {
  const candidate = String(value ?? '').replace(/\s+/g, ' ').trim()

  if (!candidate || candidate.length > 320 || /[{};]/.test(candidate)) {
    return ''
  }

  return candidate
}

function normalizeCssRuleMedia(value) {
  const candidate = String(value ?? '').replace(/\s+/g, ' ').trim()

  if (!candidate) {
    return ''
  }

  if (!/^@(?:media|supports)\s+[^{;}]+$/i.test(candidate)) {
    return ''
  }

  return candidate
}

function normalizeRuleOverrides(sourceOverrides = {}) {
  if (!sourceOverrides || typeof sourceOverrides !== 'object' || Array.isArray(sourceOverrides)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(sourceOverrides)
      .map(([id, override]) => {
        const key = String(id ?? '').trim()
        const selector = normalizeCssRuleSelector(override?.selector)
        const property = String(override?.property ?? '').trim().toLowerCase()
        const value = normalizeCssRuleOverrideValue(override?.value)
        const media = normalizeCssRuleMedia(override?.media)

        if (!key || key.length > 120 || !selector || !SAFE_CSS_PROPERTY_PATTERN.test(property) || !value) {
          return null
        }

        return [
          key,
          {
            media,
            property,
            selector,
            value,
          },
        ]
      })
      .filter(Boolean),
  )
}

function normalizeElementStyleCssValue(value, fallback = '') {
  const candidate = String(value ?? '').trim()
  const fallbackValue = String(fallback ?? '').trim()

  if (!candidate) {
    return fallbackValue
  }

  if (candidate.length <= 120 && SAFE_CSS_VALUE_PATTERN.test(candidate) && !UNSAFE_CSS_VALUE_PATTERN.test(candidate)) {
    return candidate
  }

  return fallbackValue
}

function normalizeElementStyleId(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeElementStylePresetStyle(sourceStyle = {}, fallbackStyle = {}) {
  const normalized = normalizeBlockStyle(sourceStyle, fallbackStyle)
  const backgroundColor = normalizeElementStyleCssValue(normalized.background.color, fallbackStyle?.background?.color)
  const textColor = normalizeElementStyleCssValue(normalized.color, fallbackStyle?.color)
  const backgroundType = normalized.background.type === 'color' && backgroundColor ? 'color' : 'none'

  return {
    align: BLOCK_ALIGN_OPTIONS.includes(normalized.align) ? normalized.align : 'left',
    background: {
      color: backgroundType === 'color' ? backgroundColor : '',
      image: null,
      type: backgroundType,
    },
    border: BLOCK_BORDER_OPTIONS.includes(normalized.border) ? normalized.border : 'none',
    borderRadius: BLOCK_BORDER_RADIUS_OPTIONS.includes(normalized.borderRadius) ? normalized.borderRadius : 'none',
    color: textColor,
    spacing: BLOCK_SPACING_OPTIONS.includes(normalized.spacing) ? normalized.spacing : 'none',
    width: BLOCK_WIDTH_OPTIONS.includes(normalized.width) ? normalized.width : 'full',
  }
}

function normalizeElementStylePresets(sourcePresets = []) {
  const defaultsById = new Map(DEFAULT_ELEMENT_STYLE_PRESETS.map((preset) => [preset.id, preset]))
  const sourceRows = Array.isArray(sourcePresets) ? sourcePresets : []
  const normalizedRows = []
  const seenIds = new Set()

  sourceRows.forEach((preset) => {
    const sourceId = normalizeElementStyleId(preset?.id || preset?.label)
    const defaultPreset = defaultsById.get(sourceId)
    const id = defaultPreset?.id ?? sourceId

    if (!id || seenIds.has(id)) {
      return
    }

    const fallbackStyle = defaultPreset?.style ?? {}

    normalizedRows.push({
      custom: !defaultPreset,
      enabled: defaultPreset ? preset.enabled !== false : preset.enabled !== false,
      id,
      label: String(preset?.label ?? defaultPreset?.label ?? id).trim() || defaultPreset?.label || id,
      style: normalizeElementStylePresetStyle(preset?.style, fallbackStyle),
    })
    seenIds.add(id)
  })

  DEFAULT_ELEMENT_STYLE_PRESETS.forEach((preset) => {
    if (seenIds.has(preset.id)) {
      return
    }

    normalizedRows.push({
      ...preset,
      style: normalizeElementStylePresetStyle(preset.style),
    })
    seenIds.add(preset.id)
  })

  return normalizedRows
}

function normalizeThemeGroup(sourceGroup, defaultGroup, normalizer) {
  return Object.fromEntries(
    Object.entries(defaultGroup).map(([key, fallback]) => [key, normalizer(sourceGroup?.[key], fallback)]),
  )
}

function scopeRuleSelector(selector) {
  const normalizedSelector = normalizeCssRuleSelector(selector)

  if (!normalizedSelector || /^(?::root|html|body|#root|\*)$/i.test(normalizedSelector)) {
    return ''
  }

  if (normalizedSelector === '.site-shell' || normalizedSelector.startsWith('.site-shell ')) {
    return normalizedSelector
  }

  return `.site-shell ${normalizedSelector}`
}

export function getDefaultSiteThemeSettings() {
  return cloneValue(DEFAULT_SITE_THEME_SETTINGS)
}

export function normalizeSiteThemeSettings(theme = {}) {
  return {
    colors: normalizeThemeGroup(theme?.colors, DEFAULT_SITE_THEME_SETTINGS.colors, normalizeHexColor),
    typography: normalizeThemeGroup(theme?.typography, DEFAULT_SITE_THEME_SETTINGS.typography, normalizeCssTokenValue),
    layout: normalizeThemeGroup(theme?.layout, DEFAULT_SITE_THEME_SETTINGS.layout, normalizeCssTokenValue),
    components: normalizeThemeGroup(theme?.components, DEFAULT_SITE_THEME_SETTINGS.components, normalizeCssTokenValue),
    elementStyles: normalizeElementStylePresets(theme?.elementStyles),
    ruleOverrides: normalizeRuleOverrides(theme?.ruleOverrides),
  }
}

export function getSiteThemeElementStylePresets(theme = {}) {
  return normalizeSiteThemeSettings(theme).elementStyles
}

export function getSiteThemeCssProperties(theme = {}) {
  const normalizedTheme = normalizeSiteThemeSettings(theme)
  const cssProperties = {}

  Object.entries(THEME_VARIABLE_MAP).forEach(([groupKey, tokenMap]) => {
    Object.entries(tokenMap).forEach(([tokenKey, variables]) => {
      const value = normalizedTheme[groupKey]?.[tokenKey]

      variables.forEach((variableName) => {
        cssProperties[variableName] = value
      })
    })
  })

  cssProperties['--brand-orange-fill-image'] = `linear-gradient(${normalizedTheme.colors.action}, ${normalizedTheme.colors.action})`

  return cssProperties
}

export function getSiteThemeCssText(theme = {}) {
  const properties = getSiteThemeCssProperties(theme)

  return Object.entries(properties)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n')
}

export function getSiteThemeRuleOverrideCssText(theme = {}) {
  const normalizedTheme = normalizeSiteThemeSettings(theme)
  const rulesByMedia = new Map()

  Object.values(normalizedTheme.ruleOverrides).forEach((override) => {
    const selector = scopeRuleSelector(override.selector)

    if (!selector) {
      return
    }

    const declaration = `${selector} { ${override.property}: ${override.value}; }`
    const mediaKey = override.media || ''
    const currentRules = rulesByMedia.get(mediaKey) ?? []
    currentRules.push(declaration)
    rulesByMedia.set(mediaKey, currentRules)
  })

  return Array.from(rulesByMedia.entries())
    .map(([media, rules]) => {
      const ruleText = rules.sort().join('\n')
      return media ? `${media} {\n${ruleText}\n}` : ruleText
    })
    .filter(Boolean)
    .join('\n')
}
