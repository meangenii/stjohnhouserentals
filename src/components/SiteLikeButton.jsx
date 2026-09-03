import { useEffect, useRef, useState } from 'react'
import { fetchLikeSummary, toggleLike } from '../lib/likeClient'

// A heart/favorite counter stored in our own Firestore, independent of any
// social network. One like per browser (tracked via a local client token),
// not tied to a Facebook account or any external service.
export function SiteLikeButton({ className = '', itemId = '', itemType = '', title = '' }) {
  const [state, setState] = useState({ status: 'loading', count: 0, liked: false })
  const requestSequenceRef = useRef(0)

  useEffect(() => {
    if (!itemType || !itemId) {
      return undefined
    }

    let cancelled = false
    requestSequenceRef.current += 1

    fetchLikeSummary({ itemType, itemId })
      .then((summary) => {
        if (cancelled) {
          return
        }

        setState({ status: 'ready', count: summary?.count ?? 0, liked: Boolean(summary?.liked) })
      })
      .catch(() => {
        // The like API may be unreachable (e.g. local dev proxying to a
        // backend that hasn't been deployed with this endpoint yet). Fail
        // open to a visible, interactive default rather than hiding the
        // button entirely - a stray network error shouldn't make it vanish.
        if (!cancelled) {
          setState({ status: 'ready', count: 0, liked: false })
        }
      })

    return () => {
      cancelled = true
    }
  }, [itemId, itemType])

  async function handleClick() {
    if (!itemType || !itemId || state.status === 'loading' || state.status === 'pending') {
      return
    }

    const previousState = state
    const optimisticLiked = !previousState.liked
    const optimisticCount = Math.max(0, previousState.count + (optimisticLiked ? 1 : -1))
    const requestSequence = ++requestSequenceRef.current

    setState({ status: 'pending', count: optimisticCount, liked: optimisticLiked })

    try {
      const result = await toggleLike({ itemType, itemId })

      if (requestSequenceRef.current !== requestSequence) {
        return
      }

      setState({ status: 'ready', count: result?.count ?? optimisticCount, liked: Boolean(result?.liked) })
    } catch {
      if (requestSequenceRef.current !== requestSequence) {
        return
      }

      setState({ ...previousState, status: 'ready' })
    }
  }

  return (
    <button
      aria-label={title ? `${state.liked ? 'Unlike' : 'Like'} ${title}` : state.liked ? 'Unlike' : 'Like'}
      aria-pressed={state.liked}
      className={`site-like-button ${state.liked ? 'site-like-button--liked' : ''} ${className}`.trim()}
      disabled={state.status === 'loading' || state.status === 'pending'}
      onClick={handleClick}
      type="button"
    >
      <span aria-hidden="true" className="site-like-button-icon">
        {state.liked ? '♥' : '♡'}
      </span>
      <span className="site-like-button-count">{state.count}</span>
    </button>
  )
}
