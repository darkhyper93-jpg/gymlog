import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prevDayKey, todayKeyMVD, localDayKeyMVD } from './time';
import { computeStreak } from './achievements';

// Referencia independiente para restar un día (correcta: mediodía UTC), usada solo en el test
// para construir secuencias de días consecutivos sin depender de la función bajo prueba.
function refPrevDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return localDayKeyMVD(new Date(Date.UTC(y, m - 1, d - 1, 12)));
}

test('prevDayKey resta exactamente un día calendario (Uruguay UTC-3)', () => {
  assert.equal(prevDayKey('2026-06-25'), '2026-06-24');
});

test('prevDayKey cruza bien el borde de mes', () => {
  assert.equal(prevDayKey('2026-07-01'), '2026-06-30');
});

test('computeStreak cuenta 3 días consecutivos como racha 3', () => {
  const today = todayKeyMVD();
  const d1 = refPrevDay(today);
  const d2 = refPrevDay(d1);
  const dayKeys = new Set([today, d1, d2]);
  assert.equal(computeStreak(dayKeys), 3);
});

test('computeStreak corta la racha si falta un día intermedio', () => {
  const today = todayKeyMVD();
  const d1 = refPrevDay(today);
  const d3 = refPrevDay(refPrevDay(d1)); // salteamos d2 -> la racha debe ser 2
  const dayKeys = new Set([today, d1, d3]);
  assert.equal(computeStreak(dayKeys), 2);
});
