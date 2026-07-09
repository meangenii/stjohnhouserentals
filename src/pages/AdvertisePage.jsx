import { useState } from 'react'
import { EditableBackgroundSection, EditableButton, EditableLink, EditableText } from '../components/AdminInlinePageEdit'
import { PageLoadingState } from '../components/PageLoadingState'
import { getContentImageSrc } from '../lib/contentAssets'
import { submitAdvertiseInquiry } from '../lib/advertiseInquiryApi'
import { useSiteShellContent, useStructuredPageContent } from '../lib/useSiteContent'

function buildMailtoHref(contactEmail, { firstName, lastName, email, subject, message }) {
  const composedSubject = subject || `Advertising inquiry from ${firstName} ${lastName}`.trim()
  const composedBody = [`First name: ${firstName}`, `Last name: ${lastName}`, `Email: ${email}`, '', message].join('\n')

  return `mailto:${contactEmail}?subject=${encodeURIComponent(composedSubject)}&body=${encodeURIComponent(composedBody)}`
}

export function AdvertisePage() {
  const siteShell = useSiteShellContent()
  const page = useStructuredPageContent('advertise')
  const [submitStatus, setSubmitStatus] = useState('idle')
  const [submitMessage, setSubmitMessage] = useState('')
  const [manualSubmitHref, setManualSubmitHref] = useState('')

  if (!siteShell || !page) {
    return <PageLoadingState />
  }

  const heroImageUrl = getContentImageSrc(page.hero.image)
  const contactEmail = siteShell.contact.primaryEmail

  async function handleSubmit(event) {
    event.preventDefault()

    const form = event.currentTarget
    const formData = new FormData(form)
    const firstName = String(formData.get('firstName') ?? '').trim()
    const lastName = String(formData.get('lastName') ?? '').trim()
    const email = String(formData.get('email') ?? '').trim()
    const subject = String(formData.get('subject') ?? '').trim()
    const message = String(formData.get('message') ?? '').trim()
    const website = String(formData.get('website') ?? '').trim()
    const fallbackHref = contactEmail
      ? buildMailtoHref(contactEmail, {
          firstName,
          lastName,
          email,
          subject,
          message,
        })
      : ''

    setSubmitStatus('submitting')
    setSubmitMessage('')
    setManualSubmitHref('')

    try {
      const result = await submitAdvertiseInquiry({
        firstName,
        lastName,
        email,
        subject,
        message,
        website,
      })

      form.reset()
      if (result?.inquiry?.accepted) {
        setSubmitStatus('success')
        setSubmitMessage('Thanks. Your advertising inquiry has been received.')
      } else {
        setSubmitStatus('error')
        setSubmitMessage('We could not send your inquiry right now.')
      }
    } catch (error) {
      setSubmitStatus('error')
      setSubmitMessage(error instanceof Error ? error.message : 'We could not send your inquiry right now.')
      setManualSubmitHref(fallbackHref)
    }
  }

  return (
    <article className="advertise-page">
      <EditableBackgroundSection
        as="section"
        className="advertise-page-hero"
        image={page.hero.image}
        path={['hero', 'image']}
        style={heroImageUrl ? { backgroundImage: `url(${heroImageUrl})` } : undefined}
      >
        <div className="advertise-page-hero-inner">
          <EditableText as="h1" label="Hero Title" multiline path={['hero', 'title']} rows={3} value={page.hero.title}>
            {page.hero.title}
          </EditableText>
        </div>
      </EditableBackgroundSection>

      <section className="advertise-page-contact">
        <div className="advertise-page-contact-inner">
          <div className="advertise-page-copy">
            <EditableText as="h2" label="Contact Title" multiline path={['contact', 'title']} rows={3} value={page.contact.title}>
              {page.contact.title}
            </EditableText>
            <EditableText as="h3" label="Contact Subtitle" multiline path={['contact', 'subtitle']} rows={4} value={page.contact.subtitle}>
              {page.contact.subtitle}
            </EditableText>

            {page.contact.bodyParagraphs.map((paragraph, index) => (
              <EditableText as="p" key={index} label={`Body Paragraph ${index + 1}`} multiline path={['contact', 'bodyParagraphs', index]} rows={5} value={paragraph}>
                {paragraph}
              </EditableText>
            ))}

            <EditableText as="p" className="advertise-page-booking-notice" label="Booking Notice" multiline path={['contact', 'bookingNotice']} rows={4} value={page.contact.bookingNotice}>
              {page.contact.bookingNotice}
            </EditableText>
            <p>
              <EditableText as="span" label="Booking Help Before" multiline path={['contact', 'bookingHelpParts', 'before']} rows={4} value={page.contact.bookingHelpParts.before}>
                {page.contact.bookingHelpParts.before}
              </EditableText>
              <strong>
                <EditableText as="span" label="Booking Help Emphasis" path={['contact', 'bookingHelpParts', 'emphasis']} value={page.contact.bookingHelpParts.emphasis}>
                  {page.contact.bookingHelpParts.emphasis}
                </EditableText>
              </strong>
              <EditableText as="span" label="Booking Help After" multiline path={['contact', 'bookingHelpParts', 'after']} rows={4} value={page.contact.bookingHelpParts.after}>
                {page.contact.bookingHelpParts.after}
              </EditableText>
            </p>

            <div className="advertise-page-contact-details">
              <EditableText as="h3" label="Contact Section Title" path={['contact', 'contactTitle']} value={page.contact.contactTitle}>
                {page.contact.contactTitle}
              </EditableText>
              {page.contact.contactLines.map((line, index) => (
                <p key={index}>
                  <EditableText as="span" label={`Contact Label ${index + 1}`} path={['contact', 'contactLines', index, 'label']} value={line.label}>
                    {line.label}
                  </EditableText>
                  {': '}
                  {line.href ? (
                    <EditableLink
                      destination={line.href}
                      destinationLabel="Contact Link"
                      destinationPath={['contact', 'contactLines', index, 'href']}
                      external={!line.href.startsWith('/')}
                      link={line}
                      linkPath={['contact', 'contactLines', index]}
                      label={line.value}
                      labelLabel="Contact Value"
                      labelPath={['contact', 'contactLines', index, 'value']}
                    />
                  ) : (
                    <EditableText as="span" label={`Contact Value ${index + 1}`} path={['contact', 'contactLines', index, 'value']} value={line.value}>
                      {line.value}
                    </EditableText>
                  )}
                </p>
              ))}
            </div>
          </div>

          <form className="advertise-page-form" onSubmit={handleSubmit}>
            <label aria-hidden="true" className="advertise-page-honeypot" htmlFor="website">
              <span>Website</span>
              <input autoComplete="off" id="website" name="website" tabIndex={-1} type="text" />
            </label>

            <div className="advertise-page-form-grid">
              {page.form.fields.map((field, index) => (
                <label className="advertise-page-field" htmlFor={field.id} key={field.id}>
                  <span>
                    <EditableText as="span" label={`Field Label ${index + 1}`} path={['form', 'fields', index, 'label']} value={field.label}>
                      {field.label}
                    </EditableText>{' '}
                    <span aria-hidden="true">*</span>
                  </span>
                  <input
                    disabled={submitStatus === 'submitting'}
                    id={field.id}
                    name={field.name}
                    placeholder={field.placeholder}
                    required
                    type={field.type}
                  />
                </label>
              ))}

              <label className="advertise-page-field advertise-page-field--full" htmlFor="message">
                <span>
                  <EditableText as="span" label="Message Field Label" path={['form', 'messageField', 'label']} value={page.form.messageField.label}>
                    {page.form.messageField.label}
                  </EditableText>{' '}
                  <span aria-hidden="true">*</span>
                </span>
                <textarea
                  id={page.form.messageField.id}
                  disabled={submitStatus === 'submitting'}
                  name={page.form.messageField.name}
                  placeholder={page.form.messageField.placeholder}
                  required
                  rows={page.form.messageField.rows}
                />
              </label>
            </div>

            <EditableButton
              className="advertise-page-submit"
              label={page.form.submitLabel}
              labelLabel="Submit Button Text"
              labelPath={['form', 'submitLabel']}
              disabled={submitStatus === 'submitting'}
              type="submit"
            />

            <p className="advertise-page-form-note">
              Your message is sent through this website. If you prefer, email{' '}
              <a href={`mailto:${contactEmail}`}>{contactEmail}</a>{' '}
              directly.
            </p>

            {submitMessage ? (
              <p
                aria-live="polite"
                className={`advertise-page-form-feedback advertise-page-form-feedback--${submitStatus === 'error' ? 'error' : 'success'}`}
              >
                {submitMessage}
              </p>
            ) : null}

            {manualSubmitHref ? (
              <p aria-live="polite" className="advertise-page-form-note advertise-page-form-note--fallback">
                If the website submission is unavailable, use the pre-filled fallback link:{' '}
                <a href={manualSubmitHref}>Send your advertising inquiry</a>.
              </p>
            ) : null}
          </form>
        </div>
      </section>
    </article>
  )
}
