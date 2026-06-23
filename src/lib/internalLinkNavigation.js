function isModifiedClick(event) {
  return event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey
}

export function getInternalNavigationTarget(anchor) {
  if (!(anchor instanceof HTMLAnchorElement)) {
    return ''
  }

  if (anchor.hasAttribute('download')) {
    return ''
  }

  const target = String(anchor.getAttribute('target') ?? '').trim()

  if (target && target.toLowerCase() !== '_self') {
    return ''
  }

  const href = String(anchor.getAttribute('href') ?? '').trim()

  if (!href || /^(mailto:|tel:|javascript:)/i.test(href)) {
    return ''
  }

  try {
    const url = new URL(href, window.location.origin)

    if (url.origin !== window.location.origin) {
      return ''
    }

    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return ''
  }
}

export function findInternalNavigationTarget(event) {
  if (event.defaultPrevented || isModifiedClick(event)) {
    return ''
  }

  const target = event.target

  if (!(target instanceof Element)) {
    return ''
  }

  const anchor = target.closest('a[href]')

  return anchor instanceof HTMLAnchorElement ? getInternalNavigationTarget(anchor) : ''
}
