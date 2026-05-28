import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { useFeatures } from '@/lib/features';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardLayout } from '@/pages/DashboardLayout';
import { DashboardHome } from '@/pages/DashboardHome';
import { TerminalPage } from '@/pages/TerminalPage';
import { ProductsPage } from '@/pages/ProductsPage';
import { InventoryPage } from '@/pages/InventoryPage';
import { OrdersPage } from '@/pages/OrdersPage';
import { CustomersPage } from '@/pages/CustomersPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { VendorsPage } from '@/pages/VendorsPage';
import { PurchaseOrdersPage } from '@/pages/PurchaseOrdersPage';
import { PromotionsPage } from '@/pages/PromotionsPage';
import { PriceLevelsPage } from '@/pages/PriceLevelsPage';
import { GiftCardsPage } from '@/pages/GiftCardsPage';
import { EstimatesPage } from '@/pages/EstimatesPage';
import { LayawayPage } from '@/pages/LayawayPage';
import { TimeClockPage } from '@/pages/TimeClockPage';
import { ReturnsPage } from '@/pages/ReturnsPage';
import { CycleCountPage } from '@/pages/CycleCountPage';
import { ServiceTicketsPage } from '@/pages/ServiceTicketsPage';
import { BundlesPage } from '@/pages/BundlesPage';
import { StockTransfersPage } from '@/pages/StockTransfersPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { CustomerDisplayPage } from '@/pages/CustomerDisplayPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function RequireFeature({ featureKey, children }: { featureKey: string; children: React.ReactNode }) {
  const features = useFeatures();
  // Allow access while tenant data is still loading (features default to true)
  return features[featureKey] === false ? <Navigate to="/" replace /> : <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/display" element={<CustomerDisplayPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <DashboardLayout />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardHome />} />
          <Route path="terminal" element={<TerminalPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="returns" element={<RequireFeature featureKey="returns"><ReturnsPage /></RequireFeature>} />
          <Route path="estimates" element={<RequireFeature featureKey="estimates"><EstimatesPage /></RequireFeature>} />
          <Route path="layaway" element={<RequireFeature featureKey="layaway"><LayawayPage /></RequireFeature>} />
          <Route path="service-tickets" element={<RequireFeature featureKey="serviceTickets"><ServiceTicketsPage /></RequireFeature>} />
          <Route path="bundles" element={<RequireFeature featureKey="bundles"><BundlesPage /></RequireFeature>} />
          <Route path="inventory" element={<RequireFeature featureKey="inventory"><InventoryPage /></RequireFeature>} />
          <Route path="cycle-counts" element={<RequireFeature featureKey="cycleCounts"><CycleCountPage /></RequireFeature>} />
          <Route path="promotions" element={<RequireFeature featureKey="promotions"><PromotionsPage /></RequireFeature>} />
          <Route path="price-levels" element={<RequireFeature featureKey="priceLevels"><PriceLevelsPage /></RequireFeature>} />
          <Route path="gift-cards" element={<RequireFeature featureKey="giftCards"><GiftCardsPage /></RequireFeature>} />
          <Route path="customers" element={<RequireFeature featureKey="customers"><CustomersPage /></RequireFeature>} />
          <Route path="vendors" element={<RequireFeature featureKey="vendors"><VendorsPage /></RequireFeature>} />
          <Route path="purchase-orders" element={<RequireFeature featureKey="purchaseOrders"><PurchaseOrdersPage /></RequireFeature>} />
          <Route path="stock-transfers" element={<RequireFeature featureKey="stockTransfers"><StockTransfersPage /></RequireFeature>} />
          <Route path="time-clock" element={<RequireFeature featureKey="timeClock"><TimeClockPage /></RequireFeature>} />
          <Route path="reports" element={<RequireFeature featureKey="reports"><ReportsPage /></RequireFeature>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
