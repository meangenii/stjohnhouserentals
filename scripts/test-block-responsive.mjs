import assert from 'node:assert/strict'
import {
  DEFAULT_ROW_MOBILE_COLUMNS,
  getBlockVisibilityClassNames,
  getRowMobileColumnOrder,
  getRowMobileColumnsMode,
  isBlockVisibleOnDevice,
  normalizeBlockPreviewDevice,
  normalizeBlockVisibility,
  normalizeRowResponsive,
  setBlockDeviceVisibility,
  setRowMobileColumnOrder,
  setRowMobileColumns,
} from '../src/lib/blockResponsive.js'

assert.equal(normalizeBlockPreviewDevice('mobile'), 'mobile')
assert.equal(normalizeBlockPreviewDevice('tablet'), 'tablet')
assert.equal(normalizeBlockPreviewDevice('wide'), 'desktop')

assert.deepEqual(normalizeBlockVisibility(null), {
  hideOnDesktop: false,
  hideOnTablet: false,
  hideOnMobile: false,
})

const mobileHiddenBlock = {
  id: 'mobile-hidden',
  type: 'rich-text',
  visibility: { hideOnMobile: true },
}

assert.equal(isBlockVisibleOnDevice(mobileHiddenBlock, 'desktop'), true)
assert.equal(isBlockVisibleOnDevice(mobileHiddenBlock, 'mobile'), false)
assert.deepEqual(getBlockVisibilityClassNames(mobileHiddenBlock), ['block-page-block--hidden-mobile'])

const desktopHiddenVisibility = setBlockDeviceVisibility(mobileHiddenBlock.visibility, 'desktop', false)
assert.equal(desktopHiddenVisibility.hideOnDesktop, true)
assert.equal(desktopHiddenVisibility.hideOnTablet, false)
assert.equal(desktopHiddenVisibility.hideOnMobile, true)

const desktopVisibleVisibility = setBlockDeviceVisibility(desktopHiddenVisibility, 'desktop', true)
assert.equal(desktopVisibleVisibility.hideOnDesktop, false)
assert.equal(desktopVisibleVisibility.hideOnMobile, true)

const tabletHiddenVisibility = setBlockDeviceVisibility(desktopVisibleVisibility, 'tablet', false)
assert.equal(tabletHiddenVisibility.hideOnTablet, true)
assert.equal(isBlockVisibleOnDevice({ visibility: tabletHiddenVisibility }, 'tablet'), false)

assert.equal(getRowMobileColumnsMode({ responsive: { mobileColumns: 'preserve' } }), 'preserve')
assert.equal(getRowMobileColumnsMode({ responsive: { mobileColumns: 'collapse' } }), DEFAULT_ROW_MOBILE_COLUMNS)
assert.deepEqual(normalizeRowResponsive({}), { mobileColumnOrder: [], mobileColumns: DEFAULT_ROW_MOBILE_COLUMNS })
assert.deepEqual(setRowMobileColumns({ custom: true }, 'preserve'), { custom: true, mobileColumns: 'preserve' })

const orderedRow = {
  columns: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
  responsive: { mobileColumnOrder: ['c', 'a'] },
}
assert.deepEqual(getRowMobileColumnOrder(orderedRow), ['c', 'a', 'b'])
assert.deepEqual(setRowMobileColumnOrder({}, ['b', 'a', 'b']), { mobileColumnOrder: ['b', 'a'] })

console.log('Block responsive tests passed.')
