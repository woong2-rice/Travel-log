// 칠하는 지도. 한 범위(국내/해외)의 SVG를 한 번만 만들고, 기록이 바뀌면 칠만 다시 한다.
//   paint(counts)  : 방문 횟수 → data-level(1~10), 계획 → 빗금, 가고 싶어요 → 점선
//   select(id)     : 선택한 지역 테두리 + 시트에 가리지 않게 화면 위쪽으로 이동
import { s } from '../lib/dom.js';
import { createPanZoom } from '../lib/panzoom.js';

const HATCH = { domestic: 9, world: 3.2 };   // 빗금 간격(지도 좌표). 해외 지도는 나라가 작아 촘촘하게.

export const levelFor = (visits) => Math.min(Math.max(visits, 0), 10);

export function createMapCanvas({ scope, maps, onSelect }) {
  const regions = scope === 'domestic' ? maps.kr : maps.world;
  const gap = HATCH[scope];
  const hatchId = `hatch-${scope}`;

  const svg = s('svg', {
    class: `map-svg map-svg--${scope}`, viewBox: maps.viewBox[scope], preserveAspectRatio: 'xMidYMid meet',
    role: 'group', 'aria-label': scope === 'domestic' ? '국내 시·군·구 지도' : '세계 지도',
  },
  s('defs', {},
    s('pattern', { id: hatchId, width: gap, height: gap, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
      s('rect', { width: gap, height: gap, class: 'hatch-bg' }),
      s('line', { x1: 0, y1: 0, x2: 0, y2: gap, class: 'hatch-line', 'stroke-width': gap * 0.28 }))));

  const layer = s('g', { class: 'map-regions' });
  const paths = new Map();
  for (const r of regions) {
    const name = maps.label(scope, r.id).full;    // 툴팁·스크린리더: '부산시 수영구', '강원 강릉시'
    const p = s('path', {
      class: `region${r.kind ? ` region--${r.kind}` : ''}`, d: r.d, 'data-id': r.id,
      tabindex: scope === 'domestic' ? '0' : '-1', role: 'button', 'aria-label': name,
    }, s('title', {}, name));
    paths.set(r.id, p);
    layer.append(p);
  }
  svg.append(layer);

  if (scope === 'world') {
    // 국경 외곽선: 클릭은 아래 지역으로 통과
    svg.append(s('g', { class: 'map-outlines', 'aria-hidden': 'true' },
      ...maps.outlines.map((o) => s('path', { class: 'outline', d: o.d }))));
  }

  const emit = (path) => {
    if (!path?.classList?.contains('region')) return;
    const r = maps.region(scope, path.dataset.id);
    if (r) onSelect?.(scope, r.id, r.name);
  };

  svg.addEventListener('keydown', (ev) => {
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList?.contains('region')) {
      ev.preventDefault();
      emit(ev.target);
    }
  });

  const pz = createPanZoom(svg, { maxScale: scope === 'world' ? 40 : 10, onTap: (hit) => emit(hit?.closest?.('.region')) });

  let selectedId = null;

  function paint(counts) {
    for (const [id, p] of paths) {
      const c = counts.get(id);
      if (c?.visited) {
        p.dataset.level = String(levelFor(c.visited));
        p.dataset.state = 'visited';
      } else {
        delete p.dataset.level;
        p.dataset.state = c?.planned ? 'planned' : c?.wishlist ? 'wishlist' : '';
      }
      p.style.fill = p.dataset.state === 'planned' ? `url(#${hatchId})` : '';
    }
  }

  function select(id, { focus = true } = {}) {
    if (selectedId) paths.get(selectedId)?.classList.remove('is-selected');
    selectedId = id;
    const p = id && paths.get(id);
    if (!p) return;
    p.classList.add('is-selected');
    layer.append(p);                  // 맨 위로 올려 테두리가 이웃에 묻히지 않게
    if (focus) {
      const box = maps.bbox(scope, id);
      if (box) pz.focusBox(box, { visibleFraction: 0.42, pad: scope === 'world' ? 1.2 : 0.6 });
    }
  }

  return { el: svg, paint, select, zoomIn: pz.zoomIn, zoomOut: pz.zoomOut, reset: pz.reset };
}
