import { buildWixImageUrl } from '../lib/wixImage'

const heroImageAsset = {
  url: 'https://static.wixstatic.com/media/b5efc4_d0e7db6196774a62af289a3ccd8c7563~mv2.jpg/v1/fit/w_2500,h_1330,al_c/b5efc4_d0e7db6196774a62af289a3ccd8c7563~mv2.jpg',
  title: 'passenger-ferry-harbor.jpg',
}

const redHookOutbound = [
  '5:30 am (M-F)',
  '6:30 AM',
  '7:30 AM',
  '8:30 AM',
  '9:00 AM',
  '10:00 AM',
  '11:00 AM',
  'Noon',
  '1:00 PM',
  '2:00 PM',
  '3:00 PM',
  '4:00 PM',
  '5:00 PM',
  '6:00 PM',
  '7:00 PM',
  '8:00 PM',
  '9:00 PM',
  '10:00 PM',
  '11:00 PM',
  '11:30 PM',
]

const redHookInbound = [
  '6:30 AM',
  '7:30 AM',
  '8:30 AM',
  '9:00 AM',
  '10:00 AM',
  '11:00 AM',
  'Noon',
  '1:00 PM',
  '2:00 PM',
  '3:00 PM',
  '4:00 PM',
  '5:00 PM',
  '6:00 PM',
  '7:00 PM',
  '8:00 PM',
  '9:00 PM',
  '10:00 PM',
  '11:00 PM',
]

const crownBayOutbound = ['9:45 AM (Fri, Sat & Sun)', '2:15 PM (Fri, Sat & Sun)', '3:30 PM', '5:30 PM']
const crownBayInbound = ['8:30 AM (Fri, Sat & Sun)', '11:00 AM', '1:15 PM (Fri, Sat & Sun)', '4:15 PM']

const redHookRates = [
  'Adult (Non-Resident) One-way – $8.15',
  'Adult (Resident*) One-way – $6.00',
  'Senior (Resident*) One-way – $1.50',
  'Child (2–11) One-way $1.00',
  'Infants (under 2 years) – FREE',
  'Luggage/Box – $4.00 each',
]

function chunkTimes(times, chunkSize) {
  const chunks = []

  for (let index = 0; index < times.length; index += chunkSize) {
    chunks.push(times.slice(index, index + chunkSize))
  }

  return chunks
}

function DirectionBlock({ heading, times, chunkSize = 8 }) {
  return (
    <section className="passenger-ferry-direction">
      <h3>{heading}</h3>

      <div className="passenger-ferry-time-lines">
        {chunkTimes(times, chunkSize).map((line, index) => (
          <p key={`${heading}-${index}`}>{line.join(' – ')}</p>
        ))}
      </div>
    </section>
  )
}

export function PassengerFerryPage() {
  const heroImageUrl = buildWixImageUrl(heroImageAsset, { width: 1440, height: 720 })

  return (
    <article className="passenger-ferry-page">
      <div className="passenger-ferry-page-inner">
        <div className="passenger-ferry-hero">
          {heroImageUrl ? (
            <img
              alt="Passenger ferries docked in Cruz Bay"
              className="passenger-ferry-hero-image"
              decoding="async"
              fetchPriority="high"
              src={heroImageUrl}
            />
          ) : null}
        </div>

        <section className="passenger-ferry-block">
          <h1>
            <span>Passenger Ferry Schedule</span>
            <span>St. Thomas – St. John</span>
            <span>Red Hook Ferry</span>
            <span>Red Hook, St. Thomas – Cruz Bay, St. John</span>
          </h1>

          <div className="passenger-ferry-meta">
            <p>Operated by: Transportation Services and Varlack Ventures</p>
            <p>Telephone: (340) 776-6282 and (340) 776-6412</p>
            <p>Travel Time: 15 minutes</p>
          </div>

          <DirectionBlock heading="Red Hook → Cruz Bay" times={redHookOutbound} />
          <DirectionBlock heading="Cruz Bay → Red Hook" times={redHookInbound} />

          <section className="passenger-ferry-rates">
            <h2>Red Hook – Cruz Bay Ferry Rates</h2>

            <div className="passenger-ferry-rates-copy">
              {redHookRates.map((line) => (
                <p key={line}>{line}</p>
              ))}

              <p>* Valid USVI ID required for resident rates.</p>
              <p>Last Updated: 11/22/2023</p>
            </div>
          </section>
        </section>

        <section className="passenger-ferry-block passenger-ferry-block-secondary">
          <h2>Crown Bay Ferry</h2>
          <p className="passenger-ferry-route-line">(Route: Crown Bay, St. Thomas to Cruz Bay, St. John)</p>

          <div className="passenger-ferry-meta">
            <p>Operated by: Inter Island Boat Services</p>
            <p>Telephone: (340) 776-6597</p>
            <p>St. Thomas Ferry Landing: Crown Bay Marina</p>
            <p>St. John Ferry Landing: Victor William Sewer Marine Facility (AKA: The Creek)</p>
            <p>Travel Time: 35 minutes</p>
            <p>Note: Check-in is 30 minutes prior to departure time.</p>
          </div>

          <DirectionBlock heading="Crown Bay → Cruz Bay" times={crownBayOutbound} chunkSize={1} />
          <DirectionBlock heading="Cruz Bay → Crown Bay" times={crownBayInbound} chunkSize={1} />
        </section>
      </div>
    </article>
  )
}
