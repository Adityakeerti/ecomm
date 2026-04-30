import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const links = [
  { to: '/',          icon: 'dashboard',       label: 'Dashboard'  },
  { to: '/orders',    icon: 'shopping_bag',    label: 'Orders'     },
  { to: '/products',  icon: 'checkroom',       label: 'Products'   },
  { to: '/inventory', icon: 'inventory_2',     label: 'Inventory'  },
  { to: '/dispatch',  icon: 'local_shipping',  label: 'Dispatch'   },
  { to: '/returns',   icon: 'assignment_return',label: 'Returns'   },
  { to: '/operations',icon: 'settings',        label: 'Operations' },
];

export default function Sidebar() {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h1>CURATOR</h1>
        <p>Admin Console</p>
      </div>

      <nav className="sidebar-nav">
        {links.map(l => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/'}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <span className="icon">{l.icon}</span>
            {l.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        {admin && <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.75rem', marginBottom: '0.75rem' }}>Signed in as {admin.username ?? 'Admin'}</p>}
        <button className="nav-item" onClick={handleLogout} style={{ borderRadius: '6px' }}>
          <span className="icon">logout</span>
          Sign Out
        </button>
      </div>
    </aside>
  );
}
