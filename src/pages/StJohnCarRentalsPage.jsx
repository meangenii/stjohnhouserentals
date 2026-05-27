import { pageSnapshots } from '../content/siteSnapshot'
import { buildWixImageUrl } from '../lib/wixImage'

const carRentalCompanies = [
  { name: 'C & C', website: 'http://www.cccarrental.com/', phones: ['340-693-8164'] },
  { name: 'Courtesy', website: 'https://www.courtesycarrental.com/', phones: ['340-776-6650'] },
  { name: "O'Connor", website: 'http://www.oconnorcarrental.com/', phones: ['340-776-6343'] },
  { name: 'L&L Jeep Rental', website: 'http://www.bookajeep.com/', phones: ['340-776-1120'] },
  { name: 'Mr. Pipers Jeeps', website: 'https://mrpipersjeeps.com/', phones: ['340-693-7580'] },
  { name: 'St John Car Rental', website: 'https://www.stjohncarrental.com/', phones: ['340-776-6103'] },
  { name: 'Aqua Blue Car Rental', website: 'http://www.aquablucarrental.com/', phones: ['340-776-2782'] },
  { name: 'Sunshine Jeep Rental', website: 'http://www.sunshinesjeeprental.com/', phones: ['340-690-1786'] },
  { name: "Penn's Jeep Rental, Inc.", phones: ['340-776-6530'] },
  {
    name: 'Cool Breeze Jeep & Car Rental',
    website: 'http://www.coolbreezecarrental.com/stjohn_vehicles_rates.htm',
    phones: ['340-776-6588'],
  },
  {
    name: 'Delbert Hill Car and Jeep Rental',
    website: 'http://delberthillcarrental.com/',
    phones: ['340-776-6637'],
  },
  { name: 'Cruz Bay Car Rentals', website: 'https://cruzbaycarrental.com/', phones: ['340-227-0138', '340-626-4552'] },
  {
    name: "Spencer's Jeep Rental",
    website: 'http://www.stjohntraveler.com/usvi/transportation/spencers-jeeps/',
    phones: ['340-693-8784', '888-776-6628'],
    separator: ' or ',
  },
]

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

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
  const page = pageSnapshots.stJohnCarRentals
  const heroImageUrl = buildWixImageUrl(page.imageGallery?.[0], { width: 1920, height: 1080 })
  const detailImageUrl = buildWixImageUrl(page.imageGallery?.[1], { width: 900, height: 1365 })
  const introParagraph = cleanText(page.leadParagraphs?.[0])
  const airportParagraph = cleanText(page.leadParagraphs?.[1])

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
          <h1>{page.h1}</h1>
          <p>Rent a car to explore all that St. John has to offer</p>
        </div>
      </section>

      <section className="st-john-car-rentals-directory">
        <div className="st-john-car-rentals-directory-inner">
          <div className="st-john-car-rentals-directory-grid">
            <div className="st-john-car-rentals-copy">
              <h2>{page.sectionHeadings?.[0] ?? 'Below are names and numbers of car rentals'}</h2>
              <p>{introParagraph}</p>

              <div className="st-john-car-rentals-list">
                {carRentalCompanies.map((company) => (
                  <p className="st-john-car-rentals-entry" key={company.name}>
                    {company.website ? (
                      <a className="st-john-car-rentals-name" href={company.website} rel="noreferrer" target="_blank">
                        {company.name}
                      </a>
                    ) : (
                      <span>{company.name}</span>
                    )}
                    {' '}
                    <PhoneLinks phones={company.phones} separator={company.separator ?? '/'} />
                  </p>
                ))}
              </div>

              <div className="st-john-car-rentals-notes">
                <p>{airportParagraph}</p>

                <p>
                  Budget Car Rental on St Thomas:{' '}
                  <PhoneLinks phones={['1-800-626-4516', '340-776-5774']} separator={' or '} />
                </p>

                <p>
                  Dependable Car Rental will allow their cars to go to St John also, but do not provide
                  service of vehicles on St John if it were to break down. They are 3 minutes from the
                  airport and offer a shuttle to and from.{' '}
                  <a className="st-john-car-rentals-phone" href="tel:18005223076">
                    1-800-522-3076
                  </a>
                </p>
              </div>
            </div>

            <div className="st-john-car-rentals-media">
              {detailImageUrl ? (
                <img
                  alt={page.imageGallery?.[1]?.alt || 'Red jeep on St. John road'}
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
