// 메인 지도 화면 (라이트). 위: 국내/해외 토글 하나. 아래: 확대 버튼(왼쪽) · 진행률 칩(오른쪽).
// 그 외 문구는 두지 않는다 — 지도가 화면의 전부다.
import { h, icon } from '../lib/dom.js';
import { createMapCanvas } from '../components/MapCanvas.js';
import { SegmentedToggle, ProgressChip } from '../components/controls.js';
import { store, regionCounts, progress, ensureLoggedIn } from '../data/store.js';
import { PROVINCES } from '../data/maps.js';
import { splitRegionName } from '../lib/format.js';

const SCOPE_KEY = 'travel-log-v2-scope';
export const readDefaultScope = () => { try { return localStorage.getItem(SCOPE_KEY) || 'domestic'; } catch { return 'domestic'; } };
export const writeDefaultScope = (v) => { try { localStorage.setItem(SCOPE_KEY, v); } catch { /* 저장 못 해도 동작에는 지장 없음 */ } };

export function MapView({ maps, regionSheet }) {
  let scope = readDefaultScope();
  const canvases = {};
  const stage = h('div', { class: 'map-stage' });

  const toggle = SegmentedToggle({
    label: '지도 범위', value: scope, className: 'map-scope',
    options: [{ value: 'domestic', label: '국내' }, { value: 'world', label: '해외' }],
    onChange: (v) => setScope(v),
  });
  const chip = ProgressChip();
  const zoom = h('div', { class: 'map-zoom', role: 'group', 'aria-label': '지도 확대' },
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': '확대', onClick: () => canvases[scope].zoomIn() }, icon('plus')),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': '축소', onClick: () => canvases[scope].zoomOut() }, icon('minus')),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': '전체 보기', onClick: () => canvases[scope].reset() }, icon('reset')));

  // ---- 지역 찾기: 이름으로 국내·해외 지역을 바로 연다 (작은 섬나라·도시도 손가락으로 누르기 쉽게) ----
  const index = [
    ...maps.kr.map((r) => ({ scope: 'domestic', id: r.id, full: r.name, name: r.name, parent: PROVINCES[r.id.slice(0, 2)] || '국내' })),
    ...maps.world.map((r) => { const { name, parent } = splitRegionName(r.name); return { scope: 'world', id: r.id, full: r.name, name, parent: parent || '해외' }; }),
  ];
  const searchInput = h('input', { class: 'input', type: 'search', placeholder: '지역이나 나라 이름', 'aria-label': '지역 찾기', autocomplete: 'off', enterkeyhint: 'search' });
  const results = h('ul', { class: 'map-search__results' });
  const searchPanel = h('div', { class: 'map-search', hidden: true }, searchInput, results);
  const searchBtn = h('button', { type: 'button', class: 'icon-btn map-search-btn', 'aria-label': '지역 찾기', 'aria-expanded': 'false', onClick: () => toggleSearch() }, icon('search'));
  function toggleSearch(open = searchPanel.hidden) {
    searchPanel.hidden = !open;
    searchBtn.setAttribute('aria-expanded', String(open));
    if (open) { searchInput.value = ''; results.replaceChildren(); searchInput.focus(); } else searchBtn.focus({ preventScroll: true });
  }
  function matches(q) {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return index
      .filter((r) => r.full.toLowerCase().includes(t))
      .sort((a, b) => Number(!a.name.startsWith(t)) - Number(!b.name.startsWith(t)) || a.name.length - b.name.length)
      .slice(0, 8);
  }
  function pick(r) { toggleSearch(false); showRegion(r.scope, r.id, r.full); }
  searchInput.addEventListener('input', () => {
    const list = matches(searchInput.value);
    results.replaceChildren(...(list.length || !searchInput.value.trim()
      ? list.map((r) => h('li', {}, h('button', { type: 'button', class: 'map-search__item', onClick: () => pick(r) },
        h('span', {}, r.name), h('span', { class: 'map-search__parent' }, r.parent))))
      : [h('li', { class: 'map-search__none' }, '맞는 지역이 없어요.')]));
  });
  searchInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { const first = matches(searchInput.value)[0]; if (first) { ev.preventDefault(); pick(first); } }
    if (ev.key === 'Escape') toggleSearch(false);
  });

  // 로그인 전(예시 기록)이라는 표시 + 로그인 바로가기
  const samplePill = h('button', {
    type: 'button', class: 'sample-pill', hidden: true,
    onClick: () => ensureLoggedIn('로그인하면 예시 대신 내 기록이 지도에 칠해져요.'),
  }, h('span', { class: 'sample-pill__tag' }, '예시'), '로그인');

  const el = h('section', { class: 'view view--map', id: 'view-map', 'aria-labelledby': 'map-h' },
    h('h1', { class: 'sr-only', id: 'map-h' }, '지도'),
    samplePill,
    h('div', { class: 'map-top' }, toggle),
    searchBtn, searchPanel,
    stage,
    h('div', { class: 'map-bottom' }, zoom, chip));

  function canvasFor(sc) {
    if (!canvases[sc]) {            // 해외 지도(1,000여 개 지역)는 처음 열 때 만든다
      canvases[sc] = createMapCanvas({
        scope: sc, maps,
        onSelect: (s2, id, name) => { canvases[s2].select(id); regionSheet.openRegion(s2, id, name); },
      });
      stage.append(canvases[sc].el);
    }
    return canvases[sc];
  }

  function setScope(next) {
    if (regionSheet.current) regionSheet.close();
    scope = next;
    toggle.set(next);
    canvasFor(next);
    Object.entries(canvases).forEach(([k, c]) => c.el.toggleAttribute('hidden', k !== next));   // SVG는 .hidden 속성이 없다
    render(store.get());
  }

  function render(state) {
    samplePill.hidden = state.mode === 'cloud';
    canvasFor(scope).paint(regionCounts(state.entries, scope));
    chip.update(progress(state.entries, scope, maps), scope);
  }

  /** 연표 등 다른 화면에서 지역 시트를 열 때 */
  function showRegion(sc, id, name, opts) {
    if (sc !== scope) setScope(sc);
    canvasFor(sc).select(id);
    regionSheet.openRegion(sc, id, name, opts);
  }

  setScope(scope);
  store.subscribe(render);
  return { el, showRegion, clearSelection: () => Object.values(canvases).forEach((c) => c.select(null)) };
}
