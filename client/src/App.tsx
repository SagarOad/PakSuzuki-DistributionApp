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
import AmendOrderPage from './pages/Orders/AmendOrderPage'
import MiddlewarePickupPage from './pages/Orders/MiddlewarePickupPage'
import ProductList from './pages/Products/ProductList'
import ProductWizardPage from './pages/Products/ProductWizardPage'
import MorePage from './pages/MorePage'
import MapViewPage from './pages/Map/MapViewPage'
import MyShopPage from './pages/Shop/MyShopPage'
import BannerFormPage from './pages/Shop/BannerFormPage'
import ProductDetailsPage from './pages/Shop/ProductDetailsPage'
import DistributorRegisterPage from './pages/Distributors/DistributorRegisterPage'
import RetailerRegisterPage from './pages/Retailers/RetailerRegisterPage'
import IncentivesPage from './pages/Incentives/IncentivesPage'
import IncentiveFormPage from './pages/Incentives/IncentiveFormPage'
import IncentiveDetailPage from './pages/Incentives/IncentiveDetailPage'
import ProductGroupsPage from './pages/Incentives/ProductGroupsPage'
import IncentiveSchemesPage, {
  IncentiveSchemeDetailPage,
  IncentiveSchemeFormPage
} from './pages/Incentives/IncentiveSchemesPages'
import ClaimsPage from './pages/Claims/ClaimsPage'
import ClaimDetailsPage from './pages/Claims/ClaimDetailsPage'
import PromotionsPage from './pages/Promotions/PromotionsPage'
import ReportsPage from './pages/Reports/ReportsPage'
import SettingsPage from './pages/Settings/SettingsPage'
import DistributorDashboard from './pages/Distributor/DistributorDashboard'
import LubricantCategoryPage from './pages/Catalog/LubricantCategoryPage'
import CatalogProductPage from './pages/Catalog/CatalogProductPage'
import CartPage from './pages/Catalog/CartPage'
import OrderSummaryPage from './pages/Catalog/OrderSummaryPage'
import PaymentPage from './pages/Catalog/PaymentPage'
import StartOrderPage from './pages/Catalog/StartOrderPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register/distributor" element={<DistributorRegisterPage />} />
      <Route path="/register/retailer" element={<RetailerRegisterPage />} />
      <Route path="/correct-registration" element={<RegistrationCorrectionPage />} />
      <Route path="/use-mobile-app" element={<MobileAppOnlyPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/overview" element={<DistributorDashboard />} />
          <Route path="/map" element={<MapViewPage />} />
          <Route path="/order/start" element={<StartOrderPage />} />
          <Route path="/catalog/products/:id" element={<CatalogProductPage />} />
          <Route path="/catalog/:categoryKey" element={<LubricantCategoryPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout/summary" element={<OrderSummaryPage />} />
          <Route path="/checkout/payment" element={<PaymentPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/:id" element={<OrderDetailsPage />} />
          <Route element={<ProtectedRoute allowedRoles={['SuperAdmin', 'Admin', 'Distributor']} />}>
            <Route path="/orders/:id/amend" element={<AmendOrderPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['SuperAdmin', 'Admin']} />}>
            <Route path="/orders/middleware" element={<MiddlewarePickupPage />} />
          </Route>
          <Route path="/claims" element={<ClaimsPage />} />
          <Route path="/claims/:id" element={<ClaimDetailsPage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/products" element={<ProductList />} />
          <Route path="/products/new" element={<ProductWizardPage />} />
          <Route path="/products/:id" element={<ProductWizardPage />} />

          <Route element={<ProtectedRoute allowedRoles={['SuperAdmin', 'Admin', 'Distributor']} />}>
            <Route path="/distributors/:id" element={<DistributorProfilePage />} />
            <Route path="/retailers" element={<RetailersPage />} />
            <Route path="/retailers/:id" element={<RetailerDetailPage />} />
            <Route path="/incentives" element={<IncentivesPage />} />
            <Route path="/incentives/:id" element={<IncentiveDetailPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['SuperAdmin', 'Admin']} />}>
            <Route path="/shop" element={<MyShopPage />} />
            <Route path="/shop/header-banners/:id" element={<BannerFormPage mode="header" />} />
            <Route path="/shop/category-banners/:id" element={<BannerFormPage mode="category" />} />
            <Route path="/shop/products/:id" element={<ProductDetailsPage />} />
            <Route path="/distributors" element={<DistributorsPage />} />
            <Route path="/promotions" element={<PromotionsPage />} />
            <Route path="/incentives/new" element={<IncentiveFormPage />} />
            <Route path="/incentives/:id/edit" element={<IncentiveFormPage />} />
            <Route path="/product-groups" element={<ProductGroupsPage />} />
            <Route path="/incentive-schemes" element={<IncentiveSchemesPage />} />
            <Route path="/incentive-schemes/new" element={<IncentiveSchemeFormPage />} />
            <Route path="/incentive-schemes/:id" element={<IncentiveSchemeDetailPage />} />
            <Route path="/incentive-schemes/:id/edit" element={<IncentiveSchemeFormPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  )
}
