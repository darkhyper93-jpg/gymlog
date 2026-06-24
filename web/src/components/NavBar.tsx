import type { Tab } from '../App';
import { CalendarIcon, DumbbellIcon, TrendingUpIcon, TrophyIcon } from './icons';
import type { ComponentType, SVGProps } from 'react';

type NavItem = {
  key: Tab;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const NAV_ITEMS: NavItem[] = [
  { key: 'ejercicios', label: 'Ejercicios', Icon: DumbbellIcon },
  { key: 'rutinas', label: 'Rutinas', Icon: CalendarIcon },
  { key: 'progreso', label: 'Progreso', Icon: TrendingUpIcon },
  { key: 'logros', label: 'Logros', Icon: TrophyIcon },
];

type NavBarProps = { tab: Tab; onChange: (t: Tab) => void };

// Bottom nav: fija en mobile, oculta en md+ (el header muestra la TopNav).
export function NavBar({ tab, onChange }: NavBarProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-border bg-surface-lowest md:hidden">
      {NAV_ITEMS.map(({ key, label, Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          aria-label={label}
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium
            transition-colors active:scale-95
            ${tab === key ? 'text-brand' : 'text-muted'}`}
          style={{ minHeight: 56 }}
        >
          <span
            className={`rounded-xl p-1.5 transition-colors ${tab === key ? 'bg-brand-soft' : ''}`}
          >
            <Icon className="h-5 w-5" />
          </span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

// Top nav: visible en md+, oculta en mobile (usá dentro del header de App.tsx).
export function TopNav({ tab, onChange }: NavBarProps) {
  return (
    <nav className="hidden md:flex gap-1">
      {NAV_ITEMS.map(({ key, label, Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium
            transition-colors active:scale-95
            ${tab === key ? 'bg-brand-soft text-brand' : 'text-muted hover:text-fg hover:bg-surface-2'}`}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </nav>
  );
}
