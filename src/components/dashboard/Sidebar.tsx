import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

const navItems = [
  { icon: 'dashboard', label: 'Dashboard', route: '/dashboard' },
  { icon: 'mic_none', label: 'Speaking', route: '/speaking' },
  { icon: 'menu_book', label: 'Grammar', route: '/grammar' },
  { icon: 'edit_note', label: 'Writing', route: '/writing' },
  { icon: 'person', label: 'Profile', route: '/progress' },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useAuth()

  function handleNav(route: string) {
    navigate(route)
    onClose()
  }

  return (
    <>
      {/* Overlay for mobile */}
      {open && (
        <div className="fixed inset-0 bg-black/50 z-50 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={`fixed left-0 top-0 h-full w-64 bg-[#f3f4f5] flex flex-col p-6 gap-y-4 z-[60] transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
        style={{ border: 'none', boxShadow: 'none' }}
      >
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="font-headline font-bold text-lg text-[#003461]">English for Executives</h1>
            <p className="text-xs text-on-surface-variant/70 uppercase tracking-widest mt-1">High-Stakes Preparation</p>
          </div>
          <button type="button" className="lg:hidden p-2 text-slate-500 cursor-pointer" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <nav className="flex-1 space-y-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.route
            return (
              <button
                key={item.route}
                type="button"
                onClick={() => handleNav(item.route)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all cursor-pointer active:translate-x-1 duration-200 text-left ${
                  isActive
                    ? 'bg-white text-[#003461] shadow-sm font-bold'
                    : 'text-slate-600 hover:bg-white/50'
                }`}
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                <span className="font-headline text-sm font-medium">{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="mt-auto pt-6 space-y-2">
          <button
            type="button"
            onClick={() => handleNav('/speaking')}
            className="w-full bg-gradient-to-br from-primary to-primary-container text-white py-3 rounded-lg text-sm font-semibold shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity mb-6"
          >
            Start Mock Interview
          </button>
          <button type="button" className="flex items-center gap-3 px-4 py-2 text-slate-600 hover:bg-white/50 transition-all text-sm font-medium w-full">
            <span className="material-symbols-outlined">settings</span>
            <span>Settings</span>
          </button>
          <button type="button" className="flex items-center gap-3 px-4 py-2 text-slate-600 hover:bg-white/50 transition-all text-sm font-medium w-full">
            <span className="material-symbols-outlined">help_outline</span>
            <span>Support</span>
          </button>
          <button type="button" onClick={logout} className="flex items-center gap-3 px-4 py-2 text-error hover:bg-white/50 transition-all text-sm font-medium w-full">
            <span className="material-symbols-outlined">logout</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  )
}
