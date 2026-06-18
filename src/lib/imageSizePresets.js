export const COMMON_WEB_IMAGE_SIZE_PRESETS = [
  { group: 'Responsive 16:9', key: 'wide-thumb-320x180', label: 'Wide Thumbnail', width: 320, height: 180 },
  { group: 'Responsive 16:9', key: 'wide-small-640x360', label: 'Small Wide', width: 640, height: 360 },
  { group: 'Responsive 16:9', key: 'wide-medium-960x540', label: 'Medium Wide', width: 960, height: 540 },
  { group: 'Responsive 16:9', key: 'wide-large-1280x720', label: 'Large Wide', width: 1280, height: 720 },
  { group: 'Responsive 16:9', key: 'wide-hero-1600x900', label: 'Wide Hero', width: 1600, height: 900 },
  { group: 'Responsive 16:9', key: 'full-hd-1920x1080', label: 'Full HD Hero', width: 1920, height: 1080 },
  { group: 'Cards 4:3', key: 'card-thumb-320x240', label: 'Card Thumbnail', width: 320, height: 240 },
  { group: 'Cards 4:3', key: 'card-small-640x480', label: 'Small Card', width: 640, height: 480 },
  { group: 'Cards 4:3', key: 'card-large-1024x768', label: 'Large Card', width: 1024, height: 768 },
  { group: 'Photo 3:2', key: 'photo-small-600x400', label: 'Small Photo', width: 600, height: 400 },
  { group: 'Photo 3:2', key: 'photo-card-900x600', label: 'Photo Card', width: 900, height: 600 },
  { group: 'Photo 3:2', key: 'photo-large-1200x800', label: 'Large Photo', width: 1200, height: 800 },
  { group: 'Squares', key: 'square-small-400x400', label: 'Small Square', width: 400, height: 400 },
  { group: 'Squares', key: 'square-medium-800x800', label: 'Medium Square', width: 800, height: 800 },
  { group: 'Squares', key: 'square-large-1200x1200', label: 'Large Square', width: 1200, height: 1200 },
  { group: 'Social / SEO', key: 'open-graph-1200x630', label: 'Open Graph', width: 1200, height: 630 },
  { group: 'Social / SEO', key: 'twitter-card-1200x675', label: 'Twitter / X Card', width: 1200, height: 675 },
  { group: 'Banners', key: 'content-banner-1440x560', label: 'Content Banner', width: 1440, height: 560 },
  { group: 'Banners', key: 'slim-banner-1920x640', label: 'Slim Hero Banner', width: 1920, height: 640 },
  { group: 'Portraits', key: 'portrait-card-600x900', label: 'Portrait Card', width: 600, height: 900 },
  { group: 'Portraits', key: 'portrait-large-900x1200', label: 'Large Portrait', width: 900, height: 1200 },
  { group: 'Display Ads', key: 'medium-rectangle-300x250', label: 'Medium Rectangle', width: 300, height: 250 },
  { group: 'Display Ads', key: 'leaderboard-728x90', label: 'Leaderboard', width: 728, height: 90 },
]

export function normalizeImageDimension(value) {
  const dimension = Number.parseInt(String(value ?? '').trim(), 10)

  return Number.isFinite(dimension) && dimension > 0 ? dimension : 0
}

export function getImageDimensions(image = {}, fallback = {}) {
  return {
    width: normalizeImageDimension(image?.width) || normalizeImageDimension(fallback.width),
    height: normalizeImageDimension(image?.height) || normalizeImageDimension(fallback.height),
  }
}

export function getOriginalImageDimensions(image = {}) {
  return {
    width: normalizeImageDimension(image?.originalWidth) || normalizeImageDimension(image?.naturalWidth),
    height: normalizeImageDimension(image?.originalHeight) || normalizeImageDimension(image?.naturalHeight),
  }
}

export function getImageSizePresetKey(image = {}) {
  const { width, height } = getImageDimensions(image)

  if (!width && !height) {
    return ''
  }

  return COMMON_WEB_IMAGE_SIZE_PRESETS.find((preset) => preset.width === width && preset.height === height)?.key ?? 'custom'
}
