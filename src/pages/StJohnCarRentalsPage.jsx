import { getContentImageSrc } from '../lib/contentAssets'
import { useStructuredPageContent } from '../lib/useSiteContent'

function PhoneLinks({ phones, separator = '/' }) {
  return phones.map((phone, index) => (
    <span key={phone}>
      {index > 0 ? separator : ''}
      <a className="st-john-car-rentals-phone" href={`tel:${phone.replace(/[^0-9+]/g, '')}`}>
        {phone}
      </a>
    </span>
  ))
}

export function StJohnCarRentalsPage() {
  const page = useStructuredPageContent('stJohnCarRentals')
  const heroImageUrl = getContentImageSrc(page.hero.image, { width: 1920, height: 1080 })
  const detailImageUrl = getContentImageSrc(page.directory.detailImage, { width: 900, height: 1365 })

  return (
    <article className="st-john-car-rentals-page">
      <section
        className="st-john-car-rentals-hero"
        style={
          heroImageUrl
            ? {
                backgroundImage: `linear-gradient(rgba(10, 20, 34, 0.1), rgba(10, 20, 34, 0.1)), url(${heroImageUrl})`,
              }
            : undefined
        }
      >
        <div className="st-john-car-rentals-hero-inner">
          <h1>{page.hero.title}</h1>
          <p>{page.hero.tagline}</p>
        </div>
      </section>

      <section className="st-john-car-rentals-directory">
        <div className="st-john-car-rentals-directory-inner">
          <div className="st-john-car-rentals-directory-grid">
            <div className="st-john-car-rentals-copy">
              <h2>{page.directory.title}</h2>
              <p>{page.directory.introParagraph}</p>

              <div className="st-john-car-rentals-list">
                {page.directory.companies.map((company) => (
                  <p className="st-john-car-rentals-entry" key={company.name}>
                    {company.website ? (
                      <a className="st-john-car-rentals-name" href={company.website} rel="noreferrer" target="_blank">
                        {company.name}
                      </a>
                    ) : (
                      <span>{company.name}</span>
                    )}{' '}
                    <PhoneLinks phones={company.phones} separator={company.separator ?? '/'} />
                  </p>
                ))}
              </div>

              <div className="st-john-car-rentals-notes">
                <p>{page.directory.airportParagraph}</p>

                <p>
                  Budget Car Rental on St Thomas:{' '}
                  <PhoneLinks phones={page.directory.budgetPhones} separator={' or '} />
                </p>

                <p>
                  {page.directory.dependableParagraph}{' '}
                  <a
                    className="st-john-car-rentals-phone"
                    href={`tel:${page.directory.dependablePhone.replace(/[^0-9+]/g, '')}`}
                  >
                    {page.directory.dependablePhone}
                  </a>
                </p>
              </div>
            </div>

            <div className="st-john-car-rentals-media">
              {detailImageUrl ? (
                <img
                  alt={page.directory.detailImage.alt || 'Red jeep on St. John road'}
                  decoding="async"
                  loading="lazy"
                  src={detailImageUrl}
                />
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </article>
  )
}
