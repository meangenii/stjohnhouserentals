import { ContentPage } from '../components/ContentPage'
import { useStructuredPageContent } from '../lib/useSiteContent'

export function TermsOfAgreementPage() {
  const page = useStructuredPageContent('termsOfAgreement')
  return <ContentPage page={page} />
}
