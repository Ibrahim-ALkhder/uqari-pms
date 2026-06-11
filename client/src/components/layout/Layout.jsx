import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import './Layout.css';

const NAV_ITEMS = [
  { to: '/', label: 'لوحة التحكم', icon: '📊' },
  { to: '/properties', label: 'العقارات', icon: '🏢' },
  { to: '/tenants', label: 'المستأجرون', icon: '👤' },
  { to: '/contracts/new', label: 'عقد جديد', icon: '📝' },
  { to: '/invoices', label: 'الفواتير', icon: '📄' },
  { to: '/expenses', label: 'المصروفات', icon: '💰' },
  { to: '/maintenance', label: 'الصيانة', icon: '🔧' },
  { to: '/reports', label: 'التقارير', icon: '📈' },
  { to: '/settings', label: 'الإعدادات', icon: '⚙️' },
];

export default function Layout() {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  function handleLogout() {
    localStorage.removeItem('auth_token');
    navigate('/login', { replace: true });
  }

  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-icon">◈</span>
          {!collapsed && <span className="brand-text">عقاري</span>}
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {!collapsed && <span className="nav-label">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="nav-item logout-btn" onClick={handleLogout}>
            <span className="nav-icon">🚪</span>
            {!collapsed && <span className="nav-label">تسجيل الخروج</span>}
          </button>
          <button className="collapse-btn" onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? '→' : '←'}
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
