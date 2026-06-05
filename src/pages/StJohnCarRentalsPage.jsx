import { EditableBackgroundSection, EditableImage, EditableLink, EditableText } from '../components/AdminInlinePageEdit'
import { getContentImageSrc } from '../lib/contentAssets'
import { useStructuredPageContent } from '../lib/useSiteContent'

function PhoneLinks({ pathPrefix, phones, separator = '/' }) {
  return phones.map((phone, index) => (
    <span key={phone}>
      {index > 0 ? separator : ''}
      <EditableText
        as="a"
        className="st-john-car-rentals-phone"
        href={`tel:${phone.replace(/[^0-9+]/g, '')}`}
        label={`Phone ${index + 1}`}
        path={[...pathPrefix, index]}
        value={phone}
      >
        {phone}
      </EditableText>
    </span>
  ))
}

export function StJohnCarRentalsPage() {
  const page = useStructuredPageContent('stJohnCarRentals')
  const heroImageUrl = getContentImageSrc(page.hero.image, { width: 1920, height: 1080 })
  const detailImageUrl = getContentImageSrc(page.directory.detailImage, { width: 900, height: 1365 })

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
              <EditableText as="h2" label="Directory Title" multiline path={['directory', 'title']} rows={3} value={page.directory.title}>
                {page.directory.title}
              </EditableText>
              <EditableText as="p" label="Intro Paragraph" multiline path={['directory', 'introParagraph']} rows={5} value={page.directory.introParagraph}>
                {page.directory.introParagraph}
              </EditableText>

              <div className="st-john-car-rentals-list">
                {page.directory.companies.map((company, companyIndex) => (
                  <p className="st-john-car-rentals-entry" key={company.name}>
                    {company.website ? (
                      <EditableLink
                        className="st-john-car-rentals-name"
                        destination={company.website}
                        destinationLabel="Company Website"
                        destinationPath={['directory', 'companies', companyIndex, 'website']}
                        external
                        label={company.name}
                        labelLabel="Company Name"
                        labelPath={['directory', 'companies', companyIndex, 'name']}
                      />
                    ) : (
                      <EditableText as="span" label="Company Name" path={['directory', 'companies', companyIndex, 'name']} value={company.name}>
                        {company.name}
                      </EditableText>
                    )}{' '}
                    <PhoneLinks pathPrefix={['directory', 'companies', companyIndex, 'phones']} phones={company.phones} separator={company.separator ?? '/'} />
                  </p>
                ))}
              </div>

              <div className="st-john-car-rentals-notes">
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
                  <EditableText
                    as="a"
                    className="st-john-car-rentals-phone"
                    href={`tel:${page.directory.dependablePhone.replace(/[^0-9+]/g, '')}`}
                    label="Dependable Phone"
                    path={['directory', 'dependablePhone']}
                    value={page.directory.dependablePhone}
                  >
                    {page.directory.dependablePhone}
                  </EditableText>
                </p>
              </div>
            </div>

            <div className="st-john-car-rentals-media">
              {detailImageUrl ? (
                <EditableImage
                  alt={page.directory.detailImage.alt || 'Red jeep on St. John road'}
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
    </article>
  )
}
