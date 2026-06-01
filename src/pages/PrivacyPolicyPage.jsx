import { ContentPage } from '../components/ContentPage'
import { useStructuredPageContent } from '../lib/useSiteContent'

export function PrivacyPolicyPage() {
  const page = useStructuredPageContent('privacyPolicy')
  return <ContentPage page={page} />
}
