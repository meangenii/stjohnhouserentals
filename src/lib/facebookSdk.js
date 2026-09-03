const FACEBOOK_SDK_VERSION = 'v21.0'
const FACEBOOK_SDK_SRC = 'https://connect.facebook.net/en_US/sdk.js'

let sdkPromise = null

export function getFacebookAppId() {
  return (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FACEBOOK_APP_ID) || ''
}

// Facebook's platform no longer allows apps to publish to a person's timeline
// without an explicit, Facebook-controlled confirmation step (the Like widget's
// own "share to timeline" option, or the Share dialog). This loader only wires
// up FB.init so those official widgets/dialogs can render; it never posts on a
// user's behalf directly.
export function loadFacebookSdk() {
  const appId = getFacebookAppId()

  if (typeof window === 'undefined' || !appId) {
    return Promise.resolve(null)
  }

  if (window.FB) {
    return Promise.resolve(window.FB)
  }

  if (sdkPromise) {
    return sdkPromise
  }

  sdkPromise = new Promise((resolve) => {
    if (!document.getElementById('fb-root')) {
      const fbRoot = document.createElement('div')
      fbRoot.id = 'fb-root'
      document.body.prepend(fbRoot)
    }

    const previousFbAsyncInit = window.fbAsyncInit

    window.fbAsyncInit = function fbAsyncInit() {
      previousFbAsyncInit?.()
      window.FB.init({
        appId,
        version: FACEBOOK_SDK_VERSION,
        xfbml: false,
      })
      resolve(window.FB)
    }

    if (document.getElementById('facebook-jssdk')) {
      return
    }

    const script = document.createElement('script')
    script.id = 'facebook-jssdk'
    script.src = FACEBOOK_SDK_SRC
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    document.body.appendChild(script)
  })

  return sdkPromise
}
