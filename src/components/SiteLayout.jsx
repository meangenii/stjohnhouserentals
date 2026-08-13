import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Link, useLocation } from '../lib/router'
import { resolveLinkRenderConfig } from '../lib/linkRecords'
import { getSiteThemeCssProperties, getSiteThemeRuleOverrideCssText } from '../lib/siteThemeSettings'
import { useAdminSession } from '../lib/useAdminSession'
import { useSiteShellContent } from '../lib/useSiteContent'
import { AdminEditPageButton } from './AdminEditPageButton'
import { BackToTopButton } from './BackToTopButton'
import { RichTextValue } from './RichTextValue'

const ADMIN_NAV_ITEM = { label: 'Editor', path: '/admin', matchPaths: ['/admin'] }
const DESKTOP_NAV_MEDIA_QUERY = '(min-width: 900px)'
const LOCAL_ATTRACTIONS_NAV_ITEMS = [
  { label: 'Beaches', path: '/map#island-map', matchPaths: ['/map'] },
  { label: 'Restaurants', path: '/map#dining-guide', matchPaths: ['/map'] },
]

function getMediaQueryMatches(query, fallback = false) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return fallback
  }

  return window.matchMedia(query).matches
}

function isActiveNavItem(pathname, matchPaths) {
  return (Array.isArray(matchPaths) ? matchPaths : []).some(
    (matchPath) => pathname === matchPath || pathname.startsWith(`${matchPath}/`),
  )
}

function isActiveChildItem(pathname, child) {
  return isActiveNavItem(pathname, child.matchPaths ?? [child.path])
}

