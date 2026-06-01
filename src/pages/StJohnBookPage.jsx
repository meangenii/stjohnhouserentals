import { ContentPage } from '../components/ContentPage'
import { useStructuredPageContent } from '../lib/useSiteContent'

export function StJohnBookPage() {
  const page = useStructuredPageContent('stJohnBook')
  return <ContentPage page={page} />
}
