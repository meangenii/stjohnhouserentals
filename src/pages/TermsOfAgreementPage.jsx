import { ContentPage } from '../components/ContentPage'
import { PageLoadingState } from '../components/PageLoadingState'
import { useStructuredPageContent } from '../lib/useSiteContent'

export function TermsOfAgreementPage() {
  const page = useStructuredPageContent('termsOfAgreement')

  if (!page) {
    return <PageLoadingState />
  }

  return <ContentPage page={page} />
}
