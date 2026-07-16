import { useEffect, useMemo, useState } from 'react'
import { fetchPropertyCalendarAvailability } from '../lib/propertyCalendarAvailability'

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

function toIsoDate(date) {
  return date.toISOString().slice(0, 10)
}

function startOfMonth(year, month) {
  return new Date(Date.UTC(year, month, 1))
}

function isDateBusy(isoDate, busyRanges) {
  return busyRanges.some((range) => isoDate >= range.start && isoDate < range.end)
}

export function PropertyAvailabilityCalendar({ fallback = null, propertySlug }) {
  const today = useMemo(() => {
    const now = new Date()
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  }, [])
  const [cursor, setCursor] = useState(() => startOfMonth(today.getUTCFullYear(), today.getUTCMonth()))
  const [status, setStatus] = useState(() => (propertySlug ? 'loading' : 'error'))
  const [busyRanges, setBusyRanges] = useState([])

  useEffect(() => {
    if (!propertySlug) {
      return undefined
    }

    let cancelled = false

    fetchPropertyCalendarAvailability(propertySlug)
      .then((result) => {
        if (cancelled) {
          return
        }

        setBusyRanges(result.busy)
        setStatus(result.error ? 'error' : 'ready')
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error')
        }
      })

    return () => {
      cancelled = true
    }
  }, [propertySlug])

  const isCurrentMonth = cursor.getUTCFullYear() === today.getUTCFullYear() && cursor.getUTCMonth() === today.getUTCMonth()

  const days = useMemo(() => {
    const year = cursor.getUTCFullYear()
    const month = cursor.getUTCMonth()
    const firstWeekday = startOfMonth(year, month).getUTCDay()
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    const cells = []

    for (let index = 0; index < firstWeekday; index += 1) {
      cells.push(null)
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(Date.UTC(year, month, day))
      cells.push({
        day,
        isoDate: toIsoDate(date),
        isPast: date < today,
        isToday: date.getTime() === today.getTime(),
      })
    }

    return cells
  }, [cursor, today])

  if (status === 'error') {
    return fallback || <p className="property-availability-calendar-status">Availability calendar is temporarily unavailable.</p>
  }

  return (
    <div className="property-availability-calendar">
      <div className="property-availability-calendar-header">
        <button
          aria-label="Previous month"
          className="button-link button-link--ghost property-availability-calendar-nav"
          disabled={isCurrentMonth}
          type="button"
          onClick={() => setCursor((current) => startOfMonth(current.getUTCFullYear(), current.getUTCMonth() - 1))}
        >
          {'<'}
        </button>
        <strong>{MONTH_FORMATTER.format(cursor)}</strong>
        <button
          aria-label="Next month"
          className="button-link button-link--ghost property-availability-calendar-nav"
          type="button"
          onClick={() => setCursor((current) => startOfMonth(current.getUTCFullYear(), current.getUTCMonth() + 1))}
        >
          {'>'}
        </button>
      </div>

      <div aria-hidden="true" className="property-availability-calendar-weekdays">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="property-availability-calendar-grid">
        {days.map((cell, index) => {
          if (!cell) {
            return (
              <span
                aria-hidden="true"
                className="property-availability-calendar-cell property-availability-calendar-cell--empty"
                key={`empty-${index}`}
              />
            )
          }

          const booked = !cell.isPast && isDateBusy(cell.isoDate, busyRanges)

          return (
            <span
              className={[
                'property-availability-calendar-cell',
                cell.isPast ? 'property-availability-calendar-cell--past' : '',
                booked ? 'property-availability-calendar-cell--booked' : '',
                cell.isToday ? 'property-availability-calendar-cell--today' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              key={cell.isoDate}
            >
              {cell.day}
            </span>
          )
        })}
      </div>

      {status === 'loading' ? <p className="property-availability-calendar-status">Loading availability...</p> : null}

      <div className="property-availability-calendar-legend">
        <span className="property-availability-calendar-legend-item property-availability-calendar-legend-item--available">
          Available
        </span>
        <span className="property-availability-calendar-legend-item property-availability-calendar-legend-item--booked">Booked</span>
      </div>
    </div>
  )
}
