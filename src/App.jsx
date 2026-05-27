import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { SiteLayout } from './components/SiteLayout'
import { AboutUsPage } from './pages/AboutUsPage'
import { AdvertisePage } from './pages/AdvertisePage'
import { ArtPage } from './pages/ArtPage'
import { BlogPage } from './pages/BlogPage'
import { CarBargeInformationPage } from './pages/CarBargeInformationPage'
import { CharterBoatDetailPage } from './pages/CharterBoatDetailPage'
import { CharterBoatsPage } from './pages/CharterBoatsPage'
import { FerrysPage } from './pages/FerrysPage'
import { HomePage } from './pages/HomePage'
import { HouseRentalsPage } from './pages/HouseRentalsPage'
import { JewelryPage } from './pages/JewelryPage'
import { LinksPage } from './pages/LinksPage'
import { LocalAttractionsPage } from './pages/LocalAttractionsPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PassengerFerryPage } from './pages/PassengerFerryPage'
import { PropertyDetailPage } from './pages/PropertyDetailPage'
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage'
import { PropertyForSalePage } from './pages/PropertyForSalePage'
import { RentalAccommodationsPage } from './pages/RentalAccommodationsPage'
import { StJohnBookPage } from './pages/StJohnBookPage'
import { StJohnCarRentalsPage } from './pages/StJohnCarRentalsPage'
import { TermsOfAgreementPage } from './pages/TermsOfAgreementPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<SiteLayout />}>
          <Route index element={<HomePage />} />
          <Route path="about-us" element={<AboutUsPage />} />
          <Route path="st-john-rentals" element={<HouseRentalsPage />} />
          <Route path="1bedroom/:slug" element={<PropertyDetailPage />} />
          <Route path="for-rent" element={<RentalAccommodationsPage />} />
          <Route path="for-sale" element={<PropertyForSalePage />} />
          <Route path="property-for-sale" element={<PropertyForSalePage />} />
          <Route path="car-rental-ferry-boat-info" element={<CarBargeInformationPage />} />
          <Route path="car-barge-information" element={<CarBargeInformationPage />} />
          <Route path="passenger-ferry" element={<PassengerFerryPage />} />
          <Route path="ferrys" element={<FerrysPage />} />
          <Route path="cars" element={<StJohnCarRentalsPage />} />
          <Route path="boats" element={<CharterBoatsPage />} />
          <Route path="map" element={<LocalAttractionsPage />} />
          <Route path="advertise" element={<AdvertisePage />} />
          <Route path="privacy-policy" element={<PrivacyPolicyPage />} />
          <Route path="terms-of-agreement" element={<TermsOfAgreementPage />} />
          <Route path="blog" element={<BlogPage />} />
          <Route path="jewelry" element={<JewelryPage />} />
          <Route path="links" element={<LinksPage />} />
          <Route path="st-john-book" element={<StJohnBookPage />} />
          <Route path="art" element={<ArtPage />} />
          <Route path="rental-properties/:slug" element={<PropertyDetailPage />} />
          <Route path="charter-boat-rentals/:slug" element={<CharterBoatDetailPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
