import aboutEssentialsPool from '../content/about_carved_door_pool.jpg'
import aboutHeroAnaberg from '../content/about_hero_anaberg.jpg'
import aboutStoryParrotfish from '../content/about_parrotfish.jpg'
import heroBeach from '../content/hero_beach.png'
import homeAboutPool from '../content/home_about_pool.jpg'
import homeDiscoverCollage from '../content/home_discover_collage.png'
import homeWhyChooseUs from '../content/home_why_choose_us.jpg'
import localAttractionsMap from '../content/map.png'
import siteLogo from '../content/site_logo.png'
import { buildWixImageUrl } from './wixImage'

const contentAssetRegistry = {
  aboutEssentialsPool,
  aboutHeroAnaberg,
  aboutStoryParrotfish,
  homeAboutPool,
  homeDiscoverCollage,
  homeHeroBeach: heroBeach,
  homeWhyChooseUs,
  localAttractionsMap,
  siteLogo,
}

function resolveContentImage(image) {
  if (!image || image.kind !== 'image') {
    return image
  }

  const src = image.assetId ? contentAssetRegistry[image.assetId] ?? '' : String(image.url ?? '').trim()

  return {
    ...image,
    src,
  }
}

export function resolveContentAssets(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => resolveContentAssets(entry))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  if (value.kind === 'image') {
    return resolveContentImage(value)
  }

  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, resolveContentAssets(entry)]))
}

export function getContentImageSrc(image, options = {}) {
  if (!image) {
    return ''
  }

  if (image.assetId) {
    return image.src || ''
  }

  if (image.url) {
    return buildWixImageUrl(image, options) || image.src || image.url
  }

  return image.src || ''
}

export function getRegisteredContentAsset(assetId) {
  return contentAssetRegistry[assetId] ?? ''
}
