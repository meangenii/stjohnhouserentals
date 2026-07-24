import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { PropertyAvailabilityFallback } from '../components/PropertyAvailabilityFallback'
import { PropertyAvailabilityCalendar } from '../components/PropertyAvailabilityCalendar'
import { PropertyContentSection } from '../components/PropertyContentSection'
import { PropertyDescriptionSections } from '../components/PropertyDescriptionSections'
import { RichTextValue } from '../components/RichTextValue'
import { ReturnToPropertiesButton } from '../components/ReturnToPropertiesButton'
import { getAdminIdToken } from '../lib/adminAuth'
import { DEFAULT_SITE_DESCRIPTION, useDocumentMeta } from '../lib/documentMeta'
import { getPropertyContactActions, getPropertyContactInfo } from '../lib/propertyContact'
import { getShortDescriptionLines } from '../lib/propertyDetailHelpers'
import { getPropertyBySlug } from '../lib/propertyRepository'
import { getPropertyTemplateVariantConfig } from '../lib/propertyTemplateVariants'
import { buildRemoteImageUrl } from '../lib/remoteImage'
import { usePropertyGalleryNavigation } from '../lib/usePropertyGalleryNavigation'
import { useAdminSession } from '../lib/useAdminSession'
import { hasPropertyCalendarLink } from '../lib/propertyCalendarLink'
import { buildBreadcrumbJsonLd, getCanonicalPath } from '../../shared/seoMetadata.js'

const PROPERTY_CROSSFADE_DURATION_MS = 180
const PROPERTY_CROSSFADE_NAVIGATION_DELAY_MS = PROPERTY_CROSSFADE_DURATION_MS + 40

function isUnmodifiedPrimaryClick(event) {
  return event.button === 0 && !event.metaKey && !event.altKey && !event.ctrlKey && !event.shiftKey
}

function scrollToElementWithoutAnimation(element) {
  const documentElement = document.documentElement
  const previousScrollBehavior = documentElement.style.scrollBehavior

  documentElement.style.scrollBehavior = 'auto'
  element.scrollIntoView({ behavior: 'auto', block: 'start' })
  documentElement.style.scrollBehavior = previousScrollBehavior
}

