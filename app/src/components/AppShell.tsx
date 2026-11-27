import { NavLink, Outlet } from 'react-router-dom'
import { useIsFetching } from '@tanstack/react-query'
import { UpdatePrompt } from './UpdatePrompt'
import { OfflineBanner } from './OfflineBanner'

const tabs = [
  { to: '/viaggi', label: 'Viaggi', icon: 'M4 7h16M4 12h16M4 17h10' },
  { to: '/dashboard', label: 'Dashboard', icon: 'M4 19V10M10 19V5M16 19v-7M22 19H2' },
  { to: '/account', label: 'Account', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0' },
]

export function AppShell() {
  const fetching = useIsFetching()
  return (
    <div className="shell">
      <div className={`fetch-bar${fetching ? ' fetch-bar--on' : ''}`} aria-hidden="true" />
      <OfflineBanner />
      <main className="shell__content">
        <Outlet />
      </main>
      <UpdatePrompt />
      <nav className="tabbar" aria-label="Navigazione principale">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => `tabbar__item${isActive ? ' is-active' : ''}`}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d={t.icon} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
