import { ContentPage } from '../components/ContentPage'
import { useStructuredPageContent } from '../lib/useSiteContent'

export function ArtPage() {
  const page = useStructuredPageContent('art')
  return <ContentPage page={page} />
}
