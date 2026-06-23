import { ContentPage } from '../components/ContentPage'
import { PageLoadingState } from '../components/PageLoadingState'
import { useStructuredPageContent } from '../lib/useSiteContent'

export function PrivacyPolicyPage() {
  const page = useStructuredPageContent('privacyPolicy')

  if (!page) {
    return <PageLoadingState />
  }

  return <ContentPage page={page} />
}
