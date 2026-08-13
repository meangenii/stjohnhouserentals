import { BLOCK_ELEMENT_STYLE_TARGETS } from './blockContract.js'

const EMPTY_STYLE_TARGETS = Object.freeze([])

export function getBlockElementStyleTargets(type) {
  return BLOCK_ELEMENT_STYLE_TARGETS[String(type ?? '').trim()] ?? EMPTY_STYLE_TARGETS
}

export function getBlockElementStyleTargetIds(type) {
  return getBlockElementStyleTargets(type).map((target) => target.id)
}
