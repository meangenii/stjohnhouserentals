import { useEffect, useState } from 'react'
import { CharterBoatCard } from './CharterBoatCard'
import { listCharters } from '../lib/charterRepository'

export function CharterDirectorySection({ title }) {
  const [state, setState] = useState({ status: 'loading', charters: [], message: '' })

  useEffect(() => {
    let cancelled = false

    listCharters()
      .then((charters) => {
        if (!cancelled) {
          setState({ status: 'ready', charters, message: '' })
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            status: 'error',
            charters: [],
            message: error instanceof Error ? error.message : 'Unable to load charter boats.',
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="charter-boats-directory">
      <div className="charter-boats-directory-inner">
        {title ? <h2>{title}</h2> : null}

        {state.status === 'loading' ? <p className="admin-empty">Loading charter boats...</p> : null}

        {state.status === 'error' ? <p className="admin-empty">{state.message}</p> : null}

        {state.status === 'ready' && state.charters.length > 0 ? (
          <div className="charter-boats-grid">
            {state.charters.map((charter) => (
              <CharterBoatCard key={charter.slug} charter={charter} />
            ))}
          </div>
        ) : state.status === 'ready' ? (
          <p className="admin-empty">No charter boats are available right now.</p>
        ) : null}
      </div>
    </section>
  )
}
