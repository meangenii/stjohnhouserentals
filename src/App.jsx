import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { RouteErrorBoundary } from './components/RouteErrorBoundary'
import { SiteLayout } from './components/SiteLayout'
import { DEFAULT_SITE_DESCRIPTION, SITE_TITLE, useDocumentMeta } from './lib/documentMeta'
import { trackPageView } from './lib/analytics'
import {
  isApiBackedSiteContentSource,
  isRouteSiteContentPreloaded,
  preloadRouteSiteContent,
  resolvePageSummaryForPath,
} from './lib/siteContentRepository'
import { useStructuredPageContent } from './lib/useSiteContent'
import { buildCanonicalUrl, getCanonicalPath, getStaticSeoMeta } from '../shared/seoMetadata.js'

const DYNAMIC_PAGE_CONTENT_MODELS = new Set(['block-page', 'rich-content-page', 'legal-content-page'])

function lazyPage(importPage, exportName) {
  return lazy(() =>
    importPage().then((module) => ({
      default: module[exportName],
    })),
  )
}

const AboutUsPage = lazyPage(() => import('./pages/AboutUsPage'), 'AboutUsPage')
const AdminPage = lazyPage(() => import('./pages/AdminPage'), 'AdminPage')
const AdvertisePage = lazyPage(() => import('./pages/AdvertisePage'), 'AdvertisePage')
const ArtPage = lazyPage(() => import('./pages/ArtPage'), 'ArtPage')
const BlogPage = lazyPage(() => import('./pages/BlogPage'), 'BlogPage')
const CarBargeInformationPage = lazyPage(() => import('./pages/CarBargeInformationPage'), 'CarBargeInformationPage')
const CharterBoatDetailPage = lazyPage(() => import('./pages/CharterBoatDetailPage'), 'CharterBoatDetailPage')
const CharterBoatsPage = lazyPage(() => import('./pages/CharterBoatsPage'), 'CharterBoatsPage')
const HomePage = lazyPage(() => import('./pages/HomePage'), 'HomePage')
const JewelryPage = lazyPage(() => import('./pages/JewelryPage'), 'JewelryPage')
const LinksPage = lazyPage(() => import('./pages/LinksPage'), 'LinksPage')
const LocalAttractionsPage = lazyPage(() => import('./pages/LocalAttractionsPage'), 'LocalAttractionsPage')
const NotFoundPage = lazyPage(() => import('./pages/NotFoundPage'), 'NotFoundPage')
const PassengerFerryPage = lazyPage(() => import('./pages/PassengerFerryPage'), 'PassengerFerryPage')
const PrivacyPolicyPage = lazyPage(() => import('./pages/PrivacyPolicyPage'), 'PrivacyPolicyPage')
const PropertyDetailPage = lazyPage(() => import('./pages/PropertyDetailPage'), 'PropertyDetailPage')
const PropertyForSalePage = lazyPage(() => import('./pages/PropertyForSalePage'), 'PropertyForSalePage')
const RentalAccommodationsPage = lazyPage(() => import('./pages/RentalAccommodationsPage'), 'RentalAccommodationsPage')
const StJohnBookPage = lazyPage(() => import('./pages/StJohnBookPage'), 'StJohnBookPage')
const StJohnCarRentalsPage = lazyPage(() => import('./pages/StJohnCarRentalsPage'), 'StJohnCarRentalsPage')
const TermsOfAgreementPage = lazyPage(() => import('./pages/TermsOfAgreementPage'), 'TermsOfAgreementPage')
const BlockPage = lazyPage(() => import('./components/BlockPage'), 'BlockPage')
const ContentPage = lazyPage(() => import('./components/ContentPage'), 'ContentPage')

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
    return 'Rental Accommodations'
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

  const dynamicPageSummary = resolvePageSummaryForPath(pathname)

  if (dynamicPageSummary && DYNAMIC_PAGE_CONTENT_MODELS.has(dynamicPageSummary.contentModel)) {
    return dynamicPageSummary.title || dynamicPageSummary.label || 'Page'
  }

  return 'Page Not Found'
}

function getRouteSeoMeta(pathname) {
  const staticMeta = getStaticSeoMeta(pathname)

  if (staticMeta) {
    return staticMeta
  }

  const canonicalPath = getCanonicalPath(pathname)
  const title = getRouteTitle(pathname)

  return {
    title,
    description: DEFAULT_SITE_DESCRIPTION,
    canonicalPath,
    canonicalUrl: buildCanonicalUrl(canonicalPath),
    robots: pathname.startsWith('/admin') || title === 'Page Not Found' ? 'noindex, nofollow' : 'index, follow',
  }
}

function DynamicStructuredPageContent({ contentModel, pageKey }) {
  const page = useStructuredPageContent(pageKey)

  if (!page) {
    return <RouteLoadingFallback />
  }

  if (contentModel === 'block-page') {
    return <BlockPage page={page} />
  }

  return <ContentPage page={page} />
}

