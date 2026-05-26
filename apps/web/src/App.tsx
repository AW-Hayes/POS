import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
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

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
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
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="vendors" element={<VendorsPage />} />
          <Route path="purchase-orders" element={<PurchaseOrdersPage />} />
          <Route path="promotions" element={<PromotionsPage />} />
          <Route path="price-levels" element={<PriceLevelsPage />} />
          <Route path="gift-cards" element={<GiftCardsPage />} />
          <Route path="estimates" element={<EstimatesPage />} />
          <Route path="layaway" element={<LayawayPage />} />
          <Route path="time-clock" element={<TimeClockPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
