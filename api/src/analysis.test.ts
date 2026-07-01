import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  est1RM,
  summarizeSessions,
  suggestLoad,
  detectStall,
  MIN_SESSIONS,
} from './analysis';
import type { SessionInput, SessionSummary } from './analysis';

function session(dayKey: string, weight: number, reps: number, rir: number | null): SessionInput {
  return { dayKey, date: `${dayKey}T12:00:00.000Z`, sets: [{ weight, reps, rir }] };
}

function summary(dayKey: string, weight: number, reps: number, rir: number | null): SessionSummary {
  return {
    dayKey,
    date: `${dayKey}T12:00:00.000Z`,
    topWeight: weight,
    topReps: reps,
    topRir: rir,
    best1RM: est1RM(weight, reps),
  };
}

test('est1RM — Epley', () => {
  assert.equal(est1RM(100, 10), 100 * (1 + 10 / 30));
  assert.equal(est1RM(50, 0), 50);
});

test('summarizeSessions — filtra outliers y elige la serie top', () => {
  const input: SessionInput[] = [
    {
      dayKey: '2026-06-01',
      date: '2026-06-01T12:00:00.000Z',
      sets: [
        { weight: 0, reps: 10, rir: 2 }, // outlier: peso 0
        { weight: 80, reps: -5, rir: 2 }, // outlier: reps negativas
        { weight: 80, reps: 8, rir: 2 },
        { weight: 82.5, reps: 6, rir: 1 }, // más peso → es el top
      ],
    },
    {
      dayKey: '2026-06-03',
      date: '2026-06-03T12:00:00.000Z',
      sets: [{ weight: -10, reps: 8, rir: 2 }], // sesión entera de outliers → se excluye
    },
  ];
  const result = summarizeSessions(input);
  assert.equal(result.length, 1);
  assert.equal(result[0].topWeight, 82.5);
  assert.equal(result[0].topReps, 6);
});

test('summarizeSessions — ordena por dayKey ascendente', () => {
  const input: SessionInput[] = [
    session('2026-06-05', 90, 8, 2),
    session('2026-06-01', 80, 8, 2),
    session('2026-06-03', 85, 8, 2),
  ];
  const result = summarizeSessions(input);
  assert.deepEqual(result.map((s) => s.dayKey), ['2026-06-01', '2026-06-03', '2026-06-05']);
});

test('suggestLoad — sin-datos con pocas sesiones', () => {
  const sessions = [summary('2026-06-01', 80, 8, 2)];
  const result = suggestLoad(sessions);
  assert.equal(result.action, 'sin-datos');
  assert.equal(result.confidence, 'baja');
  assert.match(result.rationale, /2 sesiones más/);
});

test('suggestLoad — subir: reps cumplidas y RIR alto', () => {
  const sessions = [
    summary('2026-06-01', 80, 8, 3),
    summary('2026-06-03', 80, 8, 3),
    summary('2026-06-05', 80, 8, 2),
  ];
  const result = suggestLoad(sessions, { targetReps: 8 });
  assert.equal(result.action, 'subir');
  assert.equal(result.suggestedWeight, 82.5);
  assert.equal(result.confidence, 'alta');
  assert.equal(result.rirUsed, true);
});

test('suggestLoad — mantener: RIR medio', () => {
  const sessions = [
    summary('2026-06-01', 80, 8, 2),
    summary('2026-06-03', 80, 8, 2),
    summary('2026-06-05', 80, 8, 2),
  ];
  // metReps true (8>=8) pero rir=2 no es <=1 y no combina con !metReps → cae en 'mantener'
  const result = suggestLoad(sessions, { targetReps: 10 });
  assert.equal(result.action, 'mantener');
});

test('suggestLoad — bajar: no cumplió reps y RIR bajo', () => {
  const sessions = [
    summary('2026-06-01', 80, 8, 1),
    summary('2026-06-03', 80, 7, 0),
    summary('2026-06-05', 80, 6, 0),
  ];
  const result = suggestLoad(sessions, { targetReps: 10 });
  assert.equal(result.action, 'bajar');
  assert.equal(result.rirUsed, true);
});

test('suggestLoad — degradación elegante sin RIR: sube', () => {
  const sessions = [
    summary('2026-06-01', 80, 8, null),
    summary('2026-06-03', 82.5, 8, null),
    summary('2026-06-05', 85, 8, null),
  ];
  const result = suggestLoad(sessions, { targetReps: 8 });
  assert.equal(result.action, 'subir');
  assert.equal(result.rirUsed, false);
  assert.equal(result.confidence, 'media');
});

test('suggestLoad — degradación elegante sin RIR: baja', () => {
  const sessions = [
    summary('2026-06-01', 85, 8, null),
    summary('2026-06-03', 82.5, 7, null),
    summary('2026-06-05', 80, 6, null),
  ];
  const result = suggestLoad(sessions, { targetReps: 8 });
  assert.equal(result.action, 'bajar');
  assert.equal(result.rirUsed, false);
  assert.equal(result.confidence, 'baja');
});

test('suggestLoad — minSessions configurable', () => {
  const sessions = [summary('2026-06-01', 80, 8, 2), summary('2026-06-03', 80, 8, 2)];
  assert.equal(suggestLoad(sessions, { minSessions: 2 }).action !== 'sin-datos', true);
  assert.equal(suggestLoad(sessions).action, 'sin-datos'); // default MIN_SESSIONS
  assert.equal(MIN_SESSIONS, 3);
});

test('detectStall — meseta detectada tras 3 sesiones sin mejora', () => {
  const sessions = [
    summary('2026-06-01', 80, 8, 2),
    summary('2026-06-03', 80, 8, 2),
    summary('2026-06-05', 80, 7, 1),
  ];
  const result = detectStall(sessions);
  assert.equal(result.deloadSuggested, true);
  assert.equal(result.deloadPctMin, 0.10);
  assert.equal(result.deloadPctMax, 0.20);
});

test('detectStall — sin meseta si hubo mejora', () => {
  const sessions = [
    summary('2026-06-01', 80, 8, 2),
    summary('2026-06-03', 82.5, 8, 2),
    summary('2026-06-05', 82.5, 8, 2),
  ];
  const result = detectStall(sessions);
  assert.equal(result.deloadSuggested, false);
});

test('detectStall — pocas sesiones no sugiere deload', () => {
  const sessions = [summary('2026-06-01', 80, 8, 2)];
  const result = detectStall(sessions);
  assert.equal(result.deloadSuggested, false);
  assert.match(result.rationale, /Necesitás al menos/);
});
