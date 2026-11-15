import type { User } from 'firebase/auth';
import {
  Box,
  FileSpreadsheet,
  Globe2,
  LogOut,
  Satellite,
  Sprout,
} from 'lucide-react';

export type ActiveView = 'observatory' | 'twin3d' | 'optimizer' | 'workspace';

interface TopNavProps {
  activeView: ActiveView;
  onSelectView: (view: ActiveView) => void;
  user: User | null;
  hasWorkspaceToken: boolean;
  authBusy: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

const NAV_ITEMS: Array<{
  id: ActiveView;
  label: string;
  icon: typeof Globe2;
}> = [
  { id: 'observatory', label: 'Field Observatory', icon: Globe2 },
  { id: 'twin3d', label: '3D Soil & Crop Twin', icon: Box },
  { id: 'optimizer', label: 'Rotation Optimizer', icon: Sprout },
  { id: 'workspace', label: 'Workspace & Reports', icon: FileSpreadsheet },
];

export function TopNav({
  activeView,
  onSelectView,
  user,
  hasWorkspaceToken,
  authBusy,
  onSignIn,
  onSignOut,
}: TopNavProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 sm:px-6 lg:h-16 lg:flex-nowrap lg:py-0">
        {/* Zone 1: Brand Wordmark */}
        <button
          type="button"
          onClick={() => onSelectView('observatory')}
          className="order-1 flex shrink-0 items-center gap-2.5 text-left"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-sky-700">
            <Satellite className="h-4.5 w-4.5" />
          </div>
          <div className="leading-tight">
            <span className="block font-display text-[17px] font-bold tracking-tight text-slate-950">
              TerraShift
            </span>
            <span className="hidden text-[11px] font-medium text-slate-500 sm:block">
              NASA Field Shift 2026
            </span>
          </div>
        </button>

        {/* Zone 2: Navigation Tabs (full-width row on mobile, centered on lg+) */}
        <nav
          aria-label="Primary sections"
          className="order-3 flex w-full items-center gap-1 overflow-x-auto border-t border-slate-100 pt-2 lg:order-2 lg:w-auto lg:border-t-0 lg:pt-0"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                data-nav={item.id}
                onClick={() => onSelectView(item.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors lg:py-2 ${
                  active
                    ? 'bg-sky-700 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single Primary Auth Action */}
        <div className="order-2 flex shrink-0 items-center gap-2 lg:order-3">
          {user ? (
            <div className="flex items-center gap-2">
              <div className="hidden text-right leading-tight md:block">
                <p className="max-w-[140px] truncate text-xs font-semibold text-slate-900">
                  {user.displayName || user.email || 'Agronomist'}
                </p>
                <p className="text-[11px] text-slate-500">
                  {hasWorkspaceToken ? 'Workspace Linked' : 'Account Active'}
                </p>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                title="Sign out"
                className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              disabled={authBusy}
              className="gsi-material-button"
            >
              <div className="gsi-material-button-content-wrapper">
                <div className="gsi-material-button-icon">
                  <svg
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 48 48"
                    style={{ display: 'block' }}
                  >
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                  </svg>
                </div>
                <span className="gsi-material-button-contents">
                  {authBusy ? 'Signing in...' : 'Sign in with Google'}
                </span>
              </div>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
