import { ContentPage } from '../components/ContentPage'
import { useStructuredPageContent } from '../lib/useSiteContent'

export function LinksPage() {
  const page = useStructuredPageContent('links')
  return <ContentPage page={page} />
}
