import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';

const PAGE_TITLES = {
  '/':           'Dashboard',
  '/orders':     'Orders',
  '/products':   'Products',
  '/inventory':  'Inventory',
  '/dispatch':   'Dispatch',
  '/returns':    'Returns',
  '/operations': 'Operations',
};

export default function AdminLayout() {
  const { pathname } = useLocation();
  const title = PAGE_TITLES[pathname] ?? 'Admin';

  return (
    <div className="admin-shell">
      <Sidebar />
      <div className="main-area">
        <header className="topbar">
          <h2>{title}</h2>
        </header>
        <div className="page-body">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
