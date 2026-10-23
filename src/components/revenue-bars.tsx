import { brl, dayMonth, weekday, weekdayShort } from '@/lib/time';

const reais = (c: number) => brl(c).replace(/,00$/, '');

/** Barras do faturamento por dia. Passe o mouse (ou toque) numa barra para ver o valor. */
export function RevenueBars({ days, highlight }: { days: { date: string; revenue: number; count: number }[]; highlight?: string }) {
  const W = 720, H = 220, L = 60, B = 26, T = 12;
  const max = Math.max(1, ...days.map((d) => d.revenue));
  const step = [5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000].find((s) => max / s <= 5) ?? 2000000;
  const top = Math.ceil(max / step) * step;
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const bw = (W - L) / days.length;
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  const labelEvery = days.length <= 14 ? 1 : 3;
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Faturamento por dia. Maior dia: ${reais(max)}.`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{v ? reais(v) : '0'}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = L + i * bw + 2, w = Math.max(2, bw - 4), h = H - B - y(d.revenue);
          const r = Math.min(4, w / 2, h);
          const path = h > 0
            ? `M${x},${H - B} V${y(d.revenue) + r} Q${x},${y(d.revenue)} ${x + r},${y(d.revenue)} H${x + w - r} Q${x + w},${y(d.revenue)} ${x + w},${y(d.revenue) + r} V${H - B} Z`
            : '';
          return (
            <g key={d.date} className="bar-g">
              <title>{`${weekdayShort(weekday(d.date))} ${dayMonth(d.date)}: ${brl(d.revenue)} · ${d.count} atendimento${d.count === 1 ? '' : 's'}`}</title>
              <rect x={L + i * bw} y={T} width={bw} height={H - T - B} fill="transparent" />
              {path ? <path d={path} fill="var(--accent)" /> : null}
              {i % labelEvery === 0 ? (
                <text x={x + w / 2} y={H - 8} textAnchor="middle" fontSize={11} fill={d.date === highlight ? 'var(--ink)' : 'var(--muted)'} fontWeight={d.date === highlight ? 700 : 400}>
                  {days.length <= 7 ? weekdayShort(weekday(d.date)) : d.date.slice(8)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
