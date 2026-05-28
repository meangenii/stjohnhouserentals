import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import logo from '../content/site_logo.png'

const siteNavItems = [
  { label: 'HOME', path: '/', matchPaths: ['/'] },
  { label: 'ABOUT', path: '/about-us', matchPaths: ['/about-us'] },
  {
    label: 'HOUSES',
    path: '/st-john-rentals',
    matchPaths: ['/st-john-rentals', '/for-rent', '/for-sale', '/property-for-sale', '/rental-properties'],
    children: [
      { label: 'Rental Accommodations', path: '/for-rent', matchPaths: ['/for-rent'] },
      { label: 'Property For Sale', path: '/property-for-sale', matchPaths: ['/for-sale', '/property-for-sale'] },
    ],
  },
  {
    label: 'TRANSPORTATION',
    path: '/car-barge-information',
    matchPaths: ['/car-barge-information', '/passenger-ferry', '/ferrys', '/cars'],
    children: [
      {
        label: 'Car Barge Information',
        path: '/car-barge-information',
        matchPaths: ['/car-rental-ferry-boat-info', '/car-barge-information'],
      },
      { label: 'Passenger Ferry', path: '/passenger-ferry', matchPaths: ['/passenger-ferry', '/ferrys'] },
      { label: 'St John Car Rentals', path: '/cars', matchPaths: ['/cars'] },
    ],
  },
  {
    label: 'ACTIVITIES',
    path: '/map',
    matchPaths: ['/map', '/boats', '/charter-boat-rentals'],
    children: [
      { label: 'Charter Boats', path: '/boats', matchPaths: ['/boats', '/charter-boat-rentals'] },
      { label: 'Local Attractions', path: '/map', matchPaths: ['/map'] },
    ],
  },
  { label: 'ADVERTISE', path: '/advertise', matchPaths: ['/advertise'] },
]

const footerNavItems = siteNavItems
const footerMetaItems = [
  { label: 'PRIVACY POLICY', path: '/privacy-policy', matchPaths: ['/privacy-policy'] },
  { label: 'TERMS OF AGREEMENT', path: '/terms-of-agreement', matchPaths: ['/terms-of-agreement'] },
]

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
    setOpenMenuLabel('')
  }, [pathname])

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

  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="utility-bar">
          <div className="utility-inner">
            <div className="utility-social">
              <a
                className="utility-social-link"
                href="https://www.facebook.com/houserentalsVI/"
                rel="noreferrer noopener"
                target="_blank"
              >
                <span aria-hidden="true" className="utility-facebook">
                  f
                </span>
                <span>Stjohnhousesrentals</span>
              </a>
            </div>

            <p className="utility-message">Offering Rentals Since 1999</p>

            <div className="utility-booking">
              <span>Book Directly</span>
              <span>NO VRBO or AIRBnB Fees</span>
            </div>
          </div>
        </div>

        <div className="masthead">
          <div className="masthead-inner">
            <Link aria-label="St. John House Rentals home" className="site-logo-link" to="/">
              <img alt="St. John House Rentals" className="site-logo" src={logo} />
            </Link>

            <div className="masthead-nav">
              <a className="content-jump-link" href="#main-content">
                Skip to Main Content
              </a>

              <SiteMenu ariaLabel="Primary" items={siteNavItems} pathname={location.pathname} />
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
              <img alt="St. John House Rentals" className="footer-logo" src={logo} />
            </Link>

            <div className="footer-nav-group">
              <SiteMenu ariaLabel="Footer" items={footerNavItems} navClassName="site-nav footer-nav" pathname={location.pathname} />

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
            <p className="footer-copyright">Copyright {'\u00A9'} 2026 St John Houses Rentals</p>
            <p className="footer-design">Design By S9 Consulting</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
