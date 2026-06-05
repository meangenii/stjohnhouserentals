import { Fragment } from 'react'
import { EditableImage, EditableText } from '../components/AdminInlinePageEdit'
import { getContentImageSrc } from '../lib/contentAssets'
import { useStructuredPageContent } from '../lib/useSiteContent'

function chunkTimes(times, chunkSize) {
  const chunks = []

  for (let index = 0; index < times.length; index += chunkSize) {
    chunks.push(times.slice(index, index + chunkSize))
  }

  return chunks
}

function DirectionBlock({ direction, pathPrefix }) {
  const chunkSize = direction.chunkSize ?? 8

  return (
    <section className="passenger-ferry-direction">
      <EditableText as="h3" label="Direction Heading" path={[...pathPrefix, 'heading']} value={direction.heading}>
        {direction.heading}
      </EditableText>

      <div className="passenger-ferry-time-lines">
        {chunkTimes(direction.times, chunkSize).map((line, lineIndex) => (
          <p key={`${direction.heading}-${lineIndex}`}>
            {line.map((time, timeOffset) => {
              const timeIndex = lineIndex * chunkSize + timeOffset

              return (
                <Fragment key={`${direction.heading}-${timeIndex}`}>
                  {timeOffset > 0 ? ' - ' : null}
                  <EditableText as="span" label={`Time ${timeIndex + 1}`} path={[...pathPrefix, 'times', timeIndex]} value={time}>
                    {time}
                  </EditableText>
                </Fragment>
              )
            })}
          </p>
        ))}
      </div>
    </section>
  )
}

export function PassengerFerryPage() {
  const page = useStructuredPageContent('passengerFerry')
  const heroImageUrl = getContentImageSrc(page.hero.image, { width: 1440, height: 720 })

  return (
    <article className="passenger-ferry-page">
      <div className="passenger-ferry-page-inner">
        <div className="passenger-ferry-hero">
          {heroImageUrl ? (
            <EditableImage
              alt={page.hero.image.alt}
              className="passenger-ferry-hero-image"
              decoding="async"
              fetchPriority="high"
              image={page.hero.image}
              path={['hero', 'image']}
              src={heroImageUrl}
            />
          ) : null}
        </div>

        <section className="passenger-ferry-block">
          <h1>
            {page.redHook.titleLines.map((line, index) => (
              <EditableText as="span" key={`${index}-${line}`} label={`Red Hook Title Line ${index + 1}`} path={['redHook', 'titleLines', index]} value={line}>
                {line}
              </EditableText>
            ))}
          </h1>

          <div className="passenger-ferry-meta">
            {page.redHook.meta.map((line, index) => (
              <EditableText as="p" key={`${index}-${line}`} label={`Red Hook Meta ${index + 1}`} path={['redHook', 'meta', index]} value={line}>
                {line}
              </EditableText>
            ))}
          </div>

          {page.redHook.directions.map((direction, index) => (
            <DirectionBlock direction={direction} key={direction.heading} pathPrefix={['redHook', 'directions', index]} />
          ))}

          <section className="passenger-ferry-rates">
            <EditableText as="h2" label="Rates Title" path={['redHook', 'rates', 'title']} value={page.redHook.rates.title}>
              {page.redHook.rates.title}
            </EditableText>

            <div className="passenger-ferry-rates-copy">
              {page.redHook.rates.lines.map((line, index) => (
                <EditableText as="p" key={`${index}-${line}`} label={`Rates Line ${index + 1}`} path={['redHook', 'rates', 'lines', index]} value={line}>
                  {line}
                </EditableText>
              ))}
            </div>
          </section>
        </section>

        <section className="passenger-ferry-block passenger-ferry-block-secondary">
          <EditableText as="h2" label="Crown Bay Title" path={['crownBay', 'title']} value={page.crownBay.title}>
            {page.crownBay.title}
          </EditableText>
          <EditableText as="p" className="passenger-ferry-route-line" label="Route Line" multiline path={['crownBay', 'routeLine']} rows={3} value={page.crownBay.routeLine}>
            {page.crownBay.routeLine}
          </EditableText>

          <div className="passenger-ferry-meta">
            {page.crownBay.meta.map((line, index) => (
              <EditableText as="p" key={`${index}-${line}`} label={`Crown Bay Meta ${index + 1}`} path={['crownBay', 'meta', index]} value={line}>
                {line}
              </EditableText>
            ))}
          </div>

          {page.crownBay.directions.map((direction, index) => (
            <DirectionBlock direction={direction} key={direction.heading} pathPrefix={['crownBay', 'directions', index]} />
          ))}
        </section>
      </div>
    </article>
  )
}
