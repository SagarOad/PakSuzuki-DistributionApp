import { Routes, Route } from 'react-router-dom'
import ProtectedRoute from './routes/ProtectedRoute'
import DashboardLayout from './components/layout/DashboardLayout'
import Login from './pages/Login'
import RegistrationCorrectionPage from './pages/RegistrationCorrectionPage'
import MobileAppOnlyPage from './pages/MobileAppOnlyPage'
import Dashboard from './pages/Dashboard'
import DistributorsPage from './pages/Distributors/DistributorsPage'
import DistributorProfilePage from './pages/Distributors/DistributorProfilePage'
import RetailersPage from './pages/Retailers/RetailersPage'
import RetailerDetailPage from './pages/Retailers/RetailerDetailPage'
import OrdersPage from './pages/Orders/OrdersPage'
import OrderDetailsPage from './pages/Orders/OrderDetailsPage'
import ProductList from './pages/Products/ProductList'
import MorePage from './pages/MorePage'
import MapViewPage from './pages/Map/MapViewPage'
import MyShopPage from './pages/Shop/MyShopPage'
import BannerFormPage from './pages/Shop/BannerFormPage'
import ProductDetailsPage from './pages/Shop/ProductDetailsPage'
import DistributorRegisterPage from './pages/Distributors/DistributorRegisterPage'
import IncentivesPage from './pages/Incentives/IncentivesPage'
import IncentiveFormPage from './pages/Incentives/IncentiveFormPage'
import IncentiveDetailPage from './pages/Incentives/IncentiveDetailPage'
import ClaimsPage from './pages/Claims/ClaimsPage'
import ClaimDetailsPage from './pages/Claims/ClaimDetailsPage'
import PromotionsPage from './pages/Promotions/PromotionsPage'
import ReportsPage from './pages/Reports/ReportsPage'
import SettingsPage from './pages/Settings/SettingsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register/distributor" element={<DistributorRegisterPage />} />
      <Route path="/correct-registration" element={<RegistrationCorrectionPage />} />
      <Route path="/use-mobile-app" element={<MobileAppOnlyPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/map" element={<MapViewPage />} />
          <Route path="/shop" element={<MyShopPage />} />
          <Route path="/shop/header-banners/:id" element={<BannerFormPage mode="header" />} />
          <Route path="/shop/category-banners/:id" element={<BannerFormPage mode="category" />} />
          <Route path="/shop/products/:id" element={<ProductDetailsPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/:id" element={<OrderDetailsPage />} />
          <Route path="/claims" element={<ClaimsPage />} />
          <Route path="/claims/:id" element={<ClaimDetailsPage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/products" element={<ProductList />} />

          <Route element={<ProtectedRoute allowedRoles={['SuperAdmin', 'Admin', 'Distributor']} />}>
            <Route path="/distributors/:id" element={<DistributorProfilePage />} />
            <Route path="/retailers" element={<RetailersPage />} />
            <Route path="/retailers/:id" element={<RetailerDetailPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['SuperAdmin', 'Admin']} />}>
            <Route path="/distributors" element={<DistributorsPage />} />
            <Route path="/promotions" element={<PromotionsPage />} />
            <Route path="/incentives" element={<IncentivesPage />} />
            <Route path="/incentives/new" element={<IncentiveFormPage />} />
            <Route path="/incentives/:id" element={<IncentiveDetailPage />} />
            <Route path="/incentives/:id/edit" element={<IncentiveFormPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  )
}