function DynamicStructuredPageRoute() {
  const location = useLocation()
  const summary = resolvePageSummaryForPath(location.pathname)

  if (!summary || !DYNAMIC_PAGE_CONTENT_MODELS.has(summary.contentModel)) {
    return <NotFoundPage />
  }

  return <DynamicStructuredPageContent contentModel={summary.contentModel} pageKey={summary.key} />
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

function shouldPreserveRouteScroll(locationState) {
  return Boolean(
    locationState &&
      typeof locationState === 'object' &&
      (locationState.restorePropertyReturnPosition === true || locationState.rentalFilterScrollTarget === true),
  )
}

function focusHashTargetElement(targetElement) {
  targetElement.scrollIntoView({ block: 'start', behavior: 'auto' })

  if (targetElement instanceof HTMLElement) {
    if (targetElement.id === 'main-content' && !targetElement.hasAttribute('tabindex')) {
      targetElement.setAttribute('tabindex', '-1')
    }

    targetElement.focus({ preventScroll: true })
  }
}

function RouteEnhancements() {
  const location = useLocation()
  const previousScrollLocationRef = useRef(null)
  const routeMeta = getRouteSeoMeta(location.pathname)

  useDocumentMeta({ ...routeMeta, priority: 0 })

  useEffect(() => {
    if (location.pathname.startsWith('/admin')) {
      return
    }

    trackPageView({
      path: `${location.pathname}${location.search}`,
      title: document.title,
    })
  }, [location.pathname, location.search])

  useEffect(() => {
    const previousScrollLocation = previousScrollLocationRef.current
    previousScrollLocationRef.current = {
      hash: location.hash,
      pathname: location.pathname,
    }

    if (
      previousScrollLocation &&
      previousScrollLocation.pathname === location.pathname &&
      previousScrollLocation.hash === location.hash
    ) {
      return
    }

    if (shouldPreserveRouteScroll(location.state)) {
      return
    }

    const hashTarget = readHashTarget(location.hash)

    if (hashTarget) {
      let frameId = 0
      let retryTimerId = 0
      let cancelled = false

      function scrollToHashTarget(attempt = 0) {
        frameId = window.requestAnimationFrame(() => {
          if (cancelled) {
            return
          }

          const targetElement = document.getElementById(hashTarget)

          if (targetElement) {
            focusHashTargetElement(targetElement)
            return
          }

          if (attempt < 10) {
            retryTimerId = window.setTimeout(() => scrollToHashTarget(attempt + 1), 50)
            return
          }

          window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
        })
      }

      scrollToHashTarget()

      return () => {
        cancelled = true
        window.cancelAnimationFrame(frameId)
        window.clearTimeout(retryTimerId)
      }
    }

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [location.hash, location.pathname, location.search, location.state])

  return null
}

function RouteLoadingFallback() {
  return (
    <section className="page-section property-page property-page--status">
      <h1>Loading page...</h1>
    </section>
  )
}

function RouteErrorFallback({ message }) {
  return (
    <section className="page-section property-page property-page--status">
      <h1>Content unavailable</h1>
      <p>{message || 'Live site content could not be loaded.'}</p>
    </section>
  )
}

function createRoutePreloadState(pathname) {
  if (!isApiBackedSiteContentSource()) {
    return {
      pathname,
      message: 'Site content must be loaded from the Firebase-backed API.',
      status: 'error',
    }
  }

  return {
    pathname,
    message: '',
    status: isRouteSiteContentPreloaded(pathname) ? 'ready' : 'loading',
  }
}

function SiteContentRouteGate({ children }) {
  const location = useLocation()
  const pathname = location.pathname
  const routePreloadState = createRoutePreloadState(pathname)
  const [preloadState, setPreloadState] = useState(() => routePreloadState)
  const activePreloadState = preloadState.pathname === pathname ? preloadState : routePreloadState

  useEffect(() => {
    let cancelled = false

    if (routePreloadState.status !== 'loading') {
      return undefined
    }

    preloadRouteSiteContent(pathname)
      .then(() => {
        if (!cancelled) {
          setPreloadState({ pathname, message: '', status: 'ready' })
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPreloadState({
            pathname,
            message: error instanceof Error ? error.message : 'Live site content could not be loaded.',
            status: 'error',
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [pathname, routePreloadState.status])

  if (activePreloadState.status === 'loading') {
    return <RouteLoadingFallback />
  }

  if (activePreloadState.status === 'error') {
    return <RouteErrorFallback message={activePreloadState.message} />
  }

  return children
}

normalizeHashRoute()

function AppRoutes() {
  const location = useLocation()

  return (
    <RouteErrorBoundary locationKey={location.pathname}>
      <SiteContentRouteGate>
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            <Route element={<SiteLayout />}>
              <Route index element={<HomePage />} />
              <Route path="admin" element={<AdminPage />} />
              <Route path="about-us" element={<AboutUsPage />} />
              <Route path="st-john-rentals" element={<Navigate replace to="/for-rent" />} />
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
              <Route path="*" element={<DynamicStructuredPageRoute />} />
            </Route>
          </Routes>
        </Suspense>
      </SiteContentRouteGate>
    </RouteErrorBoundary>
  )
}

function App() {
  return (
    <BrowserRouter>
      <RouteEnhancements />
      <AppRoutes />
    </BrowserRouter>
  )
}

export default App
