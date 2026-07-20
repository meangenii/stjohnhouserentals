import { EditableImage, EditableLink, EditableText } from '../components/AdminInlinePageEdit'
import { EditablePhoneText } from '../components/EditablePhoneText'
import { PageLoadingState } from '../components/PageLoadingState'
import { getContentImageSrc } from '../lib/contentAssets'
import { useStructuredPageContent } from '../lib/useSiteContent'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function asText(value) {
  return value == null ? '' : String(value)
}

function ScheduleBlock({ title, columns, notes = [], pathPrefix = [] }) {
  const scheduleTitle = asText(title)
  const scheduleColumns = asArray(columns)
  const scheduleNotes = asArray(notes)

  return (
    <section className="car-barge-schedule-block">
      <EditableText as="h3" label={`${scheduleTitle} Schedule Title`} path={[...pathPrefix, 'title']} value={scheduleTitle}>
        {scheduleTitle}
      </EditableText>

      <div className="car-barge-schedule-columns">
        {scheduleColumns.map((column, columnIndex) => {
          const columnRecord = asObject(column)
          const columnHeading = asText(columnRecord.heading)
          const columnTimes = asArray(columnRecord.times)

          return (
            <div className="car-barge-schedule-column" key={columnIndex}>
              <EditableText as="h4" label={`${columnHeading} Heading`} path={[...pathPrefix, 'columns', columnIndex, 'heading']} value={columnHeading}>
                {columnHeading}
              </EditableText>

              <div className="car-barge-time-list">
                {columnTimes.map((time, timeIndex) => {
                  const timeText = asText(time)

                  return (
                    <EditableText as="p" key={timeIndex} label={`${columnHeading} Time ${timeIndex + 1}`} path={[...pathPrefix, 'columns', columnIndex, 'times', timeIndex]} value={timeText}>
                      {timeText}
                    </EditableText>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {scheduleNotes.length ? (
        <div className="car-barge-schedule-notes">
          {scheduleNotes.map((note, noteIndex) => {
            const noteText = asText(note)

            return (
              <EditableText as="p" key={noteIndex} label={`${scheduleTitle} Note ${noteIndex + 1}`} path={[...pathPrefix, 'notes', noteIndex]} value={noteText}>
                {noteText}
              </EditableText>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}

function RatesBlock({ heading, link, linkLabel, rows, footer, pathPrefix = [], url }) {
  const ratesHeading = asText(heading)
  const rateRows = asArray(rows)
  const rateFooter = asArray(footer)
  const ratesUrl = asText(url)
  const ratesLinkLabel = asText(linkLabel) || 'Visit operator website'

  return (
    <section className="car-barge-rates">
      <EditableText as="h3" label="Rates Heading" path={[...pathPrefix, 'heading']} value={ratesHeading}>
        {ratesHeading}
      </EditableText>

      <div className="car-barge-rates-copy">
        {rateRows.map((row, index) => {
          const rowRecord = asObject(row)
          const rowLabel = asText(rowRecord.label)
          const rowValues = asArray(rowRecord.values)

          return (
            <div className={`car-barge-rates-row${rowLabel ? '' : ' is-values-only'}`} key={index}>
              {rowLabel ? (
                <EditableText as="span" className="car-barge-rates-row-label" label={`Rate Row ${index + 1} Label`} path={[...pathPrefix, 'rows', index, 'label']} value={rowLabel}>
                  {rowLabel}
                </EditableText>
              ) : null}

              <div className="car-barge-rates-row-values">
                {rowValues.map((value, valueIndex) => {
                  const valueText = asText(value)

                  return (
                    <EditableText as="span" key={valueIndex} label={`Rate Row ${index + 1} Value ${valueIndex + 1}`} path={[...pathPrefix, 'rows', index, 'values', valueIndex]} value={valueText}>
                      {valueText}
                    </EditableText>
                  )
                })}
              </div>
            </div>
          )
        })}

        <div className="car-barge-rates-footer">
          {rateFooter.map((line, lineIndex) => {
            const lineText = asText(line)

            return (
              <EditableText as="p" key={lineIndex} label={`Rates Footer ${lineIndex + 1}`} path={[...pathPrefix, 'footer', lineIndex]} value={lineText}>
                {lineText}
              </EditableText>
            )
          })}

          {ratesUrl ? (
            <EditableLink
              destination={ratesUrl}
              destinationField="url"
              destinationLabel="Rates Website URL"
              destinationPath={[...pathPrefix, 'url']}
              external
              link={asObject(link)}
              linkPath={pathPrefix}
              label={ratesLinkLabel}
              labelLabel="Rates Website Link Text"
              labelPath={[...pathPrefix, 'linkLabel']}
            />
          ) : null}
        </div>
      </div>
    </section>
  )
}

function BargeOperatorSection({ operator, operatorIndex }) {
  const operatorRecord = asObject(operator)
  const operatorImage = asObject(operatorRecord.image)
  const operatorMeta = asObject(operatorRecord.meta)
  const operatorRates = asObject(operatorRecord.rates)
  const operatorSchedules = asArray(operatorRecord.schedules)
  const operatorTitle = asText(operatorRecord.title)
  const imageUrl = getContentImageSrc(operatorImage, { width: 820, height: 1240 })

  return (
    <section className="car-barge-operator">
      <div className="car-barge-operator-header">
        <EditableText as="h2" label="Operator Title" path={['operators', operatorIndex, 'title']} value={operatorTitle}>
          {operatorTitle}
        </EditableText>

        <div className="car-barge-operator-meta">
          <p>
            <strong>Barge Names:</strong>{' '}
            <EditableText as="span" label="Barge Names" path={['operators', operatorIndex, 'meta', 'names']} value={asText(operatorMeta.names)}>
              {asText(operatorMeta.names)}
            </EditableText>
          </p>
          <p>
            <strong>Telephone:</strong>{' '}
            <EditablePhoneText label="Operator Phone" path={['operators', operatorIndex, 'meta', 'phone']} value={asText(operatorMeta.phone)} />
          </p>
          <p>
            <strong>Travel Time:</strong>{' '}
            <EditableText as="span" label="Travel Time" path={['operators', operatorIndex, 'meta', 'travelTime']} value={asText(operatorMeta.travelTime)}>
              {asText(operatorMeta.travelTime)}
            </EditableText>
          </p>
        </div>
      </div>

      <div className="car-barge-operator-grid">
        <div className="car-barge-operator-media">
          {imageUrl ? (
            <EditableImage
              alt={asText(operatorImage.alt) || operatorTitle}
              decoding="async"
              image={operatorImage}
              path={['operators', operatorIndex, 'image']}
              loading="lazy"
              src={imageUrl}
            />
          ) : null}
        </div>

        <div className="car-barge-operator-content">
          {operatorSchedules.map((schedule, scheduleIndex) => {
            const scheduleRecord = asObject(schedule)

            return (
              <ScheduleBlock
                columns={scheduleRecord.columns}
                key={scheduleIndex}
                notes={scheduleRecord.notes}
                pathPrefix={['operators', operatorIndex, 'schedules', scheduleIndex]}
                title={scheduleRecord.title}
              />
            )
          })}

          <RatesBlock
            footer={operatorRates.footer}
            heading={operatorRates.heading}
            link={operatorRates}
            linkLabel={operatorRates.linkLabel}
            pathPrefix={['operators', operatorIndex, 'rates']}
            rows={operatorRates.rows}
            url={operatorRates.url}
          />
        </div>
      </div>
    </section>
  )
}

export function CarBargeInformationPage() {
  const page = useStructuredPageContent('carBargeInformation')

  if (!page) {
    return <PageLoadingState />
  }

  const hero = asObject(page.hero)
  const heroImage = asObject(hero.image)
  const intro = asObject(page.intro)
  const leftParagraphs = asArray(intro.leftParagraphs)
  const rightParagraphs = asArray(intro.rightParagraphs)
  const portAuthorityFees = asArray(intro.portAuthorityFees)
  const referenceLink = asObject(intro.referenceLink)
  const referenceHref = asText(referenceLink.href)
  const referenceLabel = asText(referenceLink.label) || (referenceHref ? 'Link for information is here.' : '')
  const operators = asArray(page.operators)
  const note = asText(page.note)
  const heroTitle = asText(hero.title) || asText(page.title) || 'Car Barge Information'
  const heroImageUrl = getContentImageSrc(heroImage, { width: 1920, height: 720 })
  const firstLeftParagraph = asText(leftParagraphs[0])

  return (
    <article className="car-barge-page">
      <section className="car-barge-hero">
        <div className="car-barge-hero-media">
          {heroImageUrl ? (
            <EditableImage
              alt={asText(heroImage.alt) || heroTitle}
              decoding="async"
              fetchPriority="high"
              image={heroImage}
              path={['hero', 'image']}
              src={heroImageUrl}
            />
          ) : null}
        </div>

        <EditableText as="h1" label="Hero Title" multiline path={['hero', 'title']} rows={3} value={heroTitle}>
          {heroTitle}
        </EditableText>
      </section>

      <div className="car-barge-page-inner">
        <section className="car-barge-intro">
          <div className="car-barge-intro-grid">
            <div className="car-barge-intro-copy">
              <EditableText as="p" label="Left Paragraph 1" multiline path={['intro', 'leftParagraphs', 0]} rows={5} value={firstLeftParagraph}>
                {firstLeftParagraph}
              </EditableText>

              <div className="car-barge-fee-list">
                {portAuthorityFees.map((fee, feeIndex) => {
                  const feeRecord = asObject(fee)
                  const feeLabel = asText(feeRecord.label)
                  const feeValue = asText(feeRecord.value)

                  return (
                    <div className="car-barge-fee-row" key={feeIndex}>
                      <EditableText as="span" label={`Port Fee ${feeIndex + 1} Label`} path={['intro', 'portAuthorityFees', feeIndex, 'label']} value={feeLabel}>
                        {feeLabel}
                      </EditableText>
                      <EditableText as="span" label={`Port Fee ${feeIndex + 1} Value`} path={['intro', 'portAuthorityFees', feeIndex, 'value']} value={feeValue}>
                        {feeValue}
                      </EditableText>
                    </div>
                  )
                })}
              </div>

              {leftParagraphs.slice(1).map((paragraph, index) => {
                const paragraphText = asText(paragraph)

                return (
                  <EditableText as="p" key={index} label={`Left Paragraph ${index + 2}`} multiline path={['intro', 'leftParagraphs', index + 1]} rows={5} value={paragraphText}>
                    {paragraphText}
                  </EditableText>
                )
              })}
            </div>

            <div className="car-barge-intro-copy">
              {rightParagraphs.map((paragraph, index) => {
                const paragraphText = asText(paragraph)

                return (
                  <EditableText as="p" key={index} label={`Right Paragraph ${index + 1}`} multiline path={['intro', 'rightParagraphs', index]} rows={5} value={paragraphText}>
                    {paragraphText}
                  </EditableText>
                )
              })}

              {referenceHref || referenceLabel ? (
                <p>
                  VI Now has more information.{' '}
                  <EditableLink
                    className="car-barge-inline-link"
                    destination={referenceHref}
                    destinationLabel="Reference Link"
                    destinationPath={['intro', 'referenceLink', 'href']}
                    external
                    link={referenceLink}
                    linkPath={['intro', 'referenceLink']}
                    label={referenceLabel}
                    labelLabel="Reference Label"
                    labelPath={['intro', 'referenceLink', 'label']}
                  />
                </p>
              ) : null}
            </div>
          </div>
        </section>

        {operators.map((operator, operatorIndex) => (
          <BargeOperatorSection key={operatorIndex} operator={operator} operatorIndex={operatorIndex} />
        ))}

        {note ? (
          <section className="car-barge-note">
            <EditableText as="p" label="Page Note" multiline path={['note']} rows={4} value={note}>
              {note}
            </EditableText>
          </section>
        ) : null}
      </div>
    </article>
  )
}
