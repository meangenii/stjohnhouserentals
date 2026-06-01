import { ContentPage } from '../components/ContentPage'
import { useStructuredPageContent } from '../lib/useSiteContent'

export function JewelryPage() {
  const page = useStructuredPageContent('jewelry')
  return <ContentPage page={page} />
}
