import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { SiteLayout } from './components/SiteLayout'
import { AboutUsPage } from './pages/AboutUsPage'
import { AdvertisePage } from './pages/AdvertisePage'
import { ArtPage } from './pages/ArtPage'
import { BlogPage } from './pages/BlogPage'
import { CarBargeInformationPage } from './pages/CarBargeInformationPage'
import { CharterBoatDetailPage } from './pages/CharterBoatDetailPage'
import { CharterBoatsPage } from './pages/CharterBoatsPage'
import { HomePage } from './pages/HomePage'
import { HouseRentalsPage } from './pages/HouseRentalsPage'
import { JewelryPage } from './pages/JewelryPage'
import { LinksPage } from './pages/LinksPage'
import { LocalAttractionsPage } from './pages/LocalAttractionsPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PassengerFerryPage } from './pages/PassengerFerryPage'
import { PropertyDetailPage } from './pages/PropertyDetailPage'
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage'
import { PropertyForSalePage } from './pages/PropertyForSalePage'
import { RentalAccommodationsPage } from './pages/RentalAccommodationsPage'
import { StJohnBookPage } from './pages/StJohnBookPage'
import { StJohnCarRentalsPage } from './pages/StJohnCarRentalsPage'
import { TermsOfAgreementPage } from './pages/TermsOfAgreementPage'
import { DEFAULT_SITE_DESCRIPTION, SITE_TITLE, useDocumentMeta } from './lib/documentMeta'

const AdminPage = lazy(() =>
  import('./pages/AdminPage').then((module) => ({
    default: module.AdminPage,
  })),
)

function normalizeHashRoute() {
  if (typeof window === 'undefined') {
    return
  }

  const { hash, pathname, search } = window.location

  if (!hash.startsWith('#/')) {
    return
  }

  const nextPath = hash.slice(1)
  const currentPath = `${pathname}${search}`

  if (nextPath === currentPath) {
    return
  }

  window.history.replaceState(null, '', nextPath)
}

function getRouteTitle(pathname) {
  if (!pathname || pathname === '/') {
    return SITE_TITLE
  }

  if (pathname === '/about-us') {
    return 'About Us'
  }

  if (pathname === '/admin') {
    return 'Admin'
  }

  if (pathname === '/advertise') {
    return 'Advertise'
  }

  if (pathname === '/art') {
    return 'Art'
  }

  if (pathname === '/blog') {
    return 'Blog'
  }

  if (pathname === '/boats') {
    return 'Charter Boats'
  }

  if (pathname === '/car-barge-information' || pathname === '/car-rental-ferry-boat-info') {
    return 'Car Barge Information'
  }

  if (pathname === '/cars') {
    return 'St. John Car Rentals'
  }

  if (pathname === '/for-rent') {
    return 'Rental Accommodations'
  }

  if (pathname === '/for-sale' || pathname === '/property-for-sale') {
    return 'Property For Sale'
  }

  if (pathname === '/jewelry') {
    return 'Jewelry'
  }

  if (pathname === '/links') {
    return 'Links'
  }

  if (pathname === '/map') {
    return 'Local Attractions'
  }

  if (pathname === '/passenger-ferry' || pathname === '/ferrys') {
    return 'Passenger Ferry'
  }

  if (pathname === '/privacy-policy') {
    return 'Privacy Policy'
  }

  if (pathname === '/st-john-book') {
    return 'St. John Book'
  }

  if (pathname === '/st-john-rentals') {
    return 'St. John Rentals'
  }

  if (pathname === '/terms-of-agreement') {
    return 'Terms of Agreement'
  }

  if (pathname.startsWith('/charter-boat-rentals/')) {
    return 'Charter Boat'
  }

  if (pathname.startsWith('/rental-properties/') || pathname.startsWith('/1bedroom/')) {
    return 'Rental Property'
  }

  return 'Page Not Found'
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

function RouteEnhancements() {
  const location = useLocation()
  const routeTitle = getRouteTitle(location.pathname)

  useDocumentMeta({ title: routeTitle, description: DEFAULT_SITE_DESCRIPTION, priority: 0 })

  useEffect(() => {
    const hashTarget = readHashTarget(location.hash)

    if (hashTarget) {
      window.requestAnimationFrame(() => {
        const targetElement = document.getElementById(hashTarget)

        if (targetElement) {
          targetElement.scrollIntoView()

          if (targetElement instanceof HTMLElement) {
            if (targetElement.id === 'main-content' && !targetElement.hasAttribute('tabindex')) {
              targetElement.setAttribute('tabindex', '-1')
            }

            targetElement.focus({ preventScroll: true })
          }

          return
        }

        window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      })

      return
    }

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [location.hash, location.pathname, location.search])

  return null
}

function RouteLoadingFallback() {
  return (
    <section className="page-section property-page property-page--status">
      <h1>Loading page...</h1>
    </section>
  )
}

normalizeHashRoute()

function App() {
  return (
    <BrowserRouter>
      <RouteEnhancements />
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          <Route element={<SiteLayout />}>
            <Route index element={<HomePage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="about-us" element={<AboutUsPage />} />
            <Route path="st-john-rentals" element={<HouseRentalsPage />} />
            <Route path="1bedroom/:slug" element={<PropertyDetailPage />} />
            <Route path="for-rent" element={<RentalAccommodationsPage />} />
            <Route path="for-sale" element={<PropertyForSalePage />} />
            <Route path="property-for-sale" element={<PropertyForSalePage />} />
            <Route path="car-rental-ferry-boat-info" element={<CarBargeInformationPage />} />
            <Route path="car-barge-information" element={<CarBargeInformationPage />} />
            <Route path="passenger-ferry" element={<PassengerFerryPage />} />
            <Route path="ferrys" element={<PassengerFerryPage />} />
            <Route path="cars" element={<StJohnCarRentalsPage />} />
            <Route path="boats" element={<CharterBoatsPage />} />
            <Route path="map" element={<LocalAttractionsPage />} />
            <Route path="advertise" element={<AdvertisePage />} />
            <Route path="privacy-policy" element={<PrivacyPolicyPage />} />
            <Route path="terms-of-agreement" element={<TermsOfAgreementPage />} />
            <Route path="blog" element={<BlogPage />} />
            <Route path="jewelry" element={<JewelryPage />} />
            <Route path="links" element={<LinksPage />} />
            <Route path="st-john-book" element={<StJohnBookPage />} />
            <Route path="art" element={<ArtPage />} />
            <Route path="rental-properties/:slug" element={<PropertyDetailPage />} />
            <Route path="charter-boat-rentals/:slug" element={<CharterBoatDetailPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
