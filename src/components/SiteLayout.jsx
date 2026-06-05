import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useSiteShellContent } from '../lib/useSiteContent'

function isActiveNavItem(pathname, matchPaths) {
  return matchPaths.some((matchPath) => pathname === matchPath || pathname.startsWith(`${matchPath}/`))
}

function isActiveChildItem(pathname, child) {
  return isActiveNavItem(pathname, child.matchPaths ?? [child.path])
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

function SiteMenu({ ariaLabel, interactive = true, items, pathname, navClassName = 'site-nav' }) {
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
          if (!interactive) {
            return (
              <span className={`site-nav-link site-link--static ${isActive ? 'active' : ''}`.trim()} key={item.label}>
                {item.label}
              </span>
            )
          }

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
                  <NavText
                    className={`site-subnav-link ${isActiveChildItem(pathname, child) ? 'active' : ''}`.trim()}
                    interactive={interactive}
                    key={child.path}
                    role="menuitem"
                    to={child.path}
                    onClick={() => setOpenMenuLabel('')}
                  >
                    {child.label}
                  </NavText>
                ))}
              </div>
            </div>
          )
        }

        return (
          <NavText
            className={`site-nav-link ${isActive ? 'active' : ''}`.trim()}
            interactive={interactive}
            key={item.path}
            to={item.path}
            onClick={() => setOpenMenuLabel('')}
          >
            {item.label}
          </NavText>
        )
      })}
    </nav>
  )
}

export function SiteFrame({ children, interactive = true, pathname, siteShell }) {
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
              {interactive ? (
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
              ) : (
                <span className="utility-social-link site-link--static">
                  <span aria-hidden="true" className="utility-facebook">
                    f
                  </span>
                  <span>{utility.socialLink.label}</span>
                </span>
              )}
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
            <NavText aria-label="St. John House Rentals home" className="site-logo-link" interactive={interactive} to="/">
              <img alt={logo.alt} className="site-logo" src={logo.src} />
            </NavText>

            <div className="masthead-nav">
              {interactive ? (
                <a className="content-jump-link" href="#main-content">
                  Skip to Main Content
                </a>
              ) : null}

              <SiteMenu ariaLabel="Primary" interactive={interactive} items={siteNavItems} key={`primary-${pathname}`} pathname={pathname} />
            </div>
          </div>
        </div>
      </header>

      <main className="site-main" id="main-content">
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
                key={`footer-${pathname}`}
                navClassName="site-nav footer-nav"
                pathname={pathname}
              />

              <nav aria-label="Footer legal" className="footer-meta-nav">
                {footerMetaItems.map((item) => (
                  <NavText
                    className={isActiveNavItem(pathname, item.matchPaths) ? 'active' : ''}
                    interactive={interactive}
                    key={`footer-meta-${item.path}`}
                    to={item.path}
                  >
                    {item.label}
                  </NavText>
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

export function SiteLayout() {
  const location = useLocation()
  const siteShell = useSiteShellContent()

  return (
    <SiteFrame pathname={location.pathname} siteShell={siteShell}>
      <Outlet />
    </SiteFrame>
  )
}
