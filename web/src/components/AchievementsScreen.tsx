import type { SVGProps } from 'react';
import type { Achievement } from '../types';
import { useAchievements } from '../hooks/useAchievements';
import { Button, Card, Spinner, StateView } from './ui';
import {
  AlertTriangleIcon,
  CalendarIcon,
  DumbbellIcon,
  LockIcon,
  TrendingUpIcon,
  TrophyIcon,
} from './icons';

// Mapeo de nombre de icono (string del backend) → componente SVG.
function AchievementIcon({ name, ...props }: { name: string } & SVGProps<SVGSVGElement>) {
  switch (name) {
    case 'calendar':
      return <CalendarIcon {...props} />;
    case 'trending-up':
      return <TrendingUpIcon {...props} />;
    case 'dumbbell':
      return <DumbbellIcon {...props} />;
    default:
      return <TrophyIcon {...props} />;
  }
}

function AchievementCard({ achievement }: { achievement: Achievement }) {
  const { unlocked, icon, title, description, unlockedAt } = achievement;

  return (
    <Card
      className={`flex flex-col gap-3 p-4 transition-all ${
        unlocked
          ? 'border-brand/40 bg-surface'
          : 'border-border/50 bg-surface-lowest opacity-60'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            unlocked ? 'bg-brand-soft text-brand' : 'bg-surface-2 text-muted'
          }`}
        >
          {unlocked ? (
            <AchievementIcon name={icon} className="h-5 w-5" />
          ) : (
            <LockIcon className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-bold ${unlocked ? 'text-fg' : 'text-muted'}`}>{title}</p>
          {unlockedAt && (
            <p className="mt-0.5 text-xs text-brand">
              {new Date(unlockedAt).toLocaleDateString('es-AR', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </p>
          )}
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted">{description}</p>
    </Card>
  );
}

export function AchievementsScreen() {
  const { achievements, status, error, reload } = useAchievements();

  if (status === 'loading') return <Spinner />;

  if (status === 'error') {
    return (
      <StateView
        icon={<AlertTriangleIcon className="h-12 w-12" />}
        title="Error al cargar los logros"
        subtitle={error ?? undefined}
        action={<Button variant="secondary" onClick={() => void reload()}>Reintentar</Button>}
      />
    );
  }

  const unlocked = achievements.filter((a) => a.unlocked);
  const locked = achievements.filter((a) => !a.unlocked);

  if (achievements.length === 0) {
    return (
      <StateView
        icon={<TrophyIcon className="h-12 w-12" />}
        title="Sin logros definidos"
        subtitle="Registrá series para empezar a desbloquear logros."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {unlocked.length > 0 && (
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-brand">
            Desbloqueados · {unlocked.length}/{achievements.length}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {unlocked.map((a) => (
              <AchievementCard key={a.key} achievement={a} />
            ))}
          </div>
        </section>
      )}

      {locked.length > 0 && (
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
            Por desbloquear · {locked.length}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {locked.map((a) => (
              <AchievementCard key={a.key} achievement={a} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
