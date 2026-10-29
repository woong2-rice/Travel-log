// 결산 화면 차트. 차트 라이브러리 없이 HTML/CSS로 그려 글자가 늘어나지 않고 화면 폭에 맞는다.
// 규칙: 차트 하나에 색 하나(세이지), 비교 대상은 회색, 범례는 그 표시를 줄인 모양, 0은 0으로.
import { h } from '../lib/dom.js';
import { fmtInt, fmtWon, pct } from '../lib/format.js';

/** 눈금: 0부터, 최댓값보다 위에서 끝나는 고른 간격 (3~5개) */
function niceTicks(max) {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw && Number.isInteger(s)) || Math.ceil(raw);
  let top = Math.ceil(max / step) * step;
  if (top === max) top += step;
  const ticks = [];
  for (let t = 0; t <= top; t += step) ticks.push(t);
  return ticks;
}

/**
 * 연도별 막대. data: [{ label, value, current }]
 * 올해(current)만 세이지, 지난 해는 회색. 막대 위에 값, 왼쪽에 눈금.
 */
export function ColumnChart({ data, unit = '', label }) {
  const max = Math.max(0, ...data.map((d) => d.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  return h('figure', { class: 'cchart', role: 'img', 'aria-label': `${label}: ${data.map((d) => `${d.label}년 ${d.value}${unit}`).join(', ')}` },
    h('div', { class: 'cchart__plot' },
      h('div', { class: 'cchart__grid', 'aria-hidden': 'true' },
        ticks.map((t) => h('div', { class: 'cchart__tick', style: { bottom: `${(t / top) * 100}%` } }, h('span', { class: 'num' }, fmtInt(t))))),
      h('ol', { class: 'cchart__cols', 'aria-hidden': 'true' },
        data.map((d) => h('li', { class: `cchart__col${d.current ? ' is-current' : ''}` },
          h('span', { class: 'cchart__area' },
            h('span', { class: 'cchart__bar', style: { height: `${(d.value / top) * 100}%` } },
              h('span', { class: 'cchart__val num' }, fmtInt(d.value)))),
          h('span', { class: 'cchart__label num' }, d.label))))));
}

/**
 * 100% 누적 막대 + 범례 표. parts: [{ key, label, value }]
 * 한 색(세이지)의 농도 단계로 나누고 2px 틈으로 가른다. 범례 표가 금액과 비율을 함께 보여준다.
 */
const SHARE_ALPHA = [1, 0.74, 0.54, 0.38, 0.24];
export function ShareBar({ parts, label }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const shown = parts.filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
  const colorOf = (i) => `rgb(var(--accent-rgb) / ${SHARE_ALPHA[i] ?? 0.14})`;
  return h('figure', { class: 'share' },
    h('div', { class: 'share__bar', role: 'img', 'aria-label': `${label}: ${shown.map((p) => `${p.label} ${pct(p.value, total)}%`).join(', ')}` },
      shown.map((p, i) => h('span', { class: 'share__seg', style: { flexGrow: String(p.value), background: colorOf(i) } }))),
    h('table', { class: 'share__legend' },
      h('caption', { class: 'sr-only' }, label),
      h('tbody', {}, shown.map((p, i) => h('tr', {},
        h('th', { scope: 'row' }, h('span', { class: 'swatch', style: { background: colorOf(i) } }), p.label),
        h('td', { class: 'num' }, fmtWon(p.value)),
        h('td', { class: 'num share__pct' }, `${pct(p.value, total)}%`))))));
}

/**
 * 순위 목록: 이름 · 값, 아래에 2px 비례 막대. 1위만 진한 색, 나머지는 회색.
 * rows: [{ label, value, sub, lead }] — lead 는 이름 앞 요소(지역 실루엣 등)
 */
export function BarList({ rows, unit = '' }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return h('ol', { class: 'barlist' }, rows.map((r, i) => h('li', { class: `barlist__row${i === 0 ? ' is-top' : ''}` },
    r.lead || null,
    h('div', { class: 'barlist__main' },
      h('div', { class: 'barlist__line' },
        h('span', { class: 'barlist__name' }, r.label, r.sub ? h('span', { class: 'barlist__sub' }, r.sub) : null),
        h('span', { class: 'barlist__val' }, h('span', { class: 'num' }, fmtInt(r.value)), h('span', { class: 'unit' }, unit))),
      h('span', { class: 'barlist__bar', style: { width: `${(r.value / max) * 100}%` }, 'aria-hidden': 'true' })))));
}

/** 진행 막대 목록: 시·도별 n / 전체. 채움은 실제 비율, 0이면 채움 없음. */
export function ProgressRows({ rows }) {
  return h('ul', { class: 'prows' }, rows.map((r) => h('li', { class: `prow${r.done ? '' : ' is-zero'}` },
    h('span', { class: 'prow__name' }, r.label),
    h('span', { class: 'prow__val' }, h('span', { class: 'num' }, r.done), h('span', { class: 'unit' }, ` / ${r.total}`)),
    h('span', { class: 'prow__track', role: 'img', 'aria-label': `${r.label} ${r.total}곳 중 ${r.done}곳` },
      r.done ? h('span', { class: 'prow__fill', style: { width: `${(r.done / r.total) * 100}%` } }) : null))));
}
