import assert from 'node:assert/strict'
import {
  BLOCK_ALIGN_OPTIONS,
  BLOCK_BACKGROUND_FOCAL_POINT_OPTIONS,
  BLOCK_BACKGROUND_OVERLAY_OPTIONS,
  BLOCK_BACKGROUND_TYPES,
  BLOCK_BORDER_OPTIONS,
  BLOCK_BORDER_RADIUS_OPTIONS,
  BLOCK_COLOR_SWATCHES,
  BLOCK_SPACING_OPTIONS,
  BLOCK_WIDTH_OPTIONS,
  getBlockBackgroundPosition,
  isDefaultBlockStyle,
  normalizeBlockStyle,
  resolveBlockStyle,
} from '../src/lib/blockStyle.js'

function assertStringOptions(name, options) {
  assert.ok(Array.isArray(options), `${name} must be an array.`)
  assert.ok(options.length > 0, `${name} must not be empty.`)
  options.forEach((option) => {
    assert.equal(typeof option, 'string', `${name} options must be strings.`)
    assert.ok(option.trim(), `${name} options must not be blank.`)
  })
  assert.equal(new Set(options).size, options.length, `${name} options must be unique.`)
}

assertStringOptions('BLOCK_ALIGN_OPTIONS', BLOCK_ALIGN_OPTIONS)
assertStringOptions('BLOCK_BACKGROUND_FOCAL_POINT_OPTIONS', BLOCK_BACKGROUND_FOCAL_POINT_OPTIONS)
assertStringOptions('BLOCK_BACKGROUND_OVERLAY_OPTIONS', BLOCK_BACKGROUND_OVERLAY_OPTIONS)
assertStringOptions('BLOCK_BACKGROUND_TYPES', BLOCK_BACKGROUND_TYPES)
assertStringOptions('BLOCK_BORDER_OPTIONS', BLOCK_BORDER_OPTIONS)
assertStringOptions('BLOCK_BORDER_RADIUS_OPTIONS', BLOCK_BORDER_RADIUS_OPTIONS)
assertStringOptions('BLOCK_SPACING_OPTIONS', BLOCK_SPACING_OPTIONS)
assertStringOptions('BLOCK_WIDTH_OPTIONS', BLOCK_WIDTH_OPTIONS)

assert.ok(BLOCK_COLOR_SWATCHES.length > 0, 'Expected block color swatches.')
assert.equal(new Set(BLOCK_COLOR_SWATCHES.map((swatch) => swatch.value)).size, BLOCK_COLOR_SWATCHES.length)

assert.deepEqual(normalizeBlockStyle({ align: 'sideways', width: 'huge' }), {
  align: 'left',
  background: { color: '', focalPoint: 'center', image: null, overlay: 'none', type: 'none' },
  border: 'none',
  borderRadius: 'none',
  color: '',
  presetId: '',
  spacing: 'none',
  width: 'full',
})

const resolvedFromPreset = resolveBlockStyle(
  { align: 'right', presetId: 'callout' },
  [
    {
      enabled: true,
      id: 'callout',
      style: {
        background: { color: '#f4f8fc', type: 'color' },
        spacing: 'large',
        width: 'contained',
      },
    },
  ],
)

assert.equal(resolvedFromPreset.align, 'right')
assert.equal(resolvedFromPreset.background.type, 'color')
assert.equal(resolvedFromPreset.background.color, '#f4f8fc')
assert.equal(resolvedFromPreset.spacing, 'large')
assert.equal(resolvedFromPreset.width, 'contained')

const resolvedBackgroundImage = resolveBlockStyle(
  {
    background: { focalPoint: 'bottom-right', overlay: 'dark', type: 'image' },
    presetId: 'hero-background',
  },
  [
    {
      enabled: true,
      id: 'hero-background',
      style: {
        background: { focalPoint: 'top-left', image: { alt: 'Preset image', kind: 'image' }, overlay: 'brand', type: 'image' },
      },
    },
  ],
)

assert.equal(resolvedBackgroundImage.background.focalPoint, 'bottom-right')
assert.equal(resolvedBackgroundImage.background.image.alt, 'Preset image')
assert.equal(resolvedBackgroundImage.background.overlay, 'dark')
assert.equal(resolvedBackgroundImage.background.type, 'image')
assert.equal(getBlockBackgroundPosition('bottom-right'), 'right bottom')
assert.equal(getBlockBackgroundPosition('middle'), 'center')
assert.equal(isDefaultBlockStyle({}), true)
assert.equal(isDefaultBlockStyle({ spacing: 'large' }), false)

console.log('Block style tests passed.')
