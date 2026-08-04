import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AboutUsPage } from '../pages/AboutUsPage'
import { AdvertisePage } from '../pages/AdvertisePage'
import { CarBargeInformationPage } from '../pages/CarBargeInformationPage'
import { CharterBoatsPage } from '../pages/CharterBoatsPage'
import { HomePage } from '../pages/HomePage'
import { HouseRentalsPage } from '../pages/HouseRentalsPage'
import { LocalAttractionsPage } from '../pages/LocalAttractionsPage'
import { PassengerFerryPage } from '../pages/PassengerFerryPage'
import { PropertyForSalePage } from '../pages/PropertyForSalePage'
import { RentalAccommodationsPage } from '../pages/RentalAccommodationsPage'
import { StJohnCarRentalsPage } from '../pages/StJohnCarRentalsPage'
import { SiteFrame } from './SiteLayout'
import { BlockPage } from './BlockPage'
import { ContentPage } from './ContentPage'
import { resolveContentAssets } from '../lib/contentAssets'
import { createInlinePageEditorValue } from '../lib/inlinePageEditor'
import { SiteContentPreviewContext } from '../lib/siteContentPreview'

const structuredPagePreviewComponents = {
  aboutUs: AboutUsPage,
  advertise: AdvertisePage,
  carBargeInformation: CarBargeInformationPage,
  charterBoats: CharterBoatsPage,
  home: HomePage,
  houseRentals: HouseRentalsPage,
  localAttractions: LocalAttractionsPage,
  passengerFerry: PassengerFerryPage,
  propertyForSale: PropertyForSalePage,
  rentalAccommodations: RentalAccommodationsPage,
  stJohnCarRentals: StJohnCarRentalsPage,
}

function renderPreviewBody(page, pageKey) {
  const PreviewComponent = structuredPagePreviewComponents[pageKey]

  if (page.contentModel === 'block-page') {
    return <BlockPage page={page} />
  }

  if (page.contentModel === 'rich-content-page' || page.contentModel === 'legal-content-page' || !PreviewComponent) {
    return <ContentPage page={page} />
  }

  return <PreviewComponent />
}

export function PreviewSurface({ children, device = 'desktop', interactive = false }) {
  return (
    <div className="admin-site-preview-scroll">
      <div className={`admin-site-preview-viewport admin-site-preview-viewport--${device}`.trim()}>
        <div className={`admin-site-preview-surface ${interactive ? 'admin-site-preview-surface--interactive' : ''}`.trim()}>
          {children}
        </div>
      </div>
    </div>
  )
}

function PreviewPlaceholder() {
  return (
    <article className="admin-preview-placeholder">
      <div className="admin-preview-placeholder-inner">
        <h2>Header & Footer</h2>
      </div>
    </article>
  )
}

function getTargetOwnerElement(target) {
  if (!target) {
    return null
  }

  if (target instanceof Element) {
    return target
  }

  return target.parentElement ?? null
}

export function AdminPagePreview({ device = 'desktop', page, pageKey, routeInventory = [], siteShell }) {
  if (!page || !pageKey || !siteShell) {
    return null
  }

  const resolvedSiteShell = resolveContentAssets(siteShell)
  const previewBody = renderPreviewBody(page, pageKey)

  return (
    <SiteContentPreviewContext.Provider value={{ pages: { [pageKey]: page }, routeInventory, siteShell: resolvedSiteShell }}>
      <PreviewSurface device={device}>
        <div className="site-main admin-preview-page-only">
          {previewBody}
        </div>
      </PreviewSurface>
    </SiteContentPreviewContext.Provider>
  )
}

