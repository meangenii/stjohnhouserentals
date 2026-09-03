import { useState } from 'react'
import { trackEngagement } from '../lib/engagementClient'

function detectNativeShareSupport() {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

function buildPinterestShareUrl({ url, imageUrl, description }) {
  let shareUrl = `https://www.pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}`

  if (imageUrl) {
    shareUrl += `&media=${encodeURIComponent(imageUrl)}`
  }

  if (description) {
    shareUrl += `&description=${encodeURIComponent(description)}`
  }

  return shareUrl
}

function buildTwitterShareUrl({ url, text }) {
  let shareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}`

  if (text) {
    shareUrl += `&text=${encodeURIComponent(text)}`
  }

  return shareUrl
}

function buildWhatsAppShareUrl({ url, text }) {
  const message = text ? `${text} ${url}` : url
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`
}

function buildEmailShareUrl({ url, title, description }) {
  const subject = title || 'Check this out'
  const body = `${description ? `${description}\n\n` : ''}${url}`
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

function openSharePopup(shareUrl) {
  window.open(shareUrl, 'social-share-dialog', 'width=626,height=520,menubar=no,toolbar=no,status=no')
}

// Pinterest, X/Twitter, and WhatsApp all support pre-filled web share links.
// Instagram does not offer one at all - there is no public "share this URL to
// Instagram" web intent - so there's no dedicated Instagram button here. On a
// phone with the Instagram app installed, the native "Share..." button below
// already surfaces it through the OS share sheet, which is the only real way
// to hand it a link.
export function SocialShareButtons({
  className = '',
  description = '',
  imageUrl = '',
  itemId = '',
  itemType = '',
  title = '',
  url = '',
}) {
  const [canUseNativeShare] = useState(detectNativeShareSupport)

  if (!url) {
    return null
  }

  function track(channel) {
    if (itemType && itemId) {
      trackEngagement({ itemType, itemId, channel, action: 'share_click' })
    }
  }

  function handlePinterestClick(event) {
    event.preventDefault()
    track('pinterest')
    openSharePopup(buildPinterestShareUrl({ url, imageUrl, description: description || title }))
  }

  function handleTwitterClick(event) {
    event.preventDefault()
    track('twitter')
    openSharePopup(buildTwitterShareUrl({ url, text: title }))
  }

  function handleWhatsAppClick() {
    track('whatsapp')
  }

  function handleEmailClick() {
    track('email')
  }

  async function handleNativeShareClick() {
    track('native')

    try {
      await navigator.share({ title, text: description || title, url })
    } catch {
      // The person cancelled the share sheet, or it failed - nothing to do.
    }
  }

  return (
    <div className={`social-share-row ${className}`.trim()}>
      <button
        aria-label={title ? `Share ${title} on Pinterest` : 'Share on Pinterest'}
        className="social-share-button social-share-button--pinterest"
        onClick={handlePinterestClick}
        type="button"
      >
        <span aria-hidden="true" className="social-share-button-icon">
          P
        </span>
        Pinterest
      </button>

      <button
        aria-label={title ? `Share ${title} on X` : 'Share on X'}
        className="social-share-button social-share-button--twitter"
        onClick={handleTwitterClick}
        type="button"
      >
        <span aria-hidden="true" className="social-share-button-icon">
          X
        </span>
        X
      </button>

      <a
        aria-label={title ? `Share ${title} on WhatsApp` : 'Share on WhatsApp'}
        className="social-share-button social-share-button--whatsapp"
        href={buildWhatsAppShareUrl({ url, text: title })}
        onClick={handleWhatsAppClick}
        rel="noopener noreferrer"
        target="_blank"
      >
        <span aria-hidden="true" className="social-share-button-icon">
          W
        </span>
        WhatsApp
      </a>

      <a
        aria-label={title ? `Email ${title}` : 'Share by email'}
        className="social-share-button social-share-button--email"
        href={buildEmailShareUrl({ url, title, description })}
        onClick={handleEmailClick}
      >
        <span aria-hidden="true" className="social-share-button-icon">
          @
        </span>
        Email
      </a>

      {canUseNativeShare ? (
        <button
          aria-label={title ? `Share ${title}` : 'Share'}
          className="social-share-button social-share-button--native"
          onClick={handleNativeShareClick}
          type="button"
        >
          <span aria-hidden="true" className="social-share-button-icon">
            &uarr;
          </span>
          Share...
        </button>
      ) : null}
    </div>
  )
}
