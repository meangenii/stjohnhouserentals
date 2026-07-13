import { normalizeRichTextFontSizeAsPoints, RICH_TEXT_BLOCK_OPTIONS, RICH_TEXT_FONT_SIZE_OPTIONS } from './richTextFormatting'

const EDITOR_STYLE_SETTINGS_STORAGE_KEY = 'genericcms.admin.editor-style-settings'
const EDITOR_STYLE_SETTINGS_CHANGE_EVENT = 'genericcms:editor-style-settings-change'

function createRowId(prefix, value) {
  const slug =
    String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'default'

  return `${prefix}-${slug}`
}

function createDefaultRows(options, requiredValue, prefix) {
  return options.map((option) => ({
    custom: false,
    enabled: true,
    id: createRowId(prefix, option.value),
    label: option.label,
    required: option.value === requiredValue,
    value: option.value,
  }))
}

const DEFAULT_EDITOR_STYLE_SETTINGS = {
  blockStyles: createDefaultRows(RICH_TEXT_BLOCK_OPTIONS, 'p', 'block'),
  fontSizes: createDefaultRows(RICH_TEXT_FONT_SIZE_OPTIONS, 'default', 'font'),
}

function cloneSettings(settings) {
  return JSON.parse(JSON.stringify(settings))
}

function normalizeLabel(value, fallback) {
  return String(value ?? '').trim() || fallback
}

function normalizeRowId(value) {
  return String(value ?? '').trim()
}

function normalizeBlockStyleValue(value) {
  const normalizedValue = String(value ?? '').trim().toLowerCase()
  return RICH_TEXT_BLOCK_OPTIONS.some((option) => option.value === normalizedValue) ? normalizedValue : ''
}

function normalizeFontSizeValue(value) {
  const normalizedValue = String(value ?? '').trim().toLowerCase()

  if (normalizedValue === 'default') {
    return 'default'
  }

  return normalizeRichTextFontSizeAsPoints(normalizedValue)
}

function normalizeRows(rows, defaultRows, normalizeValue, { allowCustom = false } = {}) {
  const defaultsById = new Map(defaultRows.map((row) => [row.id, row]))
  const defaultsByValue = new Map(defaultRows.map((row) => [row.value, row]))
  const sourceRows = Array.isArray(rows) ? rows : []
  const normalizedRows = []
  const seenIds = new Set()
  const seenValues = new Set()

  sourceRows.forEach((row) => {
    const sourceId = normalizeRowId(row?.id)
    const rawValue = String(row?.value ?? '').trim()
    const defaultRow = defaultsById.get(sourceId) ?? defaultsByValue.get(rawValue)

    if (!defaultRow && !allowCustom) {
      return
    }

    const id = defaultRow?.id ?? sourceId
    const normalizedValue = defaultRow?.required ? defaultRow.value : normalizeValue(rawValue || defaultRow?.value)
    const value = normalizedValue || defaultRow?.value || ''

    if (!id || !value || seenIds.has(id) || seenValues.has(value)) {
      return
    }

    normalizedRows.push({
      custom: !defaultRow,
      enabled: defaultRow?.required ? true : row.enabled !== false,
      id,
      label: normalizeLabel(row.label, defaultRow?.label ?? value),
      required: Boolean(defaultRow?.required),
      value,
    })
    seenIds.add(id)
    seenValues.add(value)
  })

  defaultRows.forEach((defaultRow) => {
    if (seenIds.has(defaultRow.id) || seenValues.has(defaultRow.value)) {
      return
    }

    normalizedRows.push({ ...defaultRow })
    seenIds.add(defaultRow.id)
    seenValues.add(defaultRow.value)
  })

  return normalizedRows
}

function dispatchEditorStyleSettingsChange(settings) {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(
    new CustomEvent(EDITOR_STYLE_SETTINGS_CHANGE_EVENT, {
      detail: cloneSettings(settings),
    }),
  )
}

export function getDefaultEditorStyleSettings() {
  return cloneSettings(DEFAULT_EDITOR_STYLE_SETTINGS)
}

export function normalizeEditorStyleSettings(settings = {}) {
  return {
    blockStyles: normalizeRows(settings?.blockStyles, DEFAULT_EDITOR_STYLE_SETTINGS.blockStyles, normalizeBlockStyleValue),
    fontSizes: normalizeRows(settings?.fontSizes, DEFAULT_EDITOR_STYLE_SETTINGS.fontSizes, normalizeFontSizeValue, {
      allowCustom: true,
    }),
  }
}

export function readEditorStyleSettings() {
  if (typeof window === 'undefined') {
    return getDefaultEditorStyleSettings()
  }

  try {
    const rawValue = window.localStorage.getItem(EDITOR_STYLE_SETTINGS_STORAGE_KEY)
    return normalizeEditorStyleSettings(rawValue ? JSON.parse(rawValue) : null)
  } catch {
    return getDefaultEditorStyleSettings()
  }
}

export function writeEditorStyleSettings(settings) {
  const normalizedSettings = normalizeEditorStyleSettings(settings)

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(EDITOR_STYLE_SETTINGS_STORAGE_KEY, JSON.stringify(normalizedSettings))
    } catch {
      // Keep the in-memory update active even when browser storage is unavailable.
    }

    dispatchEditorStyleSettingsChange(normalizedSettings)
  }

  return normalizedSettings
}

export function resetEditorStyleSettings() {
  const defaultSettings = getDefaultEditorStyleSettings()

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(EDITOR_STYLE_SETTINGS_STORAGE_KEY)
    } catch {
      // Keep the in-memory reset active even when browser storage is unavailable.
    }

    dispatchEditorStyleSettingsChange(defaultSettings)
  }

  return defaultSettings
}

export function subscribeEditorStyleSettings(listener) {
  if (typeof window === 'undefined') {
    return () => {}
  }

  function handleSettingsChange(event) {
    listener(normalizeEditorStyleSettings(event.detail))
  }

  function handleStorage(event) {
    if (event.key === EDITOR_STYLE_SETTINGS_STORAGE_KEY) {
      listener(readEditorStyleSettings())
    }
  }

  window.addEventListener(EDITOR_STYLE_SETTINGS_CHANGE_EVENT, handleSettingsChange)
  window.addEventListener('storage', handleStorage)

  return () => {
    window.removeEventListener(EDITOR_STYLE_SETTINGS_CHANGE_EVENT, handleSettingsChange)
    window.removeEventListener('storage', handleStorage)
  }
}

export function getEnabledRichTextBlockOptions(settings = readEditorStyleSettings()) {
  const normalizedSettings = normalizeEditorStyleSettings(settings)
  return normalizedSettings.blockStyles
    .filter((style) => style.enabled)
    .map((style) => ({ label: style.label, value: style.value }))
}

export function getEnabledRichTextFontSizeOptions(settings = readEditorStyleSettings()) {
  const normalizedSettings = normalizeEditorStyleSettings(settings)
  return normalizedSettings.fontSizes
    .filter((style) => style.enabled)
    .map((style) => ({ label: style.label, value: style.value }))
}
