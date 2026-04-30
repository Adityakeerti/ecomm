'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/',        icon: 'home',           label: 'Home'    },
  { href: '/shop',    icon: 'grid_view',       label: 'Shop'    },
  { href: '/account', icon: 'account_circle',  label: 'Account' },
  { href: '/track',   icon: 'local_shipping',  label: 'Track'   },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <>
      {/* Material Symbols font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,1,0"
        rel="stylesheet"
      />
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: 'rgba(249,249,249,0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid var(--on-surface)',
        display: 'flex',
        justifyContent: 'space-around',
        padding: '0.5rem 0 0.75rem',
      }}>
        {NAV_ITEMS.map(({ href, icon, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2px',
                textDecoration: 'none',
                color: active ? 'var(--primary)' : 'var(--outline)',
                transition: 'color 0.15s ease',
                flex: 1,
              }}
            >
              <span className="material-symbols-rounded" style={{
                fontSize: '1.375rem',
                fontVariationSettings: `'FILL' ${active ? 1 : 0}, 'wght' ${active ? 600 : 400}`,
              }}>
                {icon}
              </span>
              <span style={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: active ? 700 : 500,
                fontSize: '0.625rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}>
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
