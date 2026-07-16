import { formatPhoneNumber } from '../lib/contactLinks'

export function PropertyAvailabilityFallback({ contactActions = [], contactInfo }) {
  const hasContactInfo = Boolean(contactInfo?.contactName || contactInfo?.email || contactInfo?.phone || contactInfo?.note)

  return (
    <div className="property-availability-fallback">
      <p className="property-availability-fallback-title">Contact for availability.</p>

      {hasContactInfo ? (
        <dl className="property-availability-contact-list">
          {contactInfo.contactName ? (
            <div>
              <dt>Contact</dt>
              <dd>{contactInfo.contactName}</dd>
            </div>
          ) : null}

          {contactInfo.email ? (
            <div>
              <dt>Email</dt>
              <dd>
                {contactInfo.emailHref ? <a href={contactInfo.emailHref}>{contactInfo.email}</a> : contactInfo.email}
              </dd>
            </div>
          ) : null}

          {contactInfo.phone ? (
            <div>
              <dt>Phone</dt>
              <dd>
                {contactInfo.phoneHref ? <a href={contactInfo.phoneHref}>{formatPhoneNumber(contactInfo.phone)}</a> : formatPhoneNumber(contactInfo.phone)}
              </dd>
            </div>
          ) : null}

          {contactInfo.note ? (
            <div>
              <dt>Note</dt>
              <dd>{contactInfo.note}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {contactActions.length > 0 ? (
        <div className="property-contact-actions property-contact-actions--availability">
          {contactActions.map((action) => (
            <a className={`button-link ${action.toneClassName} property-contact-button`.trim()} href={action.href} key={action.key}>
              {action.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  )
}
