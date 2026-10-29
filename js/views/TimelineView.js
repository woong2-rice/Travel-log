// 연표 화면 (다크). 연도별로 묶은 세로 타임라인.
// 카드 = 정사각 썸네일(사진, 없으면 그 지역의 모양) + 지역명 + 기간. 누르면 지도에서 그 기록을 연다.
import { h, icon } from '../lib/dom.js';
import { RegionGlyph } from '../components/controls.js';
import { store, timelineGroups } from '../data/store.js';
import { fmtRange, fmtStay, splitRegionName, daysOf, STATUS_LABEL } from '../lib/format.js';

export function TimelineView({ maps, onOpen }) {
  let query = '';
  const summary = h('p', { class: 'view__sub' });
  const list = h('div', { class: 'tl' });
  const search = h('input', {
    class: 'input tl-search__input', type: 'search', id: 'tl-search', placeholder: '지역, 동행, 장소로 찾기', autocomplete: 'off',
  });
  search.addEventListener('input', () => { query = search.value; render(store.get()); });

  const el = h('section', { class: 'view view--timeline', id: 'view-timeline', 'aria-labelledby': 'tl-h', hidden: true },
    h('header', { class: 'view__head' },
      h('h1', { class: 'view__title', id: 'tl-h' }, '연표'),
      summary),
    h('label', { class: 'tl-search', for: 'tl-search' }, h('span', { class: 'sr-only' }, '연표 검색'), icon('search'), search),
    list);

  function card(entry) {
    const { name, parent } = splitRegionName(entry.regionName);
    const thumb = entry.photo
      ? h('img', { class: 'tl-card__img', src: entry.photo, alt: '', loading: 'lazy', decoding: 'async' })
      : RegionGlyph({ maps, scope: entry.scope, regionId: entry.regionId, size: 64, filled: entry.status === 'visited' });
    const meta = [fmtStay(entry), entry.companion].filter(Boolean).join(' · ');
    return h('li', { class: `tl-item${entry.status === 'planned' ? ' is-planned' : ''}` },
      h('button', {
        type: 'button', class: 'tl-card',
        onClick: () => onOpen(entry.scope, entry.regionId, entry.regionName, { expandId: entry.id }),
      },
      h('span', { class: 'tl-card__thumb' }, thumb),
      h('span', { class: 'tl-card__text' },
        h('span', { class: 'tl-card__name' }, name, parent ? h('span', { class: 'tl-card__parent' }, parent) : null),
        h('span', { class: 'tl-card__date num' }, fmtRange(entry)),
        meta ? h('span', { class: 'tl-card__meta' }, meta) : null),
      entry.status === 'planned' ? h('span', { class: 'tag tag--planned' }, STATUS_LABEL.planned) : null));
  }

  function render(state) {
    const all = timelineGroups(state.entries);
    const trips = all.flatMap((g) => g.items).filter((e) => e.status === 'visited');
    if (trips.length) {
      const firstYear = all[all.length - 1].year;
      summary.textContent = `${firstYear}년부터 ${trips.length}번의 여행, ${trips.reduce((s, e) => s + daysOf(e), 0)}일`;
    } else summary.textContent = '';

    const groups = query ? timelineGroups(state.entries, query) : all;
    // 날짜 없는 '가고 싶어요' (기존 앱 플랜 탭의 위시리스트)
    const q = query.trim().toLowerCase();
    const wishes = state.entries
      .filter((e) => e.status === 'wishlist' && (!q || `${e.regionName} ${e.companion} ${e.place}`.toLowerCase().includes(q)))
      .sort((a, b) => a.regionName.localeCompare(b.regionName, 'ko'));
    const wishSection = wishes.length
      ? h('section', { class: 'tl-year tl-wish', 'aria-labelledby': 'y-wish' },
        h('h2', { class: 'tl-year__h', id: 'y-wish' },
          h('span', { class: 'tl-wish__title' }, '언젠가 가고 싶은 곳'),
          h('span', { class: 'tl-year__count' }, `${wishes.length}곳`)),
        h('ul', { class: 'tl-wish__list' }, wishes.map((e) => {
          const { name, parent } = splitRegionName(e.regionName);
          return h('li', {}, h('button', {
            type: 'button', class: 'tl-wish__item',
            onClick: () => onOpen(e.scope, e.regionId, e.regionName, { expandId: e.id }),
          },
          RegionGlyph({ maps, scope: e.scope, regionId: e.regionId, size: 40, filled: false }),
          h('span', { class: 'tl-card__name' }, name, parent ? h('span', { class: 'tl-card__parent' }, parent) : null)));
        })))
      : null;

    if (!groups.length && !wishSection) {
      list.replaceChildren(query
        ? h('p', { class: 'empty' }, `‘${query.trim()}’와 맞는 기록이 없어요.`)
        : h('div', { class: 'empty' },
          h('p', {}, '아직 남긴 여행이 없어요. 지도에서 다녀온 곳을 눌러 첫 기록을 남겨 보세요.'),
          h('a', { class: 'btn btn--secondary', href: '#map' }, '지도로 가기')));
      return;
    }
    list.replaceChildren(...groups.map((g) => {
      const visitedCount = g.items.filter((e) => e.status === 'visited').length;
      return h('section', { class: 'tl-year', 'aria-labelledby': `y-${g.year}` },
        h('h2', { class: 'tl-year__h', id: `y-${g.year}` },
          h('span', { class: 'num tl-year__num' }, g.year),
          h('span', { class: 'tl-year__count' }, visitedCount ? `${visitedCount}번` : '예정')),
        h('ol', { class: 'tl-list' }, g.items.map(card)));
    }), ...(wishSection ? [wishSection] : []));
  }

  store.subscribe(render);
  render(store.get());
  return { el };
}
