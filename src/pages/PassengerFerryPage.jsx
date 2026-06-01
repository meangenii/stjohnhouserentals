import { getContentImageSrc } from '../lib/contentAssets'
import { useStructuredPageContent } from '../lib/useSiteContent'

function chunkTimes(times, chunkSize) {
  const chunks = []

  for (let index = 0; index < times.length; index += chunkSize) {
    chunks.push(times.slice(index, index + chunkSize))
  }

  return chunks
}

function DirectionBlock({ direction }) {
  return (
    <section className="passenger-ferry-direction">
      <h3>{direction.heading}</h3>

      <div className="passenger-ferry-time-lines">
        {chunkTimes(direction.times, direction.chunkSize ?? 8).map((line, index) => (
          <p key={`${direction.heading}-${index}`}>{line.join(' - ')}</p>
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
            <img
              alt={page.hero.image.alt}
              className="passenger-ferry-hero-image"
              decoding="async"
              fetchPriority="high"
              src={heroImageUrl}
            />
          ) : null}
        </div>

        <section className="passenger-ferry-block">
          <h1>
            {page.redHook.titleLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </h1>

          <div className="passenger-ferry-meta">
            {page.redHook.meta.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>

          {page.redHook.directions.map((direction) => (
            <DirectionBlock direction={direction} key={direction.heading} />
          ))}

          <section className="passenger-ferry-rates">
            <h2>{page.redHook.rates.title}</h2>

            <div className="passenger-ferry-rates-copy">
              {page.redHook.rates.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </section>
        </section>

        <section className="passenger-ferry-block passenger-ferry-block-secondary">
          <h2>{page.crownBay.title}</h2>
          <p className="passenger-ferry-route-line">{page.crownBay.routeLine}</p>

          <div className="passenger-ferry-meta">
            {page.crownBay.meta.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>

          {page.crownBay.directions.map((direction) => (
            <DirectionBlock direction={direction} key={direction.heading} />
          ))}
        </section>
      </div>
    </article>
  )
}
