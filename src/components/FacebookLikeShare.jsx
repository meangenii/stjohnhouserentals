import { useEffect, useRef, useState } from 'react'
import { getFacebookAppId, loadFacebookSdk } from '../lib/facebookSdk'
import { trackEngagement } from '../lib/engagementClient'

const FACEBOOK_SHARE_ENDPOINT = 'https://www.facebook.com/sharer/sharer.php'

function openFacebookShareWindow(shareUrl) {
  const dialogUrl = `${FACEBOOK_SHARE_ENDPOINT}?u=${encodeURIComponent(shareUrl)}`
  window.open(dialogUrl, 'facebook-share-dialog', 'width=626,height=520,menubar=no,toolbar=no,status=no')
}

// Facebook removed the ability for apps to silently publish to a person's
// timeline; posting to a wall always requires the person to confirm inside a
// Facebook-owned surface. This renders the official Like widget (which offers
// its own "share to timeline" checkbox) and a Share button that opens
// Facebook's Share dialog/sharer popup for the given item. Actual completed
// Likes (via the widget's edge.create event) and share-button clicks are
// tracked server-side for the client engagement report.
export function FacebookLikeShare({ className = '', itemId = '', itemType = '', title = '', url = '' }) {
  const likeContainerRef = useRef(null)
  const [likeWidgetReady, setLikeWidgetReady] = useState(false)
  const hasAppId = Boolean(getFacebookAppId())
  const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '')

  useEffect(() => {
    if (!hasAppId) {
      return undefined
    }

    let cancelled = false

    loadFacebookSdk().then((FB) => {
      if (!cancelled && FB) {
        setLikeWidgetReady(true)
      }
    })

    return () => {
      cancelled = true
    }
  }, [hasAppId])

  useEffect(() => {
    if (!likeWidgetReady || !window.FB || !likeContainerRef.current) {
      return
    }

    window.FB.XFBML.parse(likeContainerRef.current)
  }, [likeWidgetReady, shareUrl])

  useEffect(() => {
    if (!likeWidgetReady || !window.FB || !itemType || !itemId) {
      return undefined
    }

    function handleEdgeCreate(likedUrl) {
      if (likedUrl === shareUrl) {
        trackEngagement({ itemType, itemId, channel: 'facebook', action: 'like' })
      }
    }

    window.FB.Event.subscribe('edge.create', handleEdgeCreate)

    return () => {
      window.FB.Event.unsubscribe('edge.create', handleEdgeCreate)
    }
  }, [likeWidgetReady, itemId, itemType, shareUrl])

  function handleShareClick() {
    if (!shareUrl) {
      return
    }

    if (itemType && itemId) {
      trackEngagement({ itemType, itemId, channel: 'facebook', action: 'share_click' })
    }

    if (hasAppId && window.FB) {
      window.FB.ui({ method: 'share', href: shareUrl }, () => {})
      return
    }

    openFacebookShareWindow(shareUrl)
  }

  if (!shareUrl) {
    return null
  }

  return (
    <div className={`social-share-row ${className}`.trim()}>
      {hasAppId ? (
        <div className="social-share-like" key={shareUrl} ref={likeContainerRef}>
          <div
            className="fb-like"
            data-action="like"
            data-href={shareUrl}
            data-layout="button_count"
            data-share="true"
            data-size="small"
          />
        </div>
      ) : null}

      <button
        aria-label={title ? `Share ${title} on Facebook` : 'Share on Facebook'}
        className="social-share-button social-share-button--facebook"
        onClick={handleShareClick}
        type="button"
      >
        <span aria-hidden="true" className="social-share-button-icon">
          f
        </span>
        Share on Facebook
      </button>
    </div>
  )
}
