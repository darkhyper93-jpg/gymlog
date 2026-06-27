// Helper de zona horaria del frontend — espejo de api/src/time.ts.
// Uruguay = America/Montevideo (UTC-3 fijo, sin horario de verano). El device puede
// estar en otra zona (viaje); por eso la clave de "día" se calcula SIEMPRE en hora de
// Uruguay, igual que el backend, para que el agrupado de "hoy" coincida con /sets/today.
const TZ = 'America/Montevideo';

// 'YYYY-MM-DD' en hora de Uruguay para cualquier Date. en-CA da ese formato nativo.
export function localDayKeyMVD(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(date);
}

// 'YYYY-MM-DD' del día actual en hora de Uruguay.
export function todayKeyMVD(): string {
  return localDayKeyMVD(new Date());
}
