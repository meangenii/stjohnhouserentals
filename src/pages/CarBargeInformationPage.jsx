import { pageSnapshots } from '../content/siteSnapshot'
import { buildWixImageUrl } from '../lib/wixImage'

const introFees = [
  { label: 'Small Vehicles', value: '$3' },
  { label: 'Large Vehicles', value: '$4' },
]

const loveCityWeekdayOutbound = [
  '**6:15 AM – *6:30 AM',
  '8:00 AM – 8:30 AM',
  '10:00 AM – 10:30 AM',
  'Noon – 12:30 PM',
  '2:00 PM – 2:30 PM',
  '4:00 PM – *4:30 PM',
  '6:15 PM – *6:30 PM',
]

const loveCityWeekdayInbound = [
  '**7:00 AM – *7:30 AM',
  '9:00 AM – 9:30 AM',
  '11:00 AM – 11:30 AM',
  '1:00 PM – 1:30 PM',
  '3:00 PM – 3:30 PM',
  '5:00 PM – *5:30 PM',
  '7:00 PM – *7:30 PM',
]

const loveCityWeekendOutbound = ['8:00 AM', '10:00 AM', 'Noon', '2:00 PM', '4:00 PM', '6:15 PM']
const loveCityWeekendInbound = ['9:00 AM', '11:00 AM', '1:00 PM', '3:00 PM', '5:00 PM', '7:00 PM']
const bigRedOutbound = ['6:00 AM', '7:30 AM', '9:30 AM', '11:30 AM', '1:30 PM', '3:30 PM', '5:30 PM']
const bigRedInbound = ['6:30 AM', '8:30 AM', '10:30 AM', '12:30 PM', '2:30 PM', '4:30 PM', '6:30 PM']

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseCompanyMeta(value) {
  const text = cleanText(value)

  return {
    names: text.match(/Barge Names:\s*(.*?)\s*Telephone:/i)?.[1] ?? '',
    phone: text.match(/Telephone:\s*(.*?)\s*Travel Time:/i)?.[1] ?? '',
    travelTime: text.match(/Travel Time:\s*(.*)$/i)?.[1] ?? '',
  }
}

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

function BargeOperatorSection({ title, meta, imageUrl, imageAlt, schedules, rates }) {
  return (
    <section className="car-barge-operator">
      <div className="car-barge-operator-header">
        <h2>{title}</h2>

        <div className="car-barge-operator-meta">
          <p>
            <strong>Barge Names:</strong> {meta.names}
          </p>
          <p>
            <strong>Telephone:</strong> {meta.phone}
          </p>
          <p>
            <strong>Travel Time:</strong> {meta.travelTime}
          </p>
        </div>
      </div>

      <div className="car-barge-operator-grid">
        <div className="car-barge-operator-media">
          {imageUrl ? <img alt={imageAlt} decoding="async" loading="lazy" src={imageUrl} /> : null}
        </div>

        <div className="car-barge-operator-content">
          {schedules.map((schedule) => (
            <ScheduleBlock columns={schedule.columns} key={`${title}-${schedule.title}`} notes={schedule.notes} title={schedule.title} />
          ))}

          <RatesBlock footer={rates.footer} heading={rates.heading} rows={rates.rows} url={rates.url} />
        </div>
      </div>
    </section>
  )
}