function escapeAttributeSelectorValue(value) {
  return String(value ?? '').replace(/["\\]/g, '\\$&')
}

const LAYOUT_ELEMENT_SELECTOR = [
  '.block-style-frame',
  '.block-style-frame-inner',
  '.block-hero',
  '.block-hero-inner',
  '.block-split',
  '.block-split-inner',
  '.block-split-media',
  '.block-split-copy',
  '.block-feature-grid',
  '.block-feature-grid-items',
  '.block-contact-form',
  '.block-contact-form-inner',
  '.block-row',
  '.block-row-column',
  '.block-group',
  '.block-group-card',
  '.block-rich-text',
  '.block-image',
  '.block-image-gallery',
  '.block-cta-band',
  '.block-cta-band-inner',
  '.block-directory-embed',
  '.block-business-list',
  '.block-contact-details',
  '.block-schedule',
  '.block-rate-table',
  '.block-two-column',
].join(',')

function normalizeClassName(element) {
  return Array.from(element.classList ?? [])
    .filter((className) => !className.startsWith('admin-inline') && !className.startsWith('block-toolbar'))
    .slice(0, 5)
    .join(' ')
}

function measureLayoutElement(element, surfaceRect, role) {
  const rect = element.getBoundingClientRect()
  const computed = window.getComputedStyle(element)

  return {
    alignItems: computed.alignItems,
    className: normalizeClassName(element),
    display: computed.display,
    flexDirection: computed.flexDirection,
    gridTemplateColumns: computed.gridTemplateColumns,
    height: rect.height,
    id: `${role}:${element.tagName.toLowerCase()}:${normalizeClassName(element)}:${Math.round(rect.left)}:${Math.round(rect.top)}`,
    justifyContent: computed.justifyContent,
    position: computed.position,
    role,
    tagName: element.tagName.toLowerCase(),
    width: rect.width,
    x: rect.left - surfaceRect.left,
    y: rect.top - surfaceRect.top,
  }
}

function collectEditorLayoutMetrics(surface) {
  if (!surface) {
    return { bySelectionId: {}, entries: [] }
  }

  const surfaceRect = surface.getBoundingClientRect()
  const bySelectionId = {}

  Array.from(surface.querySelectorAll('[data-editor-selection-id]')).forEach((selectionElement) => {
    const selectionId = String(selectionElement.getAttribute('data-editor-selection-id') ?? '').trim()

    if (!selectionId || bySelectionId[selectionId]) {
      return
    }

    const measuredElement = selectionElement.classList.contains('block-page-block-surface')
      ? selectionElement.closest('.block-page-block') ?? selectionElement
      : selectionElement
    const elements = Array.from(selectionElement.querySelectorAll(LAYOUT_ELEMENT_SELECTOR))
      .filter((element) => element.closest('[data-editor-selection-id]') === selectionElement)
      .filter((element) => element !== measuredElement)
      .slice(0, 14)
      .map((element) => measureLayoutElement(element, surfaceRect, 'element'))

    bySelectionId[selectionId] = {
      ...measureLayoutElement(measuredElement, surfaceRect, 'selection'),
      elements,
      selectionId,
    }
  })

  return {
    bySelectionId,
    entries: Object.values(bySelectionId),
  }
}

export function AdminPageEditorCanvas({
  device = 'desktop',
  disabled = false,
  onChange,
  onLayoutMetricsChange,
  onSelectedBlockIdChange,
  page,
  pageKey,
  routeInventory = [],
  selectedBlockId = '',
  siteShell,
}) {
  const [activeFieldId, setActiveFieldId] = useState('')
  const suppressInlineActivationClickRef = useRef(false)
  const suppressInlineActivationClickTimeoutRef = useRef(0)
  const surfaceRef = useRef(null)

  function clearInlineActivationClickGuard() {
    suppressInlineActivationClickRef.current = false

    if (suppressInlineActivationClickTimeoutRef.current && typeof window !== 'undefined') {
      window.clearTimeout(suppressInlineActivationClickTimeoutRef.current)
      suppressInlineActivationClickTimeoutRef.current = 0
    }
  }

  function armInlineActivationClickGuard() {
    if (typeof window === 'undefined') {
      return
    }

    clearInlineActivationClickGuard()
    suppressInlineActivationClickRef.current = true
    suppressInlineActivationClickTimeoutRef.current = window.setTimeout(() => {
      suppressInlineActivationClickRef.current = false
      suppressInlineActivationClickTimeoutRef.current = 0
    }, 750)
  }

  useEffect(() => {
    if (!selectedBlockId || !surfaceRef.current) {
      return
    }

    const selector = `[data-editor-selection-id="${escapeAttributeSelectorValue(selectedBlockId)}"]`
    const selectedBlockElement = surfaceRef.current.querySelector(selector)

    selectedBlockElement?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [selectedBlockId])

  useEffect(
    () => () => {
      suppressInlineActivationClickRef.current = false

      if (suppressInlineActivationClickTimeoutRef.current && typeof window !== 'undefined') {
        window.clearTimeout(suppressInlineActivationClickTimeoutRef.current)
      }
    },
    [],
  )

  useLayoutEffect(() => {
    if (!onLayoutMetricsChange || !surfaceRef.current) {
      return undefined
    }

    const surface = surfaceRef.current
    let animationFrame = 0

    function publishMetrics() {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(() => {
        onLayoutMetricsChange(collectEditorLayoutMetrics(surface))
      })
    }

    publishMetrics()

    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(publishMetrics) : null
    resizeObserver?.observe(surface)
    surface.querySelectorAll('[data-editor-selection-id]').forEach((element) => resizeObserver?.observe(element))
    window.addEventListener('resize', publishMetrics)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', publishMetrics)
    }
  }, [device, onLayoutMetricsChange, page, selectedBlockId])

  if (!page || !pageKey || !siteShell) {
    return null
  }

  const resolvedSiteShell = resolveContentAssets(siteShell)
  const pageEditor = createInlinePageEditorValue({
    activeFieldId,
    device,
    disabled,
    onChange,
    selectedBlockId,
    setActiveFieldId,
    setSelectedBlockId: onSelectedBlockIdChange,
  })
  const previewBody = renderPreviewBody(page, pageKey)

  function handleCanvasPointerDownCapture(event) {
    const target = getTargetOwnerElement(event.target)

    if (!(target instanceof Element)) {
      return
    }

    if (target.closest('[data-admin-inline-editable="true"]')) {
      armInlineActivationClickGuard()
    }
  }

  function handleCanvasClickCapture(event) {
    const target = getTargetOwnerElement(event.target)

    if (!(target instanceof Element)) {
      return
    }

    const editorChromeTarget = target.closest(
      '[data-admin-inline-editable="true"], .admin-inline-popover, .admin-inline-format-toolbar, .admin-inline-link-settings',
    )
    const shouldSuppressRetargetedInlineClick = suppressInlineActivationClickRef.current
    clearInlineActivationClickGuard()

    if (shouldSuppressRetargetedInlineClick && !editorChromeTarget) {
      const hasActiveInlineTarget = Boolean(surfaceRef.current?.querySelector('[data-admin-inline-editing="true"]'))

      if (activeFieldId || hasActiveInlineTarget) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
    }

    if (activeFieldId && !editorChromeTarget) {
      setActiveFieldId('')
    }

    if (editorChromeTarget) {
      return
    }

    const interactiveTarget = target.closest('a, button, input, textarea, select, label')

    if (!interactiveTarget) {
      return
    }

    const nestedEditableTarget = interactiveTarget.querySelector('[data-admin-inline-editable="true"]')

    if (nestedEditableTarget instanceof HTMLElement) {
      event.preventDefault()
      event.stopPropagation()
      nestedEditableTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }))
      nestedEditableTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      return
    }

    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <SiteContentPreviewContext.Provider value={{ pages: { [pageKey]: page }, pageEditor, routeInventory, siteShell: resolvedSiteShell }}>
      <PreviewSurface device={device} interactive>
        <div
          className="site-main admin-preview-editor-page"
          ref={surfaceRef}
          onClickCapture={handleCanvasClickCapture}
          onPointerDownCapture={handleCanvasPointerDownCapture}
        >
          {previewBody}
        </div>
      </PreviewSurface>
    </SiteContentPreviewContext.Provider>
  )
}

export function AdminSiteShellPreview({ device = 'desktop', pathname = '/', siteShell }) {
  if (!siteShell) {
    return null
  }

  const resolvedSiteShell = resolveContentAssets(siteShell)

  return (
    <SiteContentPreviewContext.Provider value={{ siteShell }}>
      <PreviewSurface device={device}>
        <SiteFrame interactive={false} pathname={pathname} siteShell={resolvedSiteShell}>
          <PreviewPlaceholder />
        </SiteFrame>
      </PreviewSurface>
    </SiteContentPreviewContext.Provider>
  )
}
