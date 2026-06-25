import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useSiteShellContent } from '../lib/useSiteContent'
import { RichTextValue } from './RichTextValue'

function isActiveNavItem(pathname, matchPaths) {
  return (Array.isArray(matchPaths) ? matchPaths : []).some(
    (matchPath) => pathname === matchPath || pathname.startsWith(`${matchPath}/`),
  )
}

function isActiveChildItem(pathname, child) {
  return isActiveNavItem(pathname, child.matchPaths ?? [child.path])
}

function buildNavItemId(baseId, itemIndex, suffix) {
  return `${baseId}-${itemIndex}-${suffix}`
}

function NavText({ children, className, interactive, to, ...rest }) {
  if (interactive) {
    return (
      <Link className={className} to={to} {...rest}>
        {children}
      </Link>
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
  const navRef = useRef(null)
  const isCollapsible = responsive && interactive
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

        if (item.children?.length) {
          if (!interactive) {
            return (
              <span className={`site-nav-link site-link--static ${isActive ? 'active' : ''}`.trim()} key={item.label}>
                <RichTextValue value={item.label} />
              </span>
            )
          }

          const isOpen = openMenuLabel === item.label
          const toggleId = buildNavItemId(navBaseId, itemIndex, 'toggle')
          const submenuId = buildNavItemId(navBaseId, itemIndex, 'submenu')

          return (
            <div
              className={`site-nav-item ${isActive ? 'site-nav-item--active' : ''} ${isOpen ? 'site-nav-item--open' : ''}`.trim()}
              key={item.label}
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
              <button
                aria-controls={submenuId}
                aria-expanded={isOpen}
                className="site-nav-link site-nav-toggle"
                id={toggleId}
                type="button"
                onClick={() => setCurrentOpenMenuLabel((currentLabel) => (currentLabel === item.label ? '' : item.label))}
              >
                <RichTextValue as="span" value={item.label} />
                <span aria-hidden="true" className="site-nav-caret">
                  {isOpen ? '-' : '+'}
                </span>
              </button>

              <div
                aria-labelledby={toggleId}
                className="site-subnav"
                hidden={!isOpen}
                id={submenuId}
              >
                {item.children.map((child) => (
                  <NavText
                    aria-current={isActiveChildItem(pathname, child) ? 'page' : undefined}
                    className={`site-subnav-link ${isActiveChildItem(pathname, child) ? 'active' : ''}`.trim()}
                    interactive={interactive}
                    key={child.path}
                    to={child.path}
                    onClick={() => {
                      setCurrentOpenMenuLabel('')
                      onNavigate?.()
                    }}
                  >
                    <RichTextValue value={child.label} />
                  </NavText>
                ))}
              </div>
            </div>
          )
        }

        return (
          <NavText
            aria-current={isActive ? 'page' : undefined}
            className={`site-nav-link ${isActive ? 'active' : ''}`.trim()}
            interactive={interactive}
            key={item.path}
            to={item.path}
            onClick={() => {
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
  const [mobileMenuState, setMobileMenuState] = useState({ open: false, pathname })
  const mobileNavRef = useRef(null)
  const header = siteShell?.header ?? {}
  const footer = siteShell?.footer ?? {}
  const siteNavItems = Array.isArray(header.primaryNav) ? header.primaryNav : []
  const footerNavItems = Array.isArray(footer.primaryNav) ? footer.primaryNav : []
  const footerMetaItems = Array.isArray(footer.legalNav) ? footer.legalNav : []
  const logo = header.logo ?? {}
  const utility = header.utility ?? {}
  const socialLink = utility.socialLink ?? {}
  const bookingCallouts = Array.isArray(utility.bookingCallouts) ? utility.bookingCallouts : []
  const isMobileMenuOpen = mobileMenuState.pathname === pathname && mobileMenuState.open

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
    <div className="site-shell">
      <header className="site-header">
        <div className="utility-bar">
          <div className="utility-inner">
            <div className="utility-social">
              {interactive && socialLink.href ? (
                <a
                  className="utility-social-link"
                  href={socialLink.href}
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  <span aria-hidden="true" className="utility-facebook">
                    f
                  </span>
                  <RichTextValue as="span" value={socialLink.label} />
                </a>
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
                {footerMetaItems.map((item) => (
                  <NavText
                    aria-current={isActiveNavItem(pathname, item.matchPaths) ? 'page' : undefined}
                    className={isActiveNavItem(pathname, item.matchPaths) ? 'active' : ''}
                    interactive={interactive}
                    key={`footer-meta-${item.path}`}
                    to={item.path}
                  >
                    <RichTextValue value={item.label} />
                  </NavText>
                ))}
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
    </div>
  )
}

export function SiteLayout() {
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
      <Outlet />
    </SiteFrame>
  )
}