export function CarBargeInformationPage() {
  const page = pageSnapshots.carBargeInformation
  const loveCityMeta = parseCompanyMeta(page.sectionHeadings?.[1])
  const bigRedMeta = parseCompanyMeta(page.sectionHeadings?.[3])
  const heroImageUrl = buildWixImageUrl(page.imageGallery?.[0], { width: 1440, height: 560 })
  const loveCityImageUrl = buildWixImageUrl(page.imageGallery?.[2], { width: 820, height: 1240 })
  const bigRedImageUrl = buildWixImageUrl(page.imageGallery?.[3], { width: 820, height: 1240 })
  const vinowUrl =
    String(page.leadParagraphs?.[0] ?? '').startsWith('http')
      ? page.leadParagraphs[0]
      : 'https://www.vinow.com/stjohn/getting_there/car-ferry-st-thomas-and-st-john/'

  const loveCitySchedules = [
    {
      title: 'Monday–Friday',
      columns: [
        {
          heading: 'Enighed Pond (St. John) → Red Hook (St. Thomas)',
          times: loveCityWeekdayOutbound,
        },
        {
          heading: 'Red Hook (St. Thomas) → Enighed Pond (St. John)',
          times: loveCityWeekdayInbound,
        },
      ],
      notes: ['*Seasonal', '**Not on Weekends or Holidays'],
    },
    {
      title: 'Saturday–Sunday & Holidays',
      columns: [
        {
          heading: 'Enighed Pond (St. John) → Red Hook (St. Thomas)',
          times: loveCityWeekendOutbound,
        },
        {
          heading: 'Red Hook (St. Thomas) → Enighed Pond (St. John)',
          times: loveCityWeekendInbound,
        },
      ],
    },
  ]

  const bigRedSchedules = [
    {
      title: 'Monday–Sunday',
      columns: [
        {
          heading: 'Departing from Cruz Bay, St. John:',
          times: bigRedOutbound,
        },
        {
          heading: 'Departing from Red Hook, St. Thomas:',
          times: bigRedInbound,
        },
      ],
    },
  ]

  return (
    <article className="car-barge-page">
      <div className="car-barge-page-inner">
        <section className="car-barge-hero">
          <div className="car-barge-hero-media">
            {heroImageUrl ? (
              <img
                alt={page.imageGallery?.[0]?.alt || page.h1}
                decoding="async"
                fetchPriority="high"
                src={heroImageUrl}
              />
            ) : null}
          </div>

          <h1>{page.h1}</h1>
        </section>

        <section className="car-barge-intro">
          <div className="car-barge-intro-grid">
            <div className="car-barge-intro-copy">
              <p>
                Before you get onto the car barge heading to St. John, in Red Hook, make sure to stop at the
                small booth at the entrance to pay the Port Authority Fee.
              </p>

              <div className="car-barge-fee-list">
                {introFees.map((fee) => (
                  <div className="car-barge-fee-row" key={fee.label}>
                    <span>{fee.label}</span>
                    <span>{fee.value}</span>
                  </div>
                ))}
              </div>

              <p>
                Get your ticket and drive into the large parking lot. An employee will guide you to your
                parking spot. You will wait in this spot until it is your turn to load onto the barge.
              </p>

              <p>
                When you are called by the barge employee, note that you must back your vehicle onto the
                barge.
              </p>
            </div>

            <div className="car-barge-intro-copy">
              <p>
                One-way or round-trip tickets are purchased after you are on the barge. Tickets are not
                interchangeable between the three car barge companies. If you purchase a round-trip ticket,
                it is only good for the company that issued it.
              </p>

              <p>
                The Red Hook ferry location services both passenger ferries and car barges at separate
                well-marked entrances. Arrive as early as possible before the car barge departure time you
                hope to catch. It fills up fast.
              </p>

              <p>
                VI Now has more information.{' '}
                <a className="car-barge-inline-link" href={vinowUrl} rel="noreferrer" target="_blank">
                  Link for information is here.
                </a>
              </p>
            </div>
          </div>
        </section>

        <BargeOperatorSection
          imageAlt={page.imageGallery?.[2]?.alt || 'Love City car ferry'}
          imageUrl={loveCityImageUrl}
          meta={loveCityMeta}
          rates={{
            heading: 'LOVE CITY CAR FERRY RATES',
            rows: [
              { label: 'One-way', values: ['$65'] },
              { label: 'Round Trip', values: ['$80'] },
            ],
            footer: ['Last Updated: 4/13/2026'],
            url: 'https://www.lovecitycarferries.com/',
          }}
          schedules={loveCitySchedules}
          title={page.sectionHeadings?.[0] ?? 'LOVE CITY CAR FERRIES'}
        />

        <BargeOperatorSection
          imageAlt={page.imageGallery?.[3]?.alt || 'Big Red Barge'}
          imageUrl={bigRedImageUrl}
          meta={bigRedMeta}
          rates={{
            heading: 'BIG RED BARGE CO. RATES',
            rows: [
              { label: 'One-way', values: ['$65', '$15'] },
              { label: 'Round Trip', values: ['$80', '$25'] },
              { label: '', values: ['$60'] },
            ],
            footer: ['Last Updated: 4/13/2026', '*Must show a valid US Virgin Islands ID'],
            url: 'https://www.bigredbarge.co/',
          }}
          schedules={bigRedSchedules}
          title={page.sectionHeadings?.[2] ?? 'BIG RED BARGE CO.'}
        />

        <section className="car-barge-note">
          <p>
            <strong>Note: about St. Thomas-St. John Car Barge Rates:</strong> All rates included above are
            for cars, small trucks, and SUVs, unless otherwise stated. Other types of vehicles, including
            commercial vehicles, should call the barge companies to discuss rates and fees for your
            particular needs.
          </p>
        </section>
      </div>
    </article>
  )
}
