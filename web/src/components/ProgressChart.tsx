// Gráfico de progreso SVG sin dependencias externas.
// Recibe puntos ordenados por fecha (más viejo primero) y dibuja línea + puntos.

const W = 300;
const H = 130;
const PAD = { top: 18, right: 16, bottom: 28, left: 52 };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;

export type ChartPoint = { date: string; value: number };

function xPos(i: number, total: number): number {
  if (total === 1) return PAD.left + INNER_W / 2;
  return PAD.left + (i / (total - 1)) * INNER_W;
}

function yPos(v: number, min: number, range: number): number {
  return PAD.top + INNER_H - ((v - min) / range) * INNER_H;
}

function fmtDate(dayKey: string): string {
  const [, m, d] = dayKey.split('-');
  return `${parseInt(d)}/${parseInt(m)}`;
}

function fmtVal(v: number): string {
  if (v >= 10000) return `${Math.round(v / 1000)}k`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(Math.round(v * 10) / 10);
}

export function ProgressChart({ points }: { points: ChartPoint[] }) {
  if (points.length === 0) return null;

  const values = points.map((p) => p.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  const xs = points.map((_, i) => xPos(i, points.length));
  const ys = points.map((p) => yPos(p.value, minVal, range));

  const linePath = points
    .map((_, i) => `${i === 0 ? 'M' : 'L'}${xs[i].toFixed(1)},${ys[i].toFixed(1)}`)
    .join(' ');

  const yTop = PAD.top;
  const yBot = PAD.top + INNER_H;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      aria-label="Gráfico de progreso"
      role="img"
    >
      {/* Grid lines */}
      <line
        x1={PAD.left} y1={yTop} x2={W - PAD.right} y2={yTop}
        className="stroke-border" strokeWidth="1" strokeDasharray="4 3"
      />
      <line
        x1={PAD.left} y1={yBot} x2={W - PAD.right} y2={yBot}
        className="stroke-border" strokeWidth="1" strokeDasharray="4 3"
      />

      {/* Y labels */}
      <text
        x={PAD.left - 6} y={yTop + 4}
        textAnchor="end" fontSize="9" className="tabular fill-muted"
      >
        {fmtVal(maxVal)}
      </text>
      <text
        x={PAD.left - 6} y={yBot}
        textAnchor="end" fontSize="9" className="tabular fill-muted"
      >
        {fmtVal(minVal)}
      </text>

      {/* Line */}
      <path
        d={linePath}
        fill="none"
        className="stroke-brand"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Data points */}
      {points.map((_, i) => (
        <circle
          key={i}
          cx={xs[i]}
          cy={ys[i]}
          r="3.5"
          className="fill-brand stroke-surface"
          strokeWidth="2"
        />
      ))}

      {/* X labels: first and last */}
      <text
        x={xs[0]} y={H - 6}
        textAnchor="middle" fontSize="8" className="fill-muted"
      >
        {fmtDate(points[0].date)}
      </text>
      {points.length > 1 && (
        <text
          x={xs[points.length - 1]} y={H - 6}
          textAnchor="middle" fontSize="8" className="fill-muted"
        >
          {fmtDate(points[points.length - 1].date)}
        </text>
      )}
    </svg>
  );
}
