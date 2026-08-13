import { useEffect, useState } from 'react'
import { EditableImage, EditableLink, EditableText } from '../components/AdminInlinePageEdit'
import { EditablePhoneText } from '../components/EditablePhoneText'
import { PageLoadingState } from '../components/PageLoadingState'
import { TwoColumnTextBlockRenderer } from '../components/blocks/BlockRenderers'
import { getContentImageSrc } from '../lib/contentAssets'
import { richTextLinesToHtml, richTextValueToInlineHtml } from '../lib/richTextValue'
import { useStructuredPageContent } from '../lib/useSiteContent'

const CAR_BARGE_HERO_BOTTOM_PEEK_FALLBACK_PX = 105
const BIG_RED_BARGE_RATES_URL = 'https://www.bigredbarge.co/rates'
const BIG_RED_BARGE_RATE_ROWS = [
  { label: 'Car, Small Truck or SUV', values: ['One Way $65', 'Round Trip $80'] },
  { label: 'Motorcycles', values: ['One Way $15', 'Round Trip $25'] },
]
const BIG_RED_BARGE_RATE_FOOTER = ['* Round trip return tickets do not expire.']

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function asText(value) {
  return value == null ? '' : String(value)
}

function escapeHtmlAttribute(value) {
  return String(value ?? '')
    .replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function buildCarBargeFeeParagraphs(portAuthorityFees) {
  return portAuthorityFees
    .map((fee) => {
      const feeRecord = asObject(fee)
      const feeLabel = richTextValueToInlineHtml(feeRecord.label ?? '').trim()
      const feeValue = richTextValueToInlineHtml(feeRecord.value ?? '').trim()

      if (!feeLabel && !feeValue) {
        return ''
      }

      return [feeLabel ? `<strong>${feeLabel}</strong>` : '', feeValue].filter(Boolean).join(' ')
    })
    .filter(Boolean)
}

function buildIntroLeftHtml(intro) {
  const leftParagraphs = asArray(intro.leftParagraphs)
  const portAuthorityFees = asArray(intro.portAuthorityFees)
  const firstParagraph = asText(leftParagraphs[0]).trim()
  const remainingParagraphs = leftParagraphs.slice(1)
  const fallbackParagraphs = [
    firstParagraph,
    ...buildCarBargeFeeParagraphs(portAuthorityFees),
    ...remainingParagraphs,
  ].filter((paragraph) => asText(paragraph).trim())

  return asText(intro.left).trim() || richTextLinesToHtml(fallbackParagraphs)
}

function buildIntroRightHtml(intro) {
  const rightParagraphs = asArray(intro.rightParagraphs).filter((paragraph) => asText(paragraph).trim())
  const referenceLink = asObject(intro.referenceLink)
  const referenceHref = asText(referenceLink.href || referenceLink.path).trim()
  const referenceLabel = asText(referenceLink.label).trim() || (referenceHref ? 'Link for information is here.' : '')
  const fallbackParagraphs = [...rightParagraphs]
  const fallbackHtml = richTextLinesToHtml(fallbackParagraphs)
  const referenceHtml =
    referenceHref || referenceLabel
      ? `<p>VI Now has more information. <a href="${escapeHtmlAttribute(referenceHref)}">${richTextValueToInlineHtml(referenceLabel)}</a></p>`
      : ''

  return asText(intro.right).trim() || `${fallbackHtml}${referenceHtml}`
}

function getOperatorRates(operatorTitle, rates) {
  const operatorRates = asObject(rates)

  if (!/big\s+red\s+barge/i.test(asText(operatorTitle))) {
    return operatorRates
  }

  return {
    ...operatorRates,
    rows: BIG_RED_BARGE_RATE_ROWS,
    footer: BIG_RED_BARGE_RATE_FOOTER,
    linkLabel: 'Visit Big Red Barge rates page',
    layout: 'stacked',
    url: BIG_RED_BARGE_RATES_URL,
  }
}

function getCarBargeStickySelectionOffset() {
  const pillNavElement = document.querySelector('.car-barge-hero-pills')

  return pillNavElement ? pillNavElement.getBoundingClientRect().height + 32 : Math.round(window.innerHeight * 0.24)
}

function useScrollSpy(ids, defaultId) {
  const [activeId, setActiveId] = useState(defaultId)
  const idsKey = ids.join('|')

  useEffect(() => {
    if (!idsKey) {
      return undefined
    }

    let frameId = 0
    const sectionIds = idsKey.split('|').filter(Boolean)

    function updateActiveSection() {
      frameId = 0

      const sections = sectionIds
        .map((id) => document.getElementById(id))
        .filter(Boolean)

      if (!sections.length) {
        setActiveId(defaultId)
        return
      }

      const selectionY = window.scrollY + getCarBargeStickySelectionOffset()
      const activeSection = sections.reduce((currentActive, section) => {
        const sectionTop = section.getBoundingClientRect().top + window.scrollY

        return sectionTop <= selectionY ? section : currentActive
      }, sections[0])

      setActiveId((currentActiveId) => (currentActiveId === activeSection.id ? currentActiveId : activeSection.id))
    }

    function scheduleActiveSectionUpdate() {
      if (frameId) {
        return
      }

      frameId = window.requestAnimationFrame(updateActiveSection)
    }

    scheduleActiveSectionUpdate()
    window.addEventListener('scroll', scheduleActiveSectionUpdate, { passive: true })
    window.addEventListener('resize', scheduleActiveSectionUpdate)

    return () => {
      window.removeEventListener('scroll', scheduleActiveSectionUpdate)
      window.removeEventListener('resize', scheduleActiveSectionUpdate)
      window.cancelAnimationFrame(frameId)
    }
  }, [defaultId, idsKey])

  return activeId
}

function getCarBargeHeroBottomPeek(pillNavElement) {
  const pillNavMarginTop = pillNavElement
    ? Number.parseFloat(window.getComputedStyle(pillNavElement).marginTop)
    : Number.NaN

  return Number.isFinite(pillNavMarginTop) && pillNavMarginTop < 0
    ? Math.abs(pillNavMarginTop)
    : CAR_BARGE_HERO_BOTTOM_PEEK_FALLBACK_PX
}

function getCarBargeScrollBehavior() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

function scrollToCarBargeHeroBottom() {
  const heroElement = document.querySelector('.car-barge-hero')
  const pillNavElement = document.querySelector('.car-barge-hero-pills')

  if (!heroElement) {
    return
  }

  const heroBottom = heroElement.getBoundingClientRect().bottom + window.scrollY
  const targetTop = Math.max(0, Math.round(heroBottom - getCarBargeHeroBottomPeek(pillNavElement)))

  window.scrollTo({
    top: targetTop,
    left: 0,
    behavior: getCarBargeScrollBehavior(),
  })
}

function scrollToCarBargeSection(sectionId) {
  if (sectionId === 'general-info') {
    scrollToCarBargeHeroBottom()
    return
  }

  const targetElement = document.getElementById(sectionId)

  if (!targetElement) {
    return
  }

  const pillNavElement = document.querySelector('.car-barge-hero-pills')
  const stickyOffset = pillNavElement ? pillNavElement.getBoundingClientRect().height + 16 : 24
  const targetTop = Math.max(0, Math.round(targetElement.getBoundingClientRect().top + window.scrollY - stickyOffset))

  window.scrollTo({
    top: targetTop,
    left: 0,
    behavior: getCarBargeScrollBehavior(),
  })
}

function handleQuickNavClick(event, sectionId) {
  event.preventDefault()
  scrollToCarBargeSection(sectionId)
}

function QuickNavLinks({ activeId, sections }) {
  return sections.map((section) => (
    <a
      className={`car-barge-hero-pill${section.id === activeId ? ' is-active' : ''}`}
      href={`#${section.id}`}
      key={section.id}
      onClick={(event) => handleQuickNavClick(event, section.id)}
    >
      {section.label}
    </a>
  ))
}

function HeroQuickNav({ activeId, sections }) {
  if (!sections.length) {
    return null
  }

  return (
    <nav aria-label="Jump to section" className="car-barge-hero-pills">
      <QuickNavLinks activeId={activeId} sections={sections} />
    </nav>
  )
}

function getScheduleTabLabel(title, index) {
  const scheduleTitle = asText(title).trim()

  if (/monday\s*[-–]\s*friday|weekday/i.test(scheduleTitle)) {
    return 'Weekdays'
  }

  if (/saturday|sunday|weekend|holiday/i.test(scheduleTitle)) {
    return 'Weekend'
  }

  if (/monday\s*[-–]\s*sunday|daily|every\s+day/i.test(scheduleTitle)) {
    return 'Daily'
  }

  return scheduleTitle || `Schedule ${index + 1}`
}

function getScheduleTabId(operatorIndex, scheduleIndex) {
  return `car-barge-operator-${operatorIndex}-schedule-tab-${scheduleIndex}`
}

function getSchedulePanelId(operatorIndex, scheduleIndex) {
  return `car-barge-operator-${operatorIndex}-schedule-panel-${scheduleIndex}`
}

function getNextScheduleTabIndex(key, currentIndex, scheduleCount) {
  if (key === 'Home') {
    return 0
  }

  if (key === 'End') {
    return scheduleCount - 1
  }

  if (key === 'ArrowRight') {
    return (currentIndex + 1) % scheduleCount
  }

  if (key === 'ArrowLeft') {
    return (currentIndex - 1 + scheduleCount) % scheduleCount
  }

  return currentIndex
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
                    <EditableText
                      as="p"
                      className="car-barge-time-entry"
                      key={timeIndex}
                      label={`${columnHeading} Time ${timeIndex + 1}`}
                      path={[...pathPrefix, 'columns', columnIndex, 'times', timeIndex]}
                      value={timeText}
                    >
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

function ScheduleTabs({ operatorIndex, schedules }) {
  const scheduleRecords = asArray(schedules).map(asObject)
  const [activeScheduleIndex, setActiveScheduleIndex] = useState(0)
  const selectedScheduleIndex = activeScheduleIndex >= 0 && activeScheduleIndex < scheduleRecords.length
    ? activeScheduleIndex
    : 0
  const selectedSchedule = scheduleRecords[selectedScheduleIndex]

  if (!scheduleRecords.length) {
    return null
  }

  if (scheduleRecords.length === 1) {
    return (
      <ScheduleBlock
        columns={selectedSchedule.columns}
        notes={selectedSchedule.notes}
        pathPrefix={['operators', operatorIndex, 'schedules', 0]}
        title={selectedSchedule.title}
      />
    )
  }

  function handleScheduleTabKeyDown(event, scheduleIndex) {
    const nextScheduleIndex = getNextScheduleTabIndex(event.key, scheduleIndex, scheduleRecords.length)

    if (nextScheduleIndex === scheduleIndex) {
      return
    }

    event.preventDefault()
    setActiveScheduleIndex(nextScheduleIndex)
    window.requestAnimationFrame(() => {
      document.getElementById(getScheduleTabId(operatorIndex, nextScheduleIndex))?.focus()
    })
  }

  return (
    <div className="car-barge-schedule-tabs">
      <div aria-label="Schedule days" className="car-barge-schedule-tab-list" role="tablist">
        {scheduleRecords.map((schedule, scheduleIndex) => {
          const isSelected = scheduleIndex === selectedScheduleIndex
          const tabId = getScheduleTabId(operatorIndex, scheduleIndex)
          const panelId = getSchedulePanelId(operatorIndex, scheduleIndex)

          return (
            <button
              aria-controls={panelId}
              aria-selected={isSelected}
              className={`car-barge-schedule-tab${isSelected ? ' is-active' : ''}`}
              id={tabId}
              key={scheduleIndex}
              onClick={() => setActiveScheduleIndex(scheduleIndex)}
              onKeyDown={(event) => handleScheduleTabKeyDown(event, scheduleIndex)}
              role="tab"
              tabIndex={isSelected ? 0 : -1}
              type="button"
            >
              {getScheduleTabLabel(schedule.title, scheduleIndex)}
            </button>
          )
        })}
      </div>

      <div
        aria-labelledby={getScheduleTabId(operatorIndex, selectedScheduleIndex)}
        className="car-barge-schedule-tab-panel"
        id={getSchedulePanelId(operatorIndex, selectedScheduleIndex)}
        role="tabpanel"
      >
        <ScheduleBlock
          columns={selectedSchedule.columns}
          notes={selectedSchedule.notes}
          pathPrefix={['operators', operatorIndex, 'schedules', selectedScheduleIndex]}
          title={selectedSchedule.title}
        />
      </div>
    </div>
  )
}

function RatesBlock({ heading, link, linkLabel, rows, footer, pathPrefix = [], url }) {
  const ratesHeading = asText(heading)
  const rateRows = asArray(rows)
  const rateFooter = asArray(footer)
  const ratesUrl = asText(url)
  const ratesLinkLabel = asText(linkLabel) || 'Visit operator website'
  const isStacked = asText(link?.layout) === 'stacked'

  if (!rateRows.length && !rateFooter.length && !ratesUrl) {
    return null
  }

  return (
    <section aria-label={ratesHeading || 'Car barge rates'} className={`car-barge-rates${isStacked ? ' car-barge-rates--stacked' : ''}`}>
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
  const operatorSchedules = asArray(operatorRecord.schedules)
  const operatorTitle = asText(operatorRecord.title)
  const operatorRates = getOperatorRates(operatorTitle, operatorRecord.rates)
  const imageUrl = getContentImageSrc(operatorImage, { width: 820, height: 1240 })

  return (
    <section className="car-barge-operator" id={`operator-${operatorIndex}`}>
      <div className="car-barge-operator-header">
        <EditableText as="h2" label="Operator Title" path={['operators', operatorIndex, 'title']} value={operatorTitle}>
          {operatorTitle}
        </EditableText>

        <dl className="car-barge-operator-meta">
          <div className="car-barge-operator-meta-card">
            <dt>Barge Names</dt>
            <dd>
              <EditableText as="span" label="Barge Names" path={['operators', operatorIndex, 'meta', 'names']} value={asText(operatorMeta.names)}>
                {asText(operatorMeta.names)}
              </EditableText>
            </dd>
          </div>
          <div className="car-barge-operator-meta-card">
            <dt>Telephone</dt>
            <dd>
              <EditablePhoneText label="Operator Phone" path={['operators', operatorIndex, 'meta', 'phone']} value={asText(operatorMeta.phone)} />
            </dd>
          </div>
          <div className="car-barge-operator-meta-card">
            <dt>Travel Time</dt>
            <dd>
              <EditableText as="span" label="Travel Time" path={['operators', operatorIndex, 'meta', 'travelTime']} value={asText(operatorMeta.travelTime)}>
                {asText(operatorMeta.travelTime)}
              </EditableText>
            </dd>
          </div>
        </dl>

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
          <ScheduleTabs operatorIndex={operatorIndex} schedules={operatorSchedules} />
        </div>
      </div>
    </section>
  )
}

export function CarBargeInformationPage() {
  const page = useStructuredPageContent('carBargeInformation')
  const operators = asArray(asObject(page).operators)
  const quickNavSections = [
    { id: 'general-info', label: 'General Info & Fees' },
    ...operators.map((operator, operatorIndex) => ({
      id: `operator-${operatorIndex}`,
      label: asText(asObject(operator).title) || `Operator ${operatorIndex + 1}`,
    })),
  ]
  const activeSectionId = useScrollSpy(
    quickNavSections.map((section) => section.id),
    'general-info',
  )

  if (!page) {
    return <PageLoadingState />
  }

  const hero = asObject(page.hero)
  const heroImage = asObject(hero.image)
  const intro = asObject(page.intro)
  const note = asText(page.note)
  const heroTitle = asText(hero.title) || asText(page.title) || 'Car Barge Information'
  const heroImageUrl = getContentImageSrc(heroImage, { width: 1920, height: 720 })
  const introRichTextBlock = {
    id: 'car-barge-general-info-copy',
    left: buildIntroLeftHtml(intro),
    right: buildIntroRightHtml(intro),
    type: 'two-column-text',
  }

  return (
    <article className="car-barge-page">
      <section className="car-barge-hero">
        <div className="car-barge-hero-media">
          <div className="car-barge-hero-image-crop">
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
        </div>
        <div className="car-barge-hero-overlay">
          <EditableText as="h1" className="car-barge-hero-title" label="Hero Title" multiline path={['hero', 'title']} rows={3} value={heroTitle}>
            {heroTitle}
          </EditableText>
        </div>
      </section>

      <HeroQuickNav activeId={activeSectionId} sections={quickNavSections} />

      <div className="car-barge-page-inner">
        <section className="car-barge-intro" id="general-info">
          <TwoColumnTextBlockRenderer block={introRichTextBlock} path={['intro']} />
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
