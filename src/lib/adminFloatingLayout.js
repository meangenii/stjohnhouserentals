export const ADMIN_FLOATING_STACK_GAP_PX = 14
export const ADMIN_FLOATING_SAVE_STACK_OFFSET_VAR = '--admin-floating-save-stack-offset'
export const ADMIN_FLOATING_PREVIEW_STACK_OFFSET_VAR = '--admin-floating-preview-stack-offset'

function getRootStyle() {
  if (typeof document === 'undefined') {
    return null
  }

  return document.documentElement?.style ?? null
}

export function setAdminFloatingStackOffset(variableName, offsetPx = 0) {
  const rootStyle = getRootStyle()

  if (!rootStyle) {
    return
  }

  rootStyle.setProperty(variableName, `${Math.max(0, Number(offsetPx) || 0)}px`)
}

export function clearAdminFloatingStackOffset(variableName) {
  const rootStyle = getRootStyle()

  if (!rootStyle) {
    return
  }

  rootStyle.removeProperty(variableName)
}

export function observeAdminFloatingStackOffset(node, variableName, { gapPx = ADMIN_FLOATING_STACK_GAP_PX } = {}) {
  if (typeof window === 'undefined' || !node) {
    setAdminFloatingStackOffset(variableName, 0)

    return () => {
      setAdminFloatingStackOffset(variableName, 0)
    }
  }

  let animationFrameId = 0
  let resizeObserver = null

  function applyOffset() {
    const nodeHeight = node.offsetHeight || 0
    setAdminFloatingStackOffset(variableName, nodeHeight > 0 ? nodeHeight + gapPx : 0)
  }

  function scheduleOffsetUpdate() {
    if (animationFrameId) {
      window.cancelAnimationFrame(animationFrameId)
    }

    animationFrameId = window.requestAnimationFrame(applyOffset)
  }

  scheduleOffsetUpdate()
  window.addEventListener('resize', scheduleOffsetUpdate)

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(scheduleOffsetUpdate)
    resizeObserver.observe(node)
  }

  return () => {
    if (animationFrameId) {
      window.cancelAnimationFrame(animationFrameId)
    }

    window.removeEventListener('resize', scheduleOffsetUpdate)
    resizeObserver?.disconnect()
    setAdminFloatingStackOffset(variableName, 0)
  }
}
