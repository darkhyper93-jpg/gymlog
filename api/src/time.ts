// Helper de zona horaria centralizado para gymlog.
// Uruguay = America/Montevideo, UTC-3 todo el año (sin horario de verano).
// Render corre en UTC; sin este helper el "día" se calcula mal de noche.

const TZ = 'America/Montevideo';

// Devuelve 'YYYY-MM-DD' en hora de Uruguay para cualquier Date UTC.
// en-CA produce ese formato de forma nativa, sin parseo manual.
export function localDayKeyMVD(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(date);
}

// 'YYYY-MM-DD' del día actual en hora de Uruguay.
export function todayKeyMVD(): string {
  return localDayKeyMVD(new Date());
}

// Límites UTC del día de Uruguay que contiene `date`.
// Uruguay es UTC-3 fijo → medianoche MVD = 03:00 UTC del mismo día calendario.
export function dayBoundsMVD(date: Date): { start: Date; end: Date } {
  const [year, mon, day] = localDayKeyMVD(date).split('-').map(Number);
  const start = new Date(Date.UTC(year, mon - 1, day, 3, 0, 0, 0));
  const end = new Date(Date.UTC(year, mon - 1, day + 1, 3, 0, 0, 0));
  return { start, end };
}

// Resta un día calendario a una clave 'YYYY-MM-DD' y devuelve la nueva clave.
export function prevDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  return localDayKeyMVD(new Date(Date.UTC(y, m - 1, d - 1)));
}