export function PropertyDetailPage() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { isAdmin, status: adminSessionStatus } = useAdminSession({ immediate: true })
  const [state, setState] = useState({ status: 'loading', slug })
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const [thumbnailRailState, setThumbnailRailState] = useState({
    canScroll: false,
    atStart: true,
    atEnd: true,
  })
  const [routeTransitionPhase, setRouteTransitionPhase] = useState('idle')
  const routeTransitionPhaseRef = useRef('idle')
  const pendingDestinationRef = useRef('')
  const propertyHeadingRef = useRef(null)
  const navigationTimerRef = useRef(null)
  const revealFrameRef = useRef(null)
  const revealTimerRef = useRef(null)
  const thumbnailsRef = useRef(null)
  const stateMatchesSlug = state.slug === slug
  const effectiveStatus = stateMatchesSlug ? state.status : 'loading'
  const property = effectiveStatus === 'ready' ? state.property : null
  const loadedPropertyPath = property?.path ?? ''
  const shortDescriptionLines = property ? getShortDescriptionLines(property) : []
  const galleryImageCount = property
    ? (Array.isArray(property.gallery) ? property.gallery.filter(Boolean).length : 0) || (property.heroImage ? 1 : 0)
    : 0
  const { galleryPointerHandlers, showNextGalleryImage, showPreviousGalleryImage } =
    usePropertyGalleryNavigation(galleryImageCount, setActiveImageIndex)
  const documentTitle =
    effectiveStatus === 'not-found'
      ? 'Property Not Found'
      : effectiveStatus === 'error'
        ? 'Property Unavailable'
        : property?.pageTitle || property?.name || 'Rental Property'
  const documentDescription =
    shortDescriptionLines.join(' ') || DEFAULT_SITE_DESCRIPTION
  const propertyCanonicalPath = property?.path || getCanonicalPath(`/rental-properties/${slug}`)
  const propertyStructuredData = property
    ? buildBreadcrumbJsonLd([
        { name: 'Home', path: '/' },
        { name: 'Rental Accommodations', path: '/for-rent' },
        { name: property.name, path: property.path },
      ])
    : null

  useDocumentMeta({
    canonicalPath: propertyCanonicalPath,
    description: documentDescription,
    image: property?.heroImage,
    imageAlt: property?.heroImage?.alt || property?.name || documentTitle,
    priority: 1,
    structuredData: propertyStructuredData,
    title: documentTitle,
    type: 'article',
  })

  useLayoutEffect(() => {
    if (
      !loadedPropertyPath ||
      routeTransitionPhaseRef.current !== 'covering' ||
      pendingDestinationRef.current !== loadedPropertyPath ||
      !propertyHeadingRef.current
    ) {
      return
    }

    const activeElement = document.activeElement

    if (activeElement instanceof HTMLElement && activeElement.closest('.property-adjacent-nav')) {
      activeElement.blur()
    }

    scrollToElementWithoutAnimation(propertyHeadingRef.current)

    revealFrameRef.current = window.requestAnimationFrame(() => {
      routeTransitionPhaseRef.current = 'revealing'
      setRouteTransitionPhase('revealing')
      revealTimerRef.current = window.setTimeout(() => {
        routeTransitionPhaseRef.current = 'idle'
        pendingDestinationRef.current = ''
        setRouteTransitionPhase('idle')
      }, PROPERTY_CROSSFADE_DURATION_MS)
    })
  }, [loadedPropertyPath])

  useEffect(
    () => () => {
      if (navigationTimerRef.current) {
        window.clearTimeout(navigationTimerRef.current)
      }

      if (revealFrameRef.current) {
        window.cancelAnimationFrame(revealFrameRef.current)
      }

      if (revealTimerRef.current) {
        window.clearTimeout(revealTimerRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    // The reveal effect above only clears the covering transition once the
    // destination property finishes loading successfully. If it instead fails
    // (network error, deleted/hidden property), loadedPropertyPath never becomes
    // truthy and the covering overlay — plus adjacent-property navigation — would
    // otherwise stay stuck forever.
    if (routeTransitionPhaseRef.current !== 'covering' || (effectiveStatus !== 'not-found' && effectiveStatus !== 'error')) {
      return
    }

    routeTransitionPhaseRef.current = 'idle'
    pendingDestinationRef.current = ''
    setRouteTransitionPhase('idle')
  }, [effectiveStatus])

  useEffect(() => {
    let cancelled = false

    async function loadProperty() {
      if (adminSessionStatus === 'loading') {
        setState({ status: 'loading', slug })
        return
      }

      try {
        let adminLoadError = null

        if (isAdmin) {
          const authToken = await getAdminIdToken()

          if (authToken) {
            try {
              const adminProperty = await getPropertyBySlug(slug, { authToken })

              if (cancelled) {
                return
              }

              if (adminProperty) {
                setActiveImageIndex(0)
                setState({ status: 'ready', property: adminProperty, slug })
                return
              }
            } catch (error) {
              adminLoadError = error
            }
          }
        }

        const property = await getPropertyBySlug(slug)

        if (cancelled) {
          return
        }

        if (property) {
          setActiveImageIndex(0)
          setState({ status: 'ready', property, slug })
          return
        }

        if (adminLoadError) {
          throw adminLoadError
        }

        setState({ status: 'not-found', slug })
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Unknown property load error'
          setState({ status: 'error', message, slug })
        }
      }
    }

    loadProperty()

    return () => {
      cancelled = true
    }
  }, [adminSessionStatus, isAdmin, slug])

  function handleAdjacentPropertyNavigation(event, destination, navigationState) {
    if (!isUnmodifiedPrimaryClick(event) || routeTransitionPhaseRef.current !== 'idle') {
      return
    }

    event.preventDefault()
    event.currentTarget.blur()
    routeTransitionPhaseRef.current = 'covering'
    pendingDestinationRef.current = destination
    setRouteTransitionPhase('covering')

    const transitionDelay = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 0
      : PROPERTY_CROSSFADE_NAVIGATION_DELAY_MS

    navigationTimerRef.current = window.setTimeout(() => {
      navigate(destination, navigationState ? { state: navigationState } : undefined)
    }, transitionDelay)
  }

  useEffect(() => {
    const thumbnailsElement = thumbnailsRef.current

    if (!thumbnailsElement) {
      setThumbnailRailState({
        canScroll: false,
        atStart: true,
        atEnd: true,
      })
      return undefined
    }

    const syncThumbnailRailState = () => {
      const maxScrollLeft = Math.max(0, thumbnailsElement.scrollWidth - thumbnailsElement.clientWidth)
      const canScroll = maxScrollLeft > 8
      const nextState = {
        canScroll,
        atStart: !canScroll || thumbnailsElement.scrollLeft <= 8,
        atEnd: !canScroll || thumbnailsElement.scrollLeft >= maxScrollLeft - 8,
      }

      setThumbnailRailState((currentState) => {
        if (
          currentState.canScroll === nextState.canScroll &&
          currentState.atStart === nextState.atStart &&
          currentState.atEnd === nextState.atEnd
        ) {
          return currentState
        }

        return nextState
      })
    }

    syncThumbnailRailState()

    thumbnailsElement.addEventListener('scroll', syncThumbnailRailState, { passive: true })

    const resizeObserver =
      typeof ResizeObserver === 'function' ? new ResizeObserver(() => syncThumbnailRailState()) : null

    resizeObserver?.observe(thumbnailsElement)
    window.addEventListener('resize', syncThumbnailRailState)

    return () => {
      thumbnailsElement.removeEventListener('scroll', syncThumbnailRailState)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', syncThumbnailRailState)
    }
  }, [slug, effectiveStatus])

  if (effectiveStatus === 'loading') {
    return (
      <section className="page-section property-page property-page--status">
        <h1>Loading property...</h1>
      </section>
    )
  }

  if (effectiveStatus === 'error') {
    return (
      <section className="page-section property-page property-page--status">
        <h1>Property unavailable</h1>
        <p>{state.message}</p>
      </section>
    )
  }

  if (effectiveStatus === 'not-found') {
    return (
      <section className="page-section property-page property-page--status">
        <h1>Property not found</h1>
      </section>
    )
  }

  const filteredPropertyOrder = Array.isArray(location.state?.filteredPropertyOrder)
    ? location.state.filteredPropertyOrder
    : null
  const filteredPropertyIndex = filteredPropertyOrder
    ? filteredPropertyOrder.findIndex((item) => item?.slug === property.slug)
    : -1
  const usesFilteredPropertyOrder = filteredPropertyIndex !== -1
  const previousProperty = usesFilteredPropertyOrder
    ? (filteredPropertyOrder[filteredPropertyIndex - 1] ?? null)
    : property.previousProperty
  const nextProperty = usesFilteredPropertyOrder
    ? (filteredPropertyOrder[filteredPropertyIndex + 1] ?? null)
    : property.nextProperty
  const propertyReturnPath = typeof location.state?.propertyReturnPath === 'string' ? location.state.propertyReturnPath : '/for-rent'
  const nextPropertyNavigationState =
    usesFilteredPropertyOrder || propertyReturnPath !== '/for-rent'
      ? {
          ...(usesFilteredPropertyOrder ? { filteredPropertyOrder } : {}),
          propertyReturnPath,
        }
      : null

  const propertyGallery = Array.isArray(property.gallery) ? property.gallery.filter(Boolean) : []
  const templateVariant = getPropertyTemplateVariantConfig(property.templateVariant)
  const galleryImages = propertyGallery.length > 0 ? propertyGallery : property.heroImage ? [property.heroImage] : []
  const safeImageIndex =
    galleryImages.length > 0 ? Math.min(activeImageIndex, galleryImages.length - 1) : 0
  const activeImage = galleryImages[safeImageIndex] ?? property.heroImage
  const thumbnailRailClassName = [
    'property-gallery-thumbnails-shell',
    thumbnailRailState.canScroll ? 'property-gallery-thumbnails-shell--scrollable' : '',
    thumbnailRailState.atStart ? 'property-gallery-thumbnails-shell--at-start' : '',
    thumbnailRailState.atEnd ? 'property-gallery-thumbnails-shell--at-end' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const bannerImageUrl = property.heroImage?.url
    ? buildRemoteImageUrl(property.heroImage, { width: 1600, height: 540 })
    : activeImage?.url
      ? buildRemoteImageUrl(activeImage, { width: 1600, height: 540 })
      : ''
  const sectionConfigs = templateVariant.sections
  const contactActions = getPropertyContactActions(property)
  const contactInfo = getPropertyContactInfo(property)
  const availabilityFallback = <PropertyAvailabilityFallback contactActions={contactActions} contactInfo={contactInfo} />
  const hasCalendarLink = hasPropertyCalendarLink(property)
  const propertySections = {
    shortDescription:
      shortDescriptionLines.length > 0 || sectionConfigs.shortDescription.renderWhenEmpty ? (
        <PropertyContentSection
          key="shortDescription"
          renderWhenEmpty={sectionConfigs.shortDescription.renderWhenEmpty}
          showHeader={sectionConfigs.shortDescription.showHeader}
          title={sectionConfigs.shortDescription.title}
        >
          <div className="property-fact-stack">
            {shortDescriptionLines.map((line) => (
              <RichTextValue as="div" className="property-fact-line" key={line} value={line} />
            ))}
          </div>

          {contactActions.length > 0 ? (
            <div className="property-contact-actions">
              {contactActions.map((action) => (
                <a
                  className={`button-link ${action.toneClassName} property-contact-button`.trim()}
                  href={action.href}
                  key={action.key}
                >
                  {action.label}
                </a>
              ))}
            </div>
          ) : null}
        </PropertyContentSection>
      ) : null,
    description: (
      <PropertyDescriptionSections
        bookingHtml={property.bookingHtml}
        enabledDescriptionSections={property.enabledDescriptionSections}
        hasStructuredDescriptionSections={property.hasStructuredDescriptionSections}
        key="description"
        descriptionHtml={property.descriptionHtml}
        policyHtml={property.policyHtml}
        ratesHtml={property.ratesHtml}
        ratesTableHtml={property.ratesTableHtml}
        sectionConfig={sectionConfigs.description}
      />
    ),
    calendar: hasCalendarLink ? (
      <PropertyContentSection
        className="property-template-section--calendar"
        key="calendar"
        showHeader={sectionConfigs.calendar.showHeader}
        title={sectionConfigs.calendar.title}
      >
        <PropertyAvailabilityCalendar fallback={availabilityFallback} propertySlug={property.slug} />
      </PropertyContentSection>
    ) : null,
    amenities: (
      <PropertyContentSection
        key="amenities"
        className="property-template-section--amenities"
        html={property.amenitiesHtml}
        listSections
        renderWhenEmpty={sectionConfigs.amenities.renderWhenEmpty}
        showHeader={sectionConfigs.amenities.showHeader}
        title={sectionConfigs.amenities.title}
      />
    ),
    reviews: (
      <PropertyContentSection
        key="reviews"
        className="property-template-section--reviews"
        html={property.reviewsHtml}
        reviewEntries
        renderWhenEmpty={sectionConfigs.reviews.renderWhenEmpty}
        showHeader={sectionConfigs.reviews.showHeader}
        title={sectionConfigs.reviews.title}
      />
    ),
  }

  return (
    <article className="property-page property-page--template">
      <div
        aria-hidden="true"
        className={`property-route-transition property-route-transition--${routeTransitionPhase}`}
      />
      <ReturnToPropertiesButton returnPath={propertyReturnPath} />

      <section
        className="property-banner"
        style={bannerImageUrl ? { backgroundImage: `linear-gradient(rgba(7, 26, 54, 0.18), rgba(7, 26, 54, 0.18)), url(${bannerImageUrl})` } : undefined}
        aria-hidden="true"
      />

      <section className="property-template-shell">
        <div className="property-template-inner">
          <header className="property-template-header" ref={propertyHeadingRef}>
            <h1>{property.name}</h1>
          </header>

          {activeImage ? (
            <section className="property-gallery">
              <div className="property-gallery-stage" {...galleryPointerHandlers}>
                <img
                  alt={activeImage.alt || `${property.name} main view`}
                  className="property-gallery-image"
                  decoding="async"
                  draggable="false"
                  loading="eager"
                  src={buildRemoteImageUrl(activeImage, { width: 1800, height: 1400, mode: 'fit' })}
                />

                {galleryImages.length > 1 ? (
                  <>
                    <button
                      aria-label="Show previous property image"
                      className="property-gallery-nav property-gallery-nav--previous"
                      type="button"
                      onClick={showPreviousGalleryImage}
                    >
                      <span aria-hidden="true">&lt;</span>
                    </button>
                    <button
                      aria-label="Show next property image"
                      className="property-gallery-nav property-gallery-nav--next"
                      type="button"
                      onClick={showNextGalleryImage}
                    >
                      <span aria-hidden="true">&gt;</span>
                    </button>
                  </>
                ) : null}
              </div>

              {galleryImages.length > 1 ? (
                <div className={thumbnailRailClassName}>
                  <p className="property-gallery-swipe-hint" aria-hidden="true">
                    Swipe for more photos <span>-{'>'}</span>
                  </p>

                  <p className="visually-hidden" id="property-gallery-swipe-instructions">
                    Swipe or scroll horizontally to see more property photos.
                  </p>

                  <div
                    ref={thumbnailsRef}
                    aria-describedby={thumbnailRailState.canScroll ? 'property-gallery-swipe-instructions' : undefined}
                    aria-label="Property image gallery"
                    className="property-gallery-thumbnails"
                    role="list"
                  >
                    {galleryImages.map((image, imageIndex) => (
                      <button
                        aria-label={`Show property image ${imageIndex + 1}`}
                        aria-pressed={imageIndex === safeImageIndex}
                        className={`property-gallery-thumbnail ${
                          imageIndex === safeImageIndex ? 'property-gallery-thumbnail--active' : ''
                        }`}
                        key={`${image.url}-${imageIndex}`}
                        type="button"
                        onClick={() => setActiveImageIndex(imageIndex)}
                      >
                        <img
                          alt={image.alt || `${property.name} view ${imageIndex + 1}`}
                          decoding="async"
                          loading="lazy"
                          src={buildRemoteImageUrl(image, { width: 520, height: 360 })}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {templateVariant.sectionOrder.map((sectionKey) => propertySections[sectionKey]).filter(Boolean)}

          {previousProperty || nextProperty ? (
            <nav aria-label="Adjacent properties" className="property-adjacent-nav">
              <div className="property-adjacent-slot">
                {previousProperty ? (
                  <Link
                    aria-label={`Previous property: ${previousProperty.name}`}
                    className="property-adjacent-link"
                    onClick={(event) =>
                      handleAdjacentPropertyNavigation(event, previousProperty.path, nextPropertyNavigationState)
                    }
                    state={nextPropertyNavigationState ?? undefined}
                    to={previousProperty.path}
                  >
                    previous item
                  </Link>
                ) : null}
              </div>

              <div className="property-adjacent-slot property-adjacent-slot--end">
                {nextProperty ? (
                  <Link
                    aria-label={`Next property: ${nextProperty.name}`}
                    className="property-adjacent-link"
                    onClick={(event) =>
                      handleAdjacentPropertyNavigation(event, nextProperty.path, nextPropertyNavigationState)
                    }
                    state={nextPropertyNavigationState ?? undefined}
                    to={nextProperty.path}
                  >
                    next item
                  </Link>
                ) : null}
              </div>
            </nav>
          ) : null}
        </div>
      </section>
    </article>
  )
}
