// 분석 · 결산 화면. 질문: "내 여행 인생은 지금 어디까지 왔나?"
// 맨 위 한 줄 = 올해의 발견, 그 아래 핵심 숫자 4개(한 컨테이너를 1px 선으로 나눔), 그 아래 질문별 카드.
import { h } from '../lib/dom.js';
import { ColumnChart, ShareBar, BarList, ProgressRows } from '../charts/charts.js';
import { RegionGlyph } from '../components/controls.js';
import { store, computeStats } from '../data/store.js';
import { PROVINCES } from '../data/maps.js';
import { wonParts, fmtInt, pct, fmtDate, splitRegionName, COST_KEYS, COST_LABEL, fmtRange } from '../lib/format.js';

export function AnalyticsView({ maps }) {
  const finding = h('p', { class: 'view__sub' });
  const body = h('div', { class: 'an' });
  const el = h('section', { class: 'view view--analytics', id: 'view-analytics', 'aria-labelledby': 'an-h', hidden: true },
    h('header', { class: 'view__head' }, h('h1', { class: 'view__title', id: 'an-h' }, '분석'), finding),
    body);

  const kpi = (label, value, unit, caption) => h('div', { class: 'kpi' },
    h('dt', { class: 'kpi__label' }, label),
    h('dd', { class: 'kpi__value' }, value, unit ? h('span', { class: 'kpi__unit' }, unit) : null),
    h('dd', { class: 'kpi__cap' }, caption));

  const panel = (id, title, aside, ...content) => h('section', { class: `panel panel--${id}`, 'aria-labelledby': `p-${id}` },
    h('header', { class: 'panel__head' }, h('h2', { class: 'panel__title', id: `p-${id}` }, title), aside ? h('p', { class: 'panel__aside' }, aside) : null),
    ...content);

  function findingText(s) {
    if (!s.tripCount) return '아직 결산할 여행이 없어요. 지도에서 다녀온 곳을 칠하면 여기서 모아 볼 수 있어요.';
    const thisY = s.yearList.find((y) => y.year === s.thisYear)?.count || 0;
    const lastY = s.yearList.find((y) => Number(y.year) === Number(s.thisYear) - 1)?.count;
    const next = s.planned[0];
    let text = `올해 ${thisY}번 떠났어요`;
    if (lastY !== undefined) text += thisY === lastY ? ', 작년과 같아요.' : `, 작년보다 ${Math.abs(thisY - lastY)}번 ${thisY > lastY ? '많아요' : '적어요'}.`;
    else text += '.';
    if (next) text += ` 다음은 ${fmtDate(next.startDate)} ${splitRegionName(next.regionName).name}.`;
    return text;
  }

  function render(state) {
    const s = computeStats(state.entries, maps);
    finding.textContent = findingText(s);

    if (!s.tripCount) {
      body.replaceChildren(h('div', { class: 'empty' }, h('a', { class: 'btn btn--secondary', href: '#map' }, '지도로 가기')));
      return;
    }

    const cost = wonParts(s.totalCost);
    const avg = wonParts(s.avgCost);
    const [topName, topCount] = s.companions[0] || [];
    const dp = s.domesticProgress;

    const kpis = h('dl', { class: 'kpis' },
      kpi('총 방문', h('span', { class: 'num' }, fmtInt(s.tripCount)), '번', `국내 ${s.domesticTrips} · 해외 ${s.worldTrips}`),
      kpi('총 비용', h('span', { class: 'num' }, cost.value), cost.unit,
        s.costedTrips ? `한 번에 평균 ${avg.value}${avg.unit}` : '비용을 적은 여행이 없어요'),
      kpi('대표 동행', h('span', { class: 'kpi__text' }, topName || '—'), null, topName ? `${topCount}번 함께` : '동행을 적은 여행이 없어요'),
      kpi('가본 비율', h('span', { class: 'num' }, pct(dp.done, dp.total)), '%', `시·군·구 ${dp.total}곳 중 ${dp.done}곳`));

    const years = panel('years', '해마다 몇 번 떠났을까', '다녀온 여행 수',
      ColumnChart({ label: '연도별 여행 수', unit: '번', data: s.yearList.map((y) => ({ label: y.year, value: y.count, current: y.year === s.thisYear })) }));

    const costs = panel('costs', '돈은 어디에 썼을까', s.costedTrips < s.tripCount ? `비용을 적은 ${s.costedTrips}번 기준` : null,
      s.totalCost
        ? ShareBar({ label: '비용 구성', parts: COST_KEYS.map((k) => ({ key: k, label: COST_LABEL[k], value: s.costs[k] })) })
        : h('p', { class: 'empty-line' }, '아직 적은 비용이 없어요. 기록을 수정해 비용을 넣어 보세요.'));

    const people = panel('people', '누구와 갔을까', null,
      s.companions.length
        ? BarList({ unit: '번', rows: s.companions.slice(0, 5).map(([name, count]) => ({ label: name, value: count, lead: h('span', { class: 'initial', 'aria-hidden': 'true' }, name.slice(0, 1)) })) })
        : h('p', { class: 'empty-line' }, '동행을 적은 여행이 아직 없어요.'));

    const places = panel('places', '자주 간 곳', null,
      BarList({
        unit: '번',
        rows: s.topRegions.slice(0, 5).map((r) => ({
          label: splitRegionName(r.regionName).name, value: r.count,
          sub: fmtDate(r.last),
          lead: RegionGlyph({ maps, scope: r.scope, regionId: r.regionId, size: 32 }),
        })),
      }));

    const provinceRows = s.provinces
      .map((p) => ({ label: PROVINCES[p.code] || p.code, done: p.done, total: p.total }))
      .sort((a, b) => b.done / b.total - a.done / a.total || a.label.localeCompare(b.label, 'ko'));
    // 국내 · 해외 비교 (기존 앱의 국내/해외 비용 블록 + 많이 간 나라)
    const d = s.byScope.domestic; const w = s.byScope.world;
    const money = (n, has) => (has ? (() => { const p2 = wonParts(n); return [h('span', { class: 'num' }, p2.value), h('span', { class: 'unit' }, p2.unit)]; })() : h('span', { class: 'dash' }, '—'));
    const row = (label, a, b) => h('tr', {}, h('th', { scope: 'row' }, label), h('td', {}, a), h('td', {}, b));
    const count = (n, unit) => [h('span', { class: 'num' }, fmtInt(n)), h('span', { class: 'unit' }, unit)];
    const compare = panel('compare', '국내와 해외', s.costedTrips < s.tripCount ? '비용 없는 여행은 평균에서 뺐어요' : null,
      h('table', { class: 'cmp' },
        h('thead', {}, h('tr', {}, h('td', {}), h('th', { scope: 'col' }, '국내'), h('th', { scope: 'col' }, '해외'))),
        h('tbody', {},
          row('여행', count(d.trips, '번'), count(w.trips, '번')),
          row('다녀온 곳', count(s.domesticProgress.done, '곳'), count(s.worldProgress.done, '개 나라')),
          row('여행 일수', count(d.days, '일'), count(w.days, '일')),
          row('총 지출', money(d.spent, d.costed), money(w.spent, w.costed)),
          row('1회 평균', money(d.perTrip, d.costed), money(w.perTrip, w.costed)),
          row('하루 평균', money(d.perDay, d.costed), money(w.perDay, w.costed)))),
      s.countries.length
        ? h('div', { class: 'cmp__countries' }, h('h3', { class: 'cmp__h' }, '많이 간 나라'),
          BarList({ unit: '번', rows: s.countries.slice(0, 5).map(([name, n]) => ({ label: name, value: n })) }))
        : null,
      s.recent ? h('p', { class: 'cmp__recent' }, '가장 최근 여행 ',
        h('strong', {}, splitRegionName(s.recent.regionName).name), ' ', h('span', { class: 'num' }, fmtRange(s.recent))) : null);

    const provinces = panel('provinces', '시·도별로 칠한 정도', `해외는 ${s.worldProgress.done}개 나라`,
      ProgressRows({ rows: provinceRows }));

    const nextRows = [
      ...s.planned.slice(0, 4).map((e) => h('li', {},
        h('span', { class: 'next-list__name' }, splitRegionName(e.regionName).name),
        h('span', { class: 'num next-list__date' }, fmtRange(e)))),
      ...s.wishlist.slice(0, 5 - Math.min(4, s.planned.length)).map((e) => h('li', {},
        h('span', { class: 'next-list__name' }, splitRegionName(e.regionName).name),
        h('span', { class: 'tag tag--wishlist' }, '가고 싶어요'))),
    ];
    const next = nextRows.length
      ? panel('next', '다음 여행', s.planned.length ? `계획 ${s.planned.length}건` : null, h('ul', { class: 'next-list' }, nextRows))
      : null;

    body.replaceChildren(kpis,
      h('div', { class: 'an-grid' }, years, costs, people, places, next, compare, provinces));
  }

  store.subscribe(render);
  render(store.get());
  return { el };
}
