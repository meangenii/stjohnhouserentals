import { pageSnapshots } from '../content/siteSnapshot'

const fallbackContactEmail = 'stjohnlinks@gmail.com'
const bookingNotice = 'VISITORS TO ST JOHN - THIS IS NOT FOR BOOKING INQUIRIES.'
const formFields = [
  { id: 'firstName', label: 'Your First Name', name: 'firstName', placeholder: 'enter your first name', type: 'text' },
  { id: 'lastName', label: 'Your Last Name', name: 'lastName', placeholder: 'enter your last name', type: 'text' },
  { id: 'email', label: 'Your Email', name: 'email', placeholder: 'enter your email', type: 'email' },
  { id: 'subject', label: 'Subject', name: 'subject', placeholder: 'enter your subject', type: 'text' },
]

function decodeHtml(value) {
  return String(value ?? '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function getOriginalWixImageUrl(url) {
  const value = String(url ?? '').trim()

  if (!value) {
    return ''
  }

  const [sourceUrl] = value.split('/v1/')
  return sourceUrl
}

function getContentMatches(contentHtml, tagName) {
  return [...String(contentHtml ?? '').matchAll(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi'))].map((match) =>
    decodeHtml(match[1]),
  )
}

function getContactEmail() {
  const match = String(pageSnapshots.privacyPolicy?.contentHtml ?? '').match(/mailto:([^"]+)/i)
  return decodeURIComponent(match?.[1] ?? fallbackContactEmail)
}

export function AdvertisePage() {
  const page = pageSnapshots.advertise
  const heroImage = getOriginalWixImageUrl(page.imageGallery?.[0]?.url)
  const [sectionHeading = 'Advertising Your Property'] = getContentMatches(page.contentHtml, 'h3')
  const [sectionSubheading = 'Get in Touch with Our Team'] = getContentMatches(page.contentHtml, 'h5')
  const contentParagraphs = getContentMatches(page.contentHtml, 'p')
  const bodyParagraphs = contentParagraphs.slice(0, 2)
  const contactLines = contentParagraphs.slice(-3)
  const visibleContactLines = contactLines.filter((line) => !line.startsWith('Contact Us'))
  const contactEmail = getContactEmail()

  function handleSubmit(event) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const firstName = String(formData.get('firstName') ?? '').trim()
    const lastName = String(formData.get('lastName') ?? '').trim()
    const email = String(formData.get('email') ?? '').trim()
    const subject = String(formData.get('subject') ?? '').trim()
    const message = String(formData.get('message') ?? '').trim()

    const composedSubject = subject || `Advertising inquiry from ${firstName} ${lastName}`.trim()
    const composedBody = [
      `First name: ${firstName}`,
      `Last name: ${lastName}`,
      `Email: ${email}`,
      '',
      message,
    ].join('\n')

    window.location.href = `mailto:${contactEmail}?subject=${encodeURIComponent(composedSubject)}&body=${encodeURIComponent(composedBody)}`
  }

  return (
    <article className="advertise-page">
      <section className="advertise-page-hero" style={heroImage ? { backgroundImage: `url(${heroImage})` } : undefined}>
        <div className="advertise-page-hero-inner">
          <h1>{page.h1}</h1>
        </div>
      </section>

      <section className="advertise-page-contact">
        <div className="advertise-page-contact-inner">
          <div className="advertise-page-copy">
            <h2>{sectionHeading}</h2>
            <h3>{sectionSubheading}</h3>

            {bodyParagraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}

            <p className="advertise-page-booking-notice">{bookingNotice}</p>
            <p>
              If you are interested in information on or booking a villa, please,{' '}
              <strong>communicate directly with St John Owners/Managers</strong> from the page of each vacation rental home of interest.
              The email link or phone number on each vacation rental page will get you directly to the person who can help!
            </p>

            <div className="advertise-page-contact-details">
              <h3>Contact Us</h3>
              {visibleContactLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>

          <form className="advertise-page-form" onSubmit={handleSubmit}>
            <div className="advertise-page-form-grid">
              {formFields.map((field) => (
                <label className="advertise-page-field" htmlFor={field.id} key={field.id}>
                  <span>
                    {field.label} <span aria-hidden="true">*</span>
                  </span>
                  <input id={field.id} name={field.name} placeholder={field.placeholder} required type={field.type} />
                </label>
              ))}

              <label className="advertise-page-field advertise-page-field--full" htmlFor="message">
                <span>
                  Your Message <span aria-hidden="true">*</span>
                </span>
                <textarea id="message" name="message" placeholder="enter your message" required rows="6" />
              </label>
            </div>

            <button className="advertise-page-submit" type="submit">
              Send Message
            </button>
          </form>
        </div>
      </section>
    </article>
  )
}
