/* eslint-disable react-refresh/only-export-components */
import { createContext, forwardRef, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const RouterContext = createContext(null)
const RouteParamsContext = createContext({})
const NAVIGATION_EVENT = 'genericcms:navigation'

function createLocationKey() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function readHistoryState() {
  if (typeof window === 'undefined') {
    return { key: 'static', state: null }
  }

  const historyState = window.history.state

  if (historyState && typeof historyState === 'object' && Object.prototype.hasOwnProperty.call(historyState, 'usr')) {
    return {
      key: String(historyState.key ?? 'default'),
      state: historyState.usr ?? null,
    }
  }

  return {
    key: String(historyState?.key ?? 'default'),
    state: historyState?.state ?? null,
  }
}

function readBrowserLocation() {
  if (typeof window === 'undefined') {
    return {
      hash: '',
      key: 'static',
      pathname: '/',
      search: '',
      state: null,
    }
  }

  const { key, state } = readHistoryState()

  return {
    hash: window.location.hash,
    key,
    pathname: window.location.pathname || '/',
    search: window.location.search,
    state,
  }
}

function createHref(to) {
  if (typeof to === 'string') {
    return to || '/'
  }

  if (to && typeof to === 'object') {
    const pathname = String(to.pathname ?? '')
    const search = String(to.search ?? '')
    const hash = String(to.hash ?? '')

    return `${pathname || '/'}${search && !search.startsWith('?') ? '?' : ''}${search}${hash && !hash.startsWith('#') ? '#' : ''}${hash}`
  }

  return '/'
}

function toInternalPath(href) {
  if (typeof window === 'undefined') {
    return href || '/'
  }

  const url = new URL(href || '/', window.location.href)

  return `${url.pathname}${url.search}${url.hash}`
}

function notifyNavigation() {
  window.dispatchEvent(new Event(NAVIGATION_EVENT))
}

function isModifiedClick(event) {
  return event.metaKey || event.altKey || event.ctrlKey || event.shiftKey
}

export function BrowserRouter({ children }) {
  const [location, setLocation] = useState(() => readBrowserLocation())

  useEffect(() => {
    function syncLocation() {
      setLocation(readBrowserLocation())
    }

    window.addEventListener('popstate', syncLocation)
    window.addEventListener(NAVIGATION_EVENT, syncLocation)

    return () => {
      window.removeEventListener('popstate', syncLocation)
      window.removeEventListener(NAVIGATION_EVENT, syncLocation)
    }
  }, [])

  const navigate = useCallback((to, options = {}) => {
    if (typeof window === 'undefined') {
      return
    }

    if (typeof to === 'number') {
      window.history.go(to)
      return
    }

    const href = createHref(to)
    const nextPath = toInternalPath(href)
    const nextState = {
      key: createLocationKey(),
      usr: options.state ?? null,
    }

    if (options.replace) {
      window.history.replaceState(nextState, '', nextPath)
    } else {
      window.history.pushState(nextState, '', nextPath)
    }

    notifyNavigation()
  }, [])

  const value = useMemo(() => ({ location, navigate }), [location, navigate])

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

export const Link = forwardRef(function Link(
  { children, download, onClick, reloadDocument = false, replace = false, state = null, target, to, ...rest },
  ref,
) {
  const navigate = useNavigate()
  const href = createHref(to)

  function handleClick(event) {
    onClick?.(event)

    if (
      event.defaultPrevented ||
      reloadDocument ||
      download ||
      target ||
      event.button !== 0 ||
      isModifiedClick(event) ||
      typeof window === 'undefined'
    ) {
      return
    }

    const url = new URL(href, window.location.href)

    if (url.origin !== window.location.origin) {
      return
    }

    event.preventDefault()
    navigate(`${url.pathname}${url.search}${url.hash}`, { replace, state })
  }

  return (
    <a {...rest} href={href} ref={ref} target={target} onClick={handleClick}>
      {children}
    </a>
  )
})

export function Navigate({ replace = false, state = null, to }) {
  const navigate = useNavigate()

  useEffect(() => {
    navigate(to, { replace, state })
  }, [navigate, replace, state, to])

  return null
}

export function RouteParamsProvider({ children, params = {} }) {
  const value = useMemo(() => params, [params])

  return <RouteParamsContext.Provider value={value}>{children}</RouteParamsContext.Provider>
}

export function useLocation() {
  const context = useContext(RouterContext)

  if (!context) {
    throw new Error('useLocation must be used inside BrowserRouter.')
  }

  return context.location
}

export function useNavigate() {
  const context = useContext(RouterContext)

  if (!context) {
    throw new Error('useNavigate must be used inside BrowserRouter.')
  }

  return context.navigate
}

export function useParams() {
  return useContext(RouteParamsContext)
}

export function useSearchParams() {
  const location = useLocation()
  const navigate = useNavigate()
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const setSearchParams = useCallback(
    (nextInit, options = {}) => {
      const nextSearchParams = new URLSearchParams(nextInit)
      const nextSearch = nextSearchParams.toString()
      const nextPath = `${location.pathname}${nextSearch ? `?${nextSearch}` : ''}${location.hash}`

      navigate(nextPath, {
        replace: options.replace,
        state: Object.prototype.hasOwnProperty.call(options, 'state') ? options.state : location.state,
      })
    },
    [location.hash, location.pathname, location.state, navigate],
  )

  return [searchParams, setSearchParams]
}
