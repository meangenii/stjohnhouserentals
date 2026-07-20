import { EditableBackgroundSection, EditableImage, EditableText } from '../components/AdminInlinePageEdit'
import { EditablePhoneText } from '../components/EditablePhoneText'
import { buildPhoneHref, formatPhoneNumber } from '../lib/contactLinks'
import { getContentImageSrc } from '../lib/contentAssets'
import { getImageDimensions } from '../lib/imageSizePresets'
import { PageLoadingState } from '../components/PageLoadingState'
import { useStructuredPageContent } from '../lib/useSiteContent'

function PhoneIcon() {
  return (
    <svg aria-hidden="true" className="st-john-car-rentals-card-icon" viewBox="0 0 24 24">
      <path d="M7.2 3.5 4.8 4.6c-.8.4-1.2 1.3-1 2.2 1.1 6.6 6.4 11.9 13 13 .9.2 1.8-.2 2.2-1l1.1-2.4c.3-.7.1-1.5-.5-2l-3-2.2c-.6-.4-1.4-.3-1.9.2l-1.4 1.4a12.5 12.5 0 0 1-3.2-2.2A12.5 12.5 0 0 1 8 8.5l1.4-1.4c.5-.5.6-1.3.2-1.9l-2.2-3c-.5-.6-1.3-.8-2-.5Z" />
    </svg>
  )
}

function PhoneLinks({ pathPrefix, phones, separator = '/' }) {
  return phones.map((phone, index) => (
    <span key={index}>
      {index > 0 ? separator : ''}
      <EditablePhoneText
        className="st-john-car-rentals-phone"
        label={`Phone ${index + 1}`}
        path={[...pathPrefix, index]}
        value={phone}
      />
    </span>
  ))
}

// The company grid is a read-only render of the data managed in the admin "Car Rental Companies"
// form list — no click-to-edit here, so this renders plain links instead of the Editable*
// components used elsewhere on the page.
function StaticPhoneLinks({ phones, separator = '/' }) {
  return (phones ?? []).map((phone, index) => {
    const href = buildPhoneHref(phone)

    return (
      <span key={index}>
        {index > 0 ? separator : ''}
        {href ? <a href={href}>{formatPhoneNumber(phone)}</a> : formatPhoneNumber(phone)}
      </span>
    )
  })
}

function mergeImageFallback(fallbackImage, image) {
  if (!image) {
    return fallbackImage
  }

  return {
    ...fallbackImage,
    ...image,
  }
}

function getCarRentalImageSrc(image, fallbackOptions) {
  const { width, height } = getImageDimensions(image)

  if (width && height) {
    return getContentImageSrc(image, { height, mode: 'fit', width })
  }

  return getContentImageSrc(image, fallbackOptions)
}

function getWebsiteThumbnailUrl(url, { width = 640, height = 480 } = {}) {
  return `https://s0.wp.com/mshots/v1/${encodeURIComponent(url)}?w=${width}&h=${height}`
}

