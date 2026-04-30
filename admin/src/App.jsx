import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import PrivateRoute from './components/PrivateRoute';
import AdminLayout from './components/AdminLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import Products from './pages/Products';
import Inventory from './pages/Inventory';
import Dispatch from './pages/Dispatch';
import Returns from './pages/Returns';
import Operations from './pages/Operations';

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={<PrivateRoute><AdminLayout /></PrivateRoute>}
            >
              <Route index element={<Dashboard />} />
              <Route path="orders"     element={<Orders />} />
              <Route path="products"   element={<Products />} />
              <Route path="inventory"  element={<Inventory />} />
              <Route path="dispatch"   element={<Dispatch />} />
              <Route path="returns"    element={<Returns />} />
              <Route path="operations" element={<Operations />} />
              <Route path="*"          element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
