import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useSiteShellContent } from '../lib/useSiteContent'

function isActiveNavItem(pathname, matchPaths) {
  return matchPaths.some((matchPath) => pathname === matchPath || pathname.startsWith(`${matchPath}/`))
}

function isActiveChildItem(pathname, child) {
  return isActiveNavItem(pathname, child.matchPaths ?? [child.path])
}

function SiteMenu({ ariaLabel, items, pathname, navClassName = 'site-nav' }) {
  const [openMenuLabel, setOpenMenuLabel] = useState('')
  const navRef = useRef(null)

  useEffect(() => {
    if (!openMenuLabel) {
      return undefined
    }

    function handlePointerDown(event) {
      if (!navRef.current?.contains(event.target)) {
        setOpenMenuLabel('')
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        setOpenMenuLabel('')
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
    <nav aria-label={ariaLabel} className={navClassName} ref={navRef}>
      {items.map((item) => {
        const isActive = isActiveNavItem(pathname, item.matchPaths)

        if (item.children?.length) {
          const isOpen = openMenuLabel === item.label

          return (
            <div
              className={`site-nav-item ${isActive ? 'site-nav-item--active' : ''} ${isOpen ? 'site-nav-item--open' : ''}`.trim()}
              key={item.label}
              onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setOpenMenuLabel((currentLabel) => (currentLabel === item.label ? '' : currentLabel))
                }
              }}
              onFocusCapture={() => setOpenMenuLabel(item.label)}
              onMouseEnter={() => setOpenMenuLabel(item.label)}
              onMouseLeave={() => setOpenMenuLabel((currentLabel) => (currentLabel === item.label ? '' : currentLabel))}
            >
              <button
                aria-expanded={isOpen}
                aria-haspopup="true"
                className="site-nav-link site-nav-toggle"
                type="button"
                onClick={() => setOpenMenuLabel((currentLabel) => (currentLabel === item.label ? '' : item.label))}
              >
                {item.label}
              </button>

              <div aria-label={`${item.label} submenu`} className="site-subnav" role="menu">
                {item.children.map((child) => (
                  <Link
                    className={`site-subnav-link ${isActiveChildItem(pathname, child) ? 'active' : ''}`.trim()}
                    key={child.path}
                    role="menuitem"
                    to={child.path}
                    onClick={() => setOpenMenuLabel('')}
                  >
                    {child.label}
                  </Link>
                ))}
              </div>
            </div>
          )
        }

        return (
          <Link
            className={`site-nav-link ${isActive ? 'active' : ''}`.trim()}
            key={item.path}
            to={item.path}
            onClick={() => setOpenMenuLabel('')}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

export function SiteLayout() {
  const location = useLocation()
  const siteShell = useSiteShellContent()
  const siteNavItems = siteShell.header.primaryNav
  const footerNavItems = siteShell.footer.primaryNav
  const footerMetaItems = siteShell.footer.legalNav
  const logo = siteShell.header.logo
  const utility = siteShell.header.utility

  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="utility-bar">
          <div className="utility-inner">
            <div className="utility-social">
              <a
                className="utility-social-link"
                href={utility.socialLink.href}
                rel="noreferrer noopener"
                target="_blank"
              >
                <span aria-hidden="true" className="utility-facebook">
                  f
                </span>
                <span>{utility.socialLink.label}</span>
              </a>
            </div>

            <p className="utility-message">{utility.message}</p>

            <div className="utility-booking">
              {utility.bookingCallouts.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="masthead">
          <div className="masthead-inner">
            <Link aria-label="St. John House Rentals home" className="site-logo-link" to="/">
              <img alt={logo.alt} className="site-logo" src={logo.src} />
            </Link>

            <div className="masthead-nav">
              <a className="content-jump-link" href="#main-content">
                Skip to Main Content
              </a>

              <SiteMenu ariaLabel="Primary" items={siteNavItems} key={`primary-${location.pathname}`} pathname={location.pathname} />
            </div>
          </div>
        </div>
      </header>

      <main className="site-main" id="main-content">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="footer-top">
          <div className="footer-top-inner">
            <Link aria-label="St. John House Rentals home" className="footer-logo-link" to="/">
              <img alt={logo.alt} className="footer-logo" src={logo.src} />
            </Link>

            <div className="footer-nav-group">
              <SiteMenu
                ariaLabel="Footer"
                items={footerNavItems}
                key={`footer-${location.pathname}`}
                navClassName="site-nav footer-nav"
                pathname={location.pathname}
              />

              <nav aria-label="Footer legal" className="footer-meta-nav">
                {footerMetaItems.map((item) => (
                  <Link
                    className={isActiveNavItem(location.pathname, item.matchPaths) ? 'active' : ''}
                    key={`footer-meta-${item.path}`}
                    to={item.path}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="footer-bottom-inner">
            <p className="footer-copyright">{siteShell.footer.copyright}</p>
            <p className="footer-design">{siteShell.footer.designCredit}</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
