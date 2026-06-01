import { getContentImageSrc } from '../lib/contentAssets'
import { useSiteShellContent, useStructuredPageContent } from '../lib/useSiteContent'

export function AdvertisePage() {
  const siteShell = useSiteShellContent()
  const page = useStructuredPageContent('advertise')
  const heroImageUrl = getContentImageSrc(page.hero.image)
  const contactEmail = siteShell.contact.primaryEmail

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
      <section className="advertise-page-hero" style={heroImageUrl ? { backgroundImage: `url(${heroImageUrl})` } : undefined}>
        <div className="advertise-page-hero-inner">
          <h1>{page.hero.title}</h1>
        </div>
      </section>

      <section className="advertise-page-contact">
        <div className="advertise-page-contact-inner">
          <div className="advertise-page-copy">
            <h2>{page.contact.title}</h2>
            <h3>{page.contact.subtitle}</h3>

            {page.contact.bodyParagraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}

            <p className="advertise-page-booking-notice">{page.contact.bookingNotice}</p>
            <p>
              {page.contact.bookingHelpParts.before}
              <strong>{page.contact.bookingHelpParts.emphasis}</strong>
              {page.contact.bookingHelpParts.after}
            </p>

            <div className="advertise-page-contact-details">
              <h3>{page.contact.contactTitle}</h3>
              {page.contact.contactLines.map((line) => (
                <p key={line.label}>
                  {line.label}: {line.href ? <a href={line.href}>{line.value}</a> : line.value}
                </p>
              ))}
            </div>
          </div>

          <form className="advertise-page-form" onSubmit={handleSubmit}>
            <div className="advertise-page-form-grid">
              {page.form.fields.map((field) => (
                <label className="advertise-page-field" htmlFor={field.id} key={field.id}>
                  <span>
                    {field.label} <span aria-hidden="true">*</span>
                  </span>
                  <input id={field.id} name={field.name} placeholder={field.placeholder} required type={field.type} />
                </label>
              ))}

              <label className="advertise-page-field advertise-page-field--full" htmlFor="message">
                <span>
                  {page.form.messageField.label} <span aria-hidden="true">*</span>
                </span>
                <textarea
                  id={page.form.messageField.id}
                  name={page.form.messageField.name}
                  placeholder={page.form.messageField.placeholder}
                  required
                  rows={page.form.messageField.rows}
                />
              </label>
            </div>

            <button className="advertise-page-submit" type="submit">
              {page.form.submitLabel}
            </button>
          </form>
        </div>
      </section>
    </article>
  )
}
