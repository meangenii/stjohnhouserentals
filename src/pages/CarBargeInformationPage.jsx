import { getContentImageSrc } from '../lib/contentAssets'
import { useStructuredPageContent } from '../lib/useSiteContent'

function ScheduleBlock({ title, columns, notes = [] }) {
  return (
    <section className="car-barge-schedule-block">
      <h3>{title}</h3>

      <div className="car-barge-schedule-columns">
        {columns.map((column) => (
          <div className="car-barge-schedule-column" key={`${title}-${column.heading}`}>
            <h4>{column.heading}</h4>

            <div className="car-barge-time-list">
              {column.times.map((time) => (
                <p key={`${column.heading}-${time}`}>{time}</p>
              ))}
            </div>
          </div>
        ))}
      </div>

      {notes.length ? (
        <div className="car-barge-schedule-notes">
          {notes.map((note) => (
            <p key={`${title}-${note}`}>{note}</p>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function RatesBlock({ heading, rows, footer, url }) {
  return (
    <section className="car-barge-rates">
      <h3>{heading}</h3>

      <div className="car-barge-rates-copy">
        {rows.map((row, index) => (
          <div
            className={`car-barge-rates-row${row.label ? '' : ' is-values-only'}`}
            key={`${heading}-${row.label || 'values-only'}-${index}`}
          >
            {row.label ? <span className="car-barge-rates-row-label">{row.label}</span> : null}

            <div className="car-barge-rates-row-values">
              {row.values.map((value) => (
                <span key={`${heading}-${row.label}-${value}`}>{value}</span>
              ))}
            </div>
          </div>
        ))}

        <div className="car-barge-rates-footer">
          {footer.map((line) => (
            <p key={`${heading}-${line}`}>{line}</p>
          ))}

          <a href={url} rel="noreferrer" target="_blank">
            {url}
          </a>
        </div>
      </div>
    </section>
  )
}

function BargeOperatorSection({ operator }) {
  const imageUrl = getContentImageSrc(operator.image, { width: 820, height: 1240 })

  return (
    <section className="car-barge-operator">
      <div className="car-barge-operator-header">
        <h2>{operator.title}</h2>

        <div className="car-barge-operator-meta">
          <p>
            <strong>Barge Names:</strong> {operator.meta.names}
          </p>
          <p>
            <strong>Telephone:</strong> {operator.meta.phone}
          </p>
          <p>
            <strong>Travel Time:</strong> {operator.meta.travelTime}
          </p>
        </div>
      </div>

      <div className="car-barge-operator-grid">
        <div className="car-barge-operator-media">
          {imageUrl ? <img alt={operator.image.alt} decoding="async" loading="lazy" src={imageUrl} /> : null}
        </div>

        <div className="car-barge-operator-content">
          {operator.schedules.map((schedule) => (
            <ScheduleBlock columns={schedule.columns} key={`${operator.title}-${schedule.title}`} notes={schedule.notes} title={schedule.title} />
          ))}

          <RatesBlock footer={operator.rates.footer} heading={operator.rates.heading} rows={operator.rates.rows} url={operator.rates.url} />
        </div>
      </div>
    </section>
  )
}

export function CarBargeInformationPage() {
  const page = useStructuredPageContent('carBargeInformation')
  const heroImageUrl = getContentImageSrc(page.hero.image, { width: 1440, height: 560 })

  return (
    <article className="car-barge-page">
      <div className="car-barge-page-inner">
        <section className="car-barge-hero">
          <div className="car-barge-hero-media">
            {heroImageUrl ? <img alt={page.hero.image.alt || page.hero.title} decoding="async" fetchPriority="high" src={heroImageUrl} /> : null}
          </div>

          <h1>{page.hero.title}</h1>
        </section>

        <section className="car-barge-intro">
          <div className="car-barge-intro-grid">
            <div className="car-barge-intro-copy">
              <p>{page.intro.leftParagraphs[0]}</p>

              <div className="car-barge-fee-list">
                {page.intro.portAuthorityFees.map((fee) => (
                  <div className="car-barge-fee-row" key={fee.label}>
                    <span>{fee.label}</span>
                    <span>{fee.value}</span>
                  </div>
                ))}
              </div>

              {page.intro.leftParagraphs.slice(1).map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>

            <div className="car-barge-intro-copy">
              {page.intro.rightParagraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}

              <p>
                VI Now has more information.{' '}
                <a className="car-barge-inline-link" href={page.intro.referenceLink.href} rel="noreferrer" target="_blank">
                  {page.intro.referenceLink.label}
                </a>
              </p>
            </div>
          </div>
        </section>

        {page.operators.map((operator) => (
          <BargeOperatorSection key={operator.title} operator={operator} />
        ))}

        <section className="car-barge-note">
          <p>
            <strong>{page.note.split(':')[0]}:</strong> {page.note.split(':').slice(1).join(':').trim()}
          </p>
        </section>
      </div>
    </article>
  )
}