export function StJohnCarRentalsPage() {
  const page = useStructuredPageContent('stJohnCarRentals')

  if (!page) {
    return <PageLoadingState />
  }

  const directoryImage = mergeImageFallback(page.directory.detailImage, page.directory.directoryImage)
  const heroImageUrl = getContentImageSrc(page.hero.image, { width: 1920, height: 1080 })
  const directoryImageUrl = getCarRentalImageSrc(directoryImage, { width: 900, height: 900 })
  const detailImageUrl = getCarRentalImageSrc(page.directory.detailImage, { width: 900, height: 1365 })

  return (
    <article className="st-john-car-rentals-page">
      <EditableBackgroundSection
        as="section"
        className="st-john-car-rentals-hero"
        image={page.hero.image}
        path={['hero', 'image']}
        style={
          heroImageUrl
            ? {
                backgroundImage: `linear-gradient(rgba(10, 20, 34, 0.1), rgba(10, 20, 34, 0.1)), url(${heroImageUrl})`,
              }
            : undefined
        }
      >
        <div className="st-john-car-rentals-hero-inner">
          <EditableText as="h1" label="Hero Title" multiline path={['hero', 'title']} rows={3} value={page.hero.title}>
            {page.hero.title}
          </EditableText>
          <EditableText as="p" label="Hero Tagline" multiline path={['hero', 'tagline']} rows={4} value={page.hero.tagline}>
            {page.hero.tagline}
          </EditableText>
        </div>
      </EditableBackgroundSection>

      <section className="st-john-car-rentals-directory">
        <div className="st-john-car-rentals-directory-inner">
          <div className="st-john-car-rentals-directory-grid">
            <div className="st-john-car-rentals-copy">
              <EditableText as="p" label="Intro Paragraph" multiline path={['directory', 'introParagraph']} rows={5} value={page.directory.introParagraph}>
                {page.directory.introParagraph}
              </EditableText>

              <EditableText as="p" label="Airport Paragraph" multiline path={['directory', 'airportParagraph']} rows={6} value={page.directory.airportParagraph}>
                {page.directory.airportParagraph}
              </EditableText>

              <p>
                Budget Car Rental on St Thomas:{' '}
                <PhoneLinks pathPrefix={['directory', 'budgetPhones']} phones={page.directory.budgetPhones} separator=" or " />
              </p>

              <p>
                <EditableText as="span" label="Dependable Paragraph" multiline path={['directory', 'dependableParagraph']} rows={5} value={page.directory.dependableParagraph}>
                  {page.directory.dependableParagraph}
                </EditableText>{' '}
                <EditablePhoneText
                  className="st-john-car-rentals-phone"
                  label="Dependable Phone"
                  path={['directory', 'dependablePhone']}
                  value={page.directory.dependablePhone}
                />
              </p>
            </div>

            <div className="st-john-car-rentals-directory-media">
              {directoryImageUrl ? (
                <EditableImage
                  alt={directoryImage.alt || 'Rental jeep on St. John'}
                  className="st-john-car-rentals-directory-media-item"
                  decoding="async"
                  image={directoryImage}
                  path={['directory', 'directoryImage']}
                  loading="lazy"
                  src={directoryImageUrl}
                />
              ) : null}
              {detailImageUrl ? (
                <EditableImage
                  alt={page.directory.detailImage.alt || 'Red jeep on a St. John road'}
                  className="st-john-car-rentals-directory-media-item"
                  decoding="async"
                  image={page.directory.detailImage}
                  path={['directory', 'detailImage']}
                  loading="lazy"
                  src={detailImageUrl}
                />
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="st-john-car-rentals-companies">
        <div className="st-john-car-rentals-companies-inner">
          <h2 className="st-john-car-rentals-companies-title">Car Rental Companies on St. John</h2>

          <div className="st-john-car-rentals-cards">
            {page.directory.companies.map((company, companyIndex) => {
              if (company.active === false) {
                return null
              }

              return (
                <div className="st-john-car-rentals-card" key={company.id ?? companyIndex}>
                  {company.website ? (
                    <div className="st-john-car-rentals-card-preview">
                      <img
                        alt={`${company.name} website preview`}
                        loading="lazy"
                        src={getWebsiteThumbnailUrl(company.website)}
                      />
                      <a
                        aria-label={`Visit ${company.name} website`}
                        className="st-john-car-rentals-card-link"
                        href={company.website}
                        rel="noopener noreferrer"
                        target="_blank"
                      />
                      <div className="st-john-car-rentals-card-name-badge">
                        <a className="st-john-car-rentals-name" href={company.website} rel="noopener noreferrer" target="_blank">
                          {company.name}
                        </a>
                      </div>
                      <div className="st-john-car-rentals-card-phone-bar">
                        <PhoneIcon />
                        <p className="st-john-car-rentals-card-phones">
                          <StaticPhoneLinks phones={company.phones} separator="" />
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="st-john-car-rentals-card-body">
                      <p className="st-john-car-rentals-card-phones">
                        <PhoneIcon />
                        <StaticPhoneLinks phones={company.phones} separator="" />
                      </p>
                      <span className="st-john-car-rentals-name">{company.name}</span>
                      <span className="st-john-car-rentals-card-no-website">No website</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </article>
  )
}