function readHashTarget(hash) {
  if (!hash) {
    return ''
  }

  try {
    return decodeURIComponent(hash.replace(/^#/, '').trim())
  } catch {
    return hash.replace(/^#/, '').trim()
  }
}

function normalizeNavPath(value = '') {
  const candidate = String(value ?? '').trim()

  if (!candidate) {
    return ''
  }

  const withoutOrigin = candidate.replace(/^(?:[a-z][a-z\d+\-.]*:)?\/\/[^/]+/i, '')
  const [rawPath = ''] = withoutOrigin.split(/[?#]/, 1)
  const normalizedPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`

  return normalizedPath === '/' ? '/' : normalizedPath.replace(/\/+$/, '') || '/'
}

function isLocalAttractionsNavItem(item) {
  return String(item?.label ?? '').trim().toLowerCase() === 'local attractions' && normalizeNavPath(item?.path || item?.href) === '/map'
}

function expandLocalAttractionsNavItems(items = []) {
  return (Array.isArray(items) ? items : []).flatMap((item) => {
    if (isLocalAttractionsNavItem(item)) {
      return LOCAL_ATTRACTIONS_NAV_ITEMS
    }

    if (Array.isArray(item?.children) && item.children.length > 0) {
      return [
        {
          ...item,
          children: expandLocalAttractionsNavItems(item.children),
        },
      ]
    }

    return [item]
  })
}

function scrollCurrentPageHashLink(destination = '') {
  if (typeof window === 'undefined') {
    return
  }

  const normalizedDestination = String(destination ?? '').trim()

  if (!normalizedDestination.includes('#')) {
    return
  }

  const destinationUrl = new URL(normalizedDestination, window.location.origin)

  if (destinationUrl.pathname !== window.location.pathname || destinationUrl.search !== window.location.search) {
    return
  }

  const hashTarget = readHashTarget(destinationUrl.hash)

  if (!hashTarget) {
    return
  }

  window.requestAnimationFrame(() => {
    document.getElementById(hashTarget)?.scrollIntoView({ block: 'start', behavior: 'auto' })
  })
}

function buildNavItemId(baseId, itemIndex, suffix) {
  return `${baseId}-${itemIndex}-${suffix}`
}

function NavText({ children, className, href = '', interactive, rel, target, to = '', ...rest }) {
  if (interactive && to) {
    return (
      <Link className={className} to={to} {...rest}>
        {children}
      </Link>
    )
  }

  if (interactive && href) {
    return (
      <a className={className} href={href} rel={rel} target={target} {...rest}>
        {children}
      </a>
    )
  }

  return (
    <span className={`${className} site-link--static`.trim()} {...rest}>
      {children}
    </span>
  )
}

function SiteMenu({
  ariaLabel,
  interactive = true,
  isExpanded = true,
  items,
  navId,
  navClassName = 'site-nav',
  onNavigate,
  pathname,
  responsive = false,
}) {
  const navItems = Array.isArray(items) ? items.filter(Boolean) : []
  const menuStateScope = `${pathname}|${responsive ? (isExpanded ? 'expanded' : 'collapsed') : 'static'}`
  const [openMenuState, setOpenMenuState] = useState({ label: '', scope: menuStateScope })
  const [isDesktopNavigation, setIsDesktopNavigation] = useState(() => getMediaQueryMatches(DESKTOP_NAV_MEDIA_QUERY, true))
  const navRef = useRef(null)
  const isCollapsible = responsive && interactive && !isDesktopNavigation
  const openMenuLabel = openMenuState.scope === menuStateScope ? openMenuState.label : ''
  const navBaseId = navId || `${String(ariaLabel ?? 'site-navigation').toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'site-navigation'}-group`

  function setCurrentOpenMenuLabel(nextValue) {
    setOpenMenuState((currentState) => ({
      scope: menuStateScope,
      label:
        typeof nextValue === 'function'
          ? nextValue(currentState.scope === menuStateScope ? currentState.label : '')
          : nextValue,
    }))
  }

  const closeOpenMenu = useEffectEvent(() => {
    setCurrentOpenMenuLabel('')
  })

  useEffect(() => {
    if (!responsive || !interactive) {
      return undefined
    }

    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined
    }

    const mediaQueryList = window.matchMedia(DESKTOP_NAV_MEDIA_QUERY)

    function handleViewportChange(event) {
      setIsDesktopNavigation(event.matches)
    }

    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', handleViewportChange)
      return () => mediaQueryList.removeEventListener('change', handleViewportChange)
    }

    mediaQueryList.addListener(handleViewportChange)
    return () => mediaQueryList.removeListener(handleViewportChange)
  }, [interactive, responsive])

  useEffect(() => {
    if (!openMenuLabel) {
      return undefined
    }

    function handlePointerDown(event) {
      if (!navRef.current?.contains(event.target)) {
        closeOpenMenu()
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        closeOpenMenu()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [openMenuLabel])

  return (
    <nav
      aria-label={ariaLabel}
      className={`${navClassName}${isCollapsible && isExpanded ? ' site-nav--open' : ''}`.trim()}
      id={navId}
      ref={navRef}
    >
      {navItems.map((item, itemIndex) => {
        const isActive = isActiveNavItem(pathname, item.matchPaths ?? [item.path])
        const itemLink = resolveLinkRenderConfig(item, { defaultType: 'internal', destinationField: 'path' })
        const hasItemDestination = Boolean(itemLink.isInternal ? itemLink.to : itemLink.href)

        if (item.children?.length) {
          if (!interactive) {
            return (
              <span className={`site-nav-link site-link--static ${isActive ? 'active' : ''}`.trim()} key={item.label}>
                <RichTextValue value={item.label} />
              </span>
            )
          }

          const isOpen = openMenuLabel === item.label
          const shouldSplitParentControls = hasItemDestination && !isCollapsible
          const labelId = buildNavItemId(navBaseId, itemIndex, 'label')
          const toggleId = buildNavItemId(navBaseId, itemIndex, 'toggle')
          const submenuId = buildNavItemId(navBaseId, itemIndex, 'submenu')

          return (
            <div
              className={`site-nav-item ${isActive ? 'site-nav-item--active' : ''} ${isOpen ? 'site-nav-item--open' : ''}`.trim()}
              key={item.path || item.href || item.label}
              onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setCurrentOpenMenuLabel((currentLabel) => (currentLabel === item.label ? '' : currentLabel))
                }
              }}
              onFocusCapture={() => {
                if (!isCollapsible) {
                  setCurrentOpenMenuLabel(item.label)
                }
              }}
              onMouseEnter={() => {
                if (!isCollapsible) {
                  setCurrentOpenMenuLabel(item.label)
                }
              }}
              onMouseLeave={() => {
                if (!isCollapsible) {
                  setCurrentOpenMenuLabel((currentLabel) => (currentLabel === item.label ? '' : currentLabel))
                }
              }}
            >
              {shouldSplitParentControls ? (
                <div className="site-nav-parent-link-row">
                  <NavText
                    aria-current={isActive ? 'page' : undefined}
                    className={`site-nav-link ${isActive ? 'active' : ''}`.trim()}
                    href={itemLink.href}
                    id={labelId}
                    interactive={interactive}
                    rel={itemLink.rel}
                    target={itemLink.target}
                    to={itemLink.to}
                    onClick={() => {
                      scrollCurrentPageHashLink(itemLink.to || itemLink.href)
                      setCurrentOpenMenuLabel('')
                      onNavigate?.()
                    }}
                  >
                    <RichTextValue as="span" value={item.label} />
                  </NavText>
                </div>
              ) : (
                <button
                  aria-controls={submenuId}
                  aria-expanded={isOpen}
                  className="site-nav-link site-nav-toggle"
                  id={toggleId}
                  type="button"
                  onClick={() => setCurrentOpenMenuLabel((currentLabel) => (currentLabel === item.label ? '' : item.label))}
                >
                  <RichTextValue as="span" value={item.label} />
                </button>
              )}

              <div
                aria-labelledby={shouldSplitParentControls ? labelId : toggleId}
                className="site-subnav"
                hidden={!isOpen}
                id={submenuId}
              >
                {item.children.map((child) => {
                  const childLink = resolveLinkRenderConfig(child, { defaultType: 'internal', destinationField: 'path' })

                  return (
                    <NavText
                      aria-current={isActiveChildItem(pathname, child) ? 'page' : undefined}
                      className={`site-subnav-link ${isActiveChildItem(pathname, child) ? 'active' : ''}`.trim()}
                      href={childLink.href}
                      interactive={interactive}
                      key={child.path || child.href || child.label}
                      rel={childLink.rel}
                      target={childLink.target}
                      to={childLink.to}
                      onClick={() => {
                        scrollCurrentPageHashLink(childLink.to || childLink.href)
                        setCurrentOpenMenuLabel('')
                        onNavigate?.()
                      }}
                    >
                      <RichTextValue value={child.label} />
                    </NavText>
                  )
                })}
              </div>
            </div>
          )
        }

        const directItemLink = resolveLinkRenderConfig(item, { defaultType: 'internal', destinationField: 'path' })

        return (
          <NavText
            aria-current={isActive ? 'page' : undefined}
            className={`site-nav-link ${isActive ? 'active' : ''}`.trim()}
            href={directItemLink.href}
            interactive={interactive}
            key={item.path || item.href || item.label}
            rel={directItemLink.rel}
            target={directItemLink.target}
            to={directItemLink.to}
            onClick={() => {
              scrollCurrentPageHashLink(directItemLink.to || directItemLink.href)
              setCurrentOpenMenuLabel('')
              onNavigate?.()
            }}
          >
            <RichTextValue value={item.label} />
          </NavText>
        )
      })}
    </nav>
  )
}

export function SiteFrame({ children, interactive = true, pathname, siteShell }) {
  const { isAdmin } = useAdminSession()
  const [mobileMenuState, setMobileMenuState] = useState({ open: false, pathname })
  const mobileNavRef = useRef(null)
  const header = siteShell?.header ?? {}
  const footer = siteShell?.footer ?? {}
  const baseNavItems = expandLocalAttractionsNavItems(header.primaryNav)
  const siteNavItems = interactive && isAdmin ? [...baseNavItems, ADMIN_NAV_ITEM] : baseNavItems
  const footerNavItems = expandLocalAttractionsNavItems(footer.primaryNav)
  const footerMetaItems = Array.isArray(footer.legalNav) ? footer.legalNav : []
  const logo = header.logo ?? {}
  const utility = header.utility ?? {}
  const socialLink = utility.socialLink ?? {}
  const bookingCallouts = Array.isArray(utility.bookingCallouts) ? utility.bookingCallouts : []
  const isMobileMenuOpen = mobileMenuState.pathname === pathname && mobileMenuState.open
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/')
  const socialLinkConfig = resolveLinkRenderConfig(socialLink, { defaultType: 'external', destinationField: 'href' })
  const themeStyle = getSiteThemeCssProperties(siteShell?.theme)
  const themeRuleOverrideCss = getSiteThemeRuleOverrideCssText(siteShell?.theme)

  function setCurrentMobileMenuOpen(nextValue) {
    setMobileMenuState((currentState) => ({
      pathname,
      open:
        typeof nextValue === 'function'
          ? nextValue(currentState.pathname === pathname ? currentState.open : false)
          : nextValue,
    }))
  }

  const closeMobileMenu = useEffectEvent(() => {
    setCurrentMobileMenuOpen(false)
  })

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return undefined
    }

    function handlePointerDown(event) {
      if (!mobileNavRef.current?.contains(event.target)) {
        closeMobileMenu()
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        closeMobileMenu()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isMobileMenuOpen])

  return (
    <div className="site-shell" style={themeStyle}>
      {themeRuleOverrideCss ? <style>{themeRuleOverrideCss}</style> : null}
      <header className="site-header">
        <div className="utility-bar">
          <div className="utility-inner">
            <div className="utility-social">
              {interactive && socialLinkConfig.destination ? (
                socialLinkConfig.isInternal ? (
                  <Link className="utility-social-link" to={socialLinkConfig.to}>
                    <span aria-hidden="true" className="utility-facebook">
                      f
                    </span>
                    <RichTextValue as="span" value={socialLink.label} />
                  </Link>
                ) : (
                  <a
                    className="utility-social-link"
                    href={socialLinkConfig.href}
                    rel={socialLinkConfig.rel}
                    target={socialLinkConfig.target}
                  >
                    <span aria-hidden="true" className="utility-facebook">
                      f
                    </span>
                    <RichTextValue as="span" value={socialLink.label} />
                  </a>
                )
              ) : (
                <span className="utility-social-link site-link--static">
                  <span aria-hidden="true" className="utility-facebook">
                    f
                  </span>
                  <RichTextValue as="span" value={socialLink.label} />
                </span>
              )}
            </div>

            <RichTextValue as="p" className="utility-message" value={utility.message} />

            <div className="utility-booking">
              {bookingCallouts.map((line) => (
                <RichTextValue as="span" key={line} value={line} />
              ))}
            </div>
          </div>
        </div>

        <div className="masthead">
          <div className="masthead-inner">
            <NavText aria-label="St. John House Rentals home" className="site-logo-link" interactive={interactive} to="/">
              <img alt={logo.alt} className="site-logo" src={logo.src} />
            </NavText>

            <div className={`masthead-nav${isMobileMenuOpen ? ' masthead-nav--open' : ''}`.trim()} ref={mobileNavRef}>
              {interactive ? (
                <a className="content-jump-link" href="#main-content">
                  Skip to Main Content
                </a>
              ) : null}

              {interactive ? (
                <button
                  aria-controls="site-primary-navigation"
                  aria-expanded={isMobileMenuOpen}
                  aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                  className={`site-menu-button${isMobileMenuOpen ? ' site-menu-button--open' : ''}`.trim()}
                  type="button"
                  onClick={() => setCurrentMobileMenuOpen((currentValue) => !currentValue)}
                >
                  <span className="site-menu-button-bar" />
                  <span className="site-menu-button-bar" />
                  <span className="site-menu-button-bar" />
                </button>
              ) : null}

              <SiteMenu
                ariaLabel="Primary"
                interactive={interactive}
                isExpanded={isMobileMenuOpen}
                items={siteNavItems}
                key={`primary-${pathname}-${isMobileMenuOpen ? 'open' : 'closed'}`}
                navId="site-primary-navigation"
                navClassName="site-nav site-nav--primary"
                onNavigate={() => setCurrentMobileMenuOpen(false)}
                pathname={pathname}
                responsive
              />
            </div>
          </div>
        </div>
      </header>

      <main className="site-main" id="main-content" tabIndex={-1}>
        {children}
      </main>

      <footer className="site-footer">
        <div className="footer-top">
          <div className="footer-top-inner">
            <NavText aria-label="St. John House Rentals home" className="footer-logo-link" interactive={interactive} to="/">
              <img alt={logo.alt} className="footer-logo" src={logo.src} />
            </NavText>

            <div className="footer-nav-group">
              <SiteMenu
                ariaLabel="Footer"
                items={footerNavItems}
                interactive={interactive}
                isExpanded
                key={`footer-${pathname}`}
                navClassName="site-nav footer-nav"
                pathname={pathname}
              />

              <nav aria-label="Footer legal" className="footer-meta-nav">
                {footerMetaItems.map((item) => {
                  const footerLink = resolveLinkRenderConfig(item, { defaultType: 'internal', destinationField: 'path' })

                  return (
                    <NavText
                      aria-current={isActiveNavItem(pathname, item.matchPaths) ? 'page' : undefined}
                      className={isActiveNavItem(pathname, item.matchPaths) ? 'active' : ''}
                      href={footerLink.href}
                      interactive={interactive}
                      key={`footer-meta-${item.path || item.href || item.label}`}
                      rel={footerLink.rel}
                      target={footerLink.target}
                      to={footerLink.to}
                    >
                      <RichTextValue value={item.label} />
                    </NavText>
                  )
                })}
              </nav>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="footer-bottom-inner">
            <RichTextValue as="p" className="footer-copyright" value={footer.copyright} />
            <RichTextValue as="p" className="footer-design" value={footer.designCredit} />
          </div>
        </div>
      </footer>

      {interactive && !isAdminRoute ? <BackToTopButton /> : null}
      {interactive && !isAdminRoute && isAdmin ? <AdminEditPageButton /> : null}
    </div>
  )
}

export function SiteLayout({ children }) {
  const location = useLocation()
  const siteShell = useSiteShellContent()

  if (!siteShell) {
    return (
      <section className="page-section property-page property-page--status">
        <h1>Loading site...</h1>
      </section>
    )
  }

  return (
    <SiteFrame pathname={location.pathname} siteShell={siteShell}>
      {children}
    </SiteFrame>
  )
}
