import { useState } from 'react'
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

export function AdminPagePreview({ device = 'desktop', page, pageKey, siteShell }) {
  if (!page || !pageKey || !siteShell) {
    return null
  }

  const resolvedSiteShell = resolveContentAssets(siteShell)
  const previewBody = renderPreviewBody(page, pageKey)

  return (
    <SiteContentPreviewContext.Provider value={{ pages: { [pageKey]: page }, siteShell }}>
      <PreviewSurface device={device}>
        <SiteFrame interactive={false} pathname={page.path || '/'} siteShell={resolvedSiteShell}>
          {previewBody}
        </SiteFrame>
      </PreviewSurface>
    </SiteContentPreviewContext.Provider>
  )
}

export function AdminPageEditorCanvas({
  device = 'desktop',
  disabled = false,
  onChange,
  page,
  pageKey,
  siteShell,
}) {
  const [activeFieldId, setActiveFieldId] = useState('')

  if (!page || !pageKey || !siteShell) {
    return null
  }

  const resolvedSiteShell = resolveContentAssets(siteShell)
  const pageEditor = createInlinePageEditorValue({
    activeFieldId,
    disabled,
    onChange,
    setActiveFieldId,
  })
  const previewBody = renderPreviewBody(page, pageKey)

  function handleCanvasClickCapture(event) {
    const target = event.target

    if (!(target instanceof Element)) {
      return
    }

    if (target.closest('.admin-inline-popover')) {
      return
    }

    const interactiveTarget = target.closest('a, button, form, input, textarea, select, label')

    if (!interactiveTarget) {
      return
    }

    if (target.closest('[data-admin-inline-editable="true"]')) {
      return
    }

    const nestedEditableTarget = interactiveTarget.querySelector('[data-admin-inline-editable="true"]')

    if (nestedEditableTarget instanceof HTMLElement) {
      event.preventDefault()
      event.stopPropagation()
      nestedEditableTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      return
    }

    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <SiteContentPreviewContext.Provider value={{ pages: { [pageKey]: page }, pageEditor, siteShell }}>
      <PreviewSurface device={device} interactive>
        <SiteFrame interactive={false} pathname={page.path || '/'} siteShell={resolvedSiteShell}>
          <div className="admin-preview-editor-page" onClickCapture={handleCanvasClickCapture}>
            {previewBody}
          </div>
        </SiteFrame>
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
