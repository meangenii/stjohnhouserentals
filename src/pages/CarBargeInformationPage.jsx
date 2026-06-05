import { EditableImage, EditableLink, EditableText } from '../components/AdminInlinePageEdit'
import { getContentImageSrc } from '../lib/contentAssets'
import { useStructuredPageContent } from '../lib/useSiteContent'

function ScheduleBlock({ title, columns, notes = [], pathPrefix }) {
  return (
    <section className="car-barge-schedule-block">
      <EditableText as="h3" label={`${title} Schedule Title`} path={[...pathPrefix, 'title']} value={title}>
        {title}
      </EditableText>

      <div className="car-barge-schedule-columns">
        {columns.map((column, columnIndex) => (
          <div className="car-barge-schedule-column" key={`${title}-${column.heading}`}>
            <EditableText as="h4" label={`${column.heading} Heading`} path={[...pathPrefix, 'columns', columnIndex, 'heading']} value={column.heading}>
              {column.heading}
            </EditableText>

            <div className="car-barge-time-list">
              {column.times.map((time, timeIndex) => (
                <EditableText as="p" key={`${column.heading}-${time}`} label={`${column.heading} Time ${timeIndex + 1}`} path={[...pathPrefix, 'columns', columnIndex, 'times', timeIndex]} value={time}>
                  {time}
                </EditableText>
              ))}
            </div>
          </div>
        ))}
      </div>

      {notes.length ? (
        <div className="car-barge-schedule-notes">
          {notes.map((note, noteIndex) => (
            <EditableText as="p" key={`${title}-${note}`} label={`${title} Note ${noteIndex + 1}`} path={[...pathPrefix, 'notes', noteIndex]} value={note}>
              {note}
            </EditableText>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function RatesBlock({ heading, rows, footer, pathPrefix, url }) {
  return (
    <section className="car-barge-rates">
      <EditableText as="h3" label="Rates Heading" path={[...pathPrefix, 'heading']} value={heading}>
        {heading}
      </EditableText>

      <div className="car-barge-rates-copy">
        {rows.map((row, index) => (
          <div
            className={`car-barge-rates-row${row.label ? '' : ' is-values-only'}`}
            key={`${heading}-${row.label || 'values-only'}-${index}`}
          >
            {row.label ? (
              <EditableText as="span" className="car-barge-rates-row-label" label={`Rate Row ${index + 1} Label`} path={[...pathPrefix, 'rows', index, 'label']} value={row.label}>
                {row.label}
              </EditableText>
            ) : null}

            <div className="car-barge-rates-row-values">
              {row.values.map((value, valueIndex) => (
                <EditableText as="span" key={`${heading}-${row.label}-${value}`} label={`Rate Row ${index + 1} Value ${valueIndex + 1}`} path={[...pathPrefix, 'rows', index, 'values', valueIndex]} value={value}>
                  {value}
                </EditableText>
              ))}
            </div>
          </div>
        ))}

        <div className="car-barge-rates-footer">
          {footer.map((line, lineIndex) => (
            <EditableText as="p" key={`${heading}-${line}`} label={`Rates Footer ${lineIndex + 1}`} path={[...pathPrefix, 'footer', lineIndex]} value={line}>
              {line}
            </EditableText>
          ))}

          <EditableText as="a" href={url} label="Rates Link" path={[...pathPrefix, 'url']} value={url}>
            {url}
          </EditableText>
        </div>
      </div>
    </section>
  )
}

function BargeOperatorSection({ operator, operatorIndex }) {
  const imageUrl = getContentImageSrc(operator.image, { width: 820, height: 1240 })

  return (
    <section className="car-barge-operator">
      <div className="car-barge-operator-header">
        <EditableText as="h2" label="Operator Title" path={['operators', operatorIndex, 'title']} value={operator.title}>
          {operator.title}
        </EditableText>

        <div className="car-barge-operator-meta">
          <p>
            <strong>Barge Names:</strong>{' '}
            <EditableText as="span" label="Barge Names" path={['operators', operatorIndex, 'meta', 'names']} value={operator.meta.names}>
              {operator.meta.names}
            </EditableText>
          </p>
          <p>
            <strong>Telephone:</strong>{' '}
            <EditableText as="span" label="Operator Phone" path={['operators', operatorIndex, 'meta', 'phone']} value={operator.meta.phone}>
              {operator.meta.phone}
            </EditableText>
          </p>
          <p>
            <strong>Travel Time:</strong>{' '}
            <EditableText as="span" label="Travel Time" path={['operators', operatorIndex, 'meta', 'travelTime']} value={operator.meta.travelTime}>
              {operator.meta.travelTime}
            </EditableText>
          </p>
        </div>
      </div>

      <div className="car-barge-operator-grid">
        <div className="car-barge-operator-media">
          {imageUrl ? (
            <EditableImage
              alt={operator.image.alt}
              decoding="async"
              image={operator.image}
              path={['operators', operatorIndex, 'image']}
              loading="lazy"
              src={imageUrl}
            />
          ) : null}
        </div>

        <div className="car-barge-operator-content">
          {operator.schedules.map((schedule, scheduleIndex) => (
            <ScheduleBlock
              columns={schedule.columns}
              key={`${operator.title}-${schedule.title}`}
              notes={schedule.notes}
              pathPrefix={['operators', operatorIndex, 'schedules', scheduleIndex]}
              title={schedule.title}
            />
          ))}

          <RatesBlock
            footer={operator.rates.footer}
            heading={operator.rates.heading}
            pathPrefix={['operators', operatorIndex, 'rates']}
            rows={operator.rates.rows}
            url={operator.rates.url}
          />
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
            {heroImageUrl ? (
              <EditableImage
                alt={page.hero.image.alt || page.hero.title}
                decoding="async"
                fetchPriority="high"
                image={page.hero.image}
                path={['hero', 'image']}
                src={heroImageUrl}
              />
            ) : null}
          </div>

          <EditableText as="h1" label="Hero Title" multiline path={['hero', 'title']} rows={3} value={page.hero.title}>
            {page.hero.title}
          </EditableText>
        </section>

        <section className="car-barge-intro">
          <div className="car-barge-intro-grid">
            <div className="car-barge-intro-copy">
              <EditableText as="p" label="Left Paragraph 1" multiline path={['intro', 'leftParagraphs', 0]} rows={5} value={page.intro.leftParagraphs[0]}>
                {page.intro.leftParagraphs[0]}
              </EditableText>

              <div className="car-barge-fee-list">
                {page.intro.portAuthorityFees.map((fee, feeIndex) => (
                  <div className="car-barge-fee-row" key={fee.label}>
                    <EditableText as="span" label={`Port Fee ${feeIndex + 1} Label`} path={['intro', 'portAuthorityFees', feeIndex, 'label']} value={fee.label}>
                      {fee.label}
                    </EditableText>
                    <EditableText as="span" label={`Port Fee ${feeIndex + 1} Value`} path={['intro', 'portAuthorityFees', feeIndex, 'value']} value={fee.value}>
                      {fee.value}
                    </EditableText>
                  </div>
                ))}
              </div>

              {page.intro.leftParagraphs.slice(1).map((paragraph, index) => (
                <EditableText as="p" key={paragraph} label={`Left Paragraph ${index + 2}`} multiline path={['intro', 'leftParagraphs', index + 1]} rows={5} value={paragraph}>
                  {paragraph}
                </EditableText>
              ))}
            </div>

            <div className="car-barge-intro-copy">
              {page.intro.rightParagraphs.map((paragraph, index) => (
                <EditableText as="p" key={paragraph} label={`Right Paragraph ${index + 1}`} multiline path={['intro', 'rightParagraphs', index]} rows={5} value={paragraph}>
                  {paragraph}
                </EditableText>
              ))}

              <p>
                VI Now has more information.{' '}
                <EditableLink
                  className="car-barge-inline-link"
                  destination={page.intro.referenceLink.href}
                  destinationLabel="Reference Link"
                  destinationPath={['intro', 'referenceLink', 'href']}
                  external
                  label={page.intro.referenceLink.label}
                  labelLabel="Reference Label"
                  labelPath={['intro', 'referenceLink', 'label']}
                />
              </p>
            </div>
          </div>
        </section>

        {page.operators.map((operator, operatorIndex) => (
          <BargeOperatorSection key={operator.title} operator={operator} operatorIndex={operatorIndex} />
        ))}

        <section className="car-barge-note">
          <EditableText as="p" label="Page Note" multiline path={['note']} rows={4} value={page.note}>
            <strong>{page.note.split(':')[0]}:</strong> {page.note.split(':').slice(1).join(':').trim()}
          </EditableText>
        </section>
      </div>
    </article>
  )
}
