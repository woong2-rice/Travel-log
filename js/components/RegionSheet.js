// 지역 기록 시트: 지역 · 방문 요약 → 사진 → '+ 기록 추가' → 기록 목록(접힘/펼침).
// 기록 추가/수정은 같은 시트 안에서 폼으로 바뀐다 (지도를 떠나지 않는다).
import { h, icon } from '../lib/dom.js';
import { createBottomSheet } from './BottomSheet.js';
import { PhotoSlider } from './PhotoSlider.js';
import { EntryForm } from './EntryForm.js';
import { RegionGlyph, CloseButton } from './controls.js';
import { store, entriesForRegion, knownCompanions, saveEntry, removeEntry, markVisited, ensureLoggedIn } from '../data/store.js';
import {
  fmtRange, fmtStay, fmtDate, fmtWon, costTotal, splitRegionName, STATUS_LABEL, COST_KEYS, COST_LABEL,
} from '../lib/format.js';

export function createRegionSheet({ maps, toast, onClose }) {
  const sheet = createBottomSheet({ label: '지역 기록', onClose: () => onClose?.() });
  let current = null;          // { scope, regionId, regionName }
  let mode = 'view';           // 'view' | 'form'
  let editing = null;          // 수정 중인 기록
  let expanded = new Set();    // 펼쳐 둔 기록 id

  store.subscribe(() => { if (current && mode === 'view' && !sheet.el.hidden) render(); });

  function openRegion(scope, regionId, regionName, { expandId = null } = {}) {
    current = { scope, regionId, regionName };
    editing = null;
    expanded = new Set(expandId ? [expandId] : []);
    const hasEntries = entriesForRegion(store.get().entries, scope, regionId).length > 0;
    // 처음 가는 곳은 바로 기록 폼 (로그인했을 때만 — 아니면 요약과 '+ 기록 추가'만 보이고, 누르면 로그인을 권한다)
    mode = !hasEntries && store.get().mode === 'cloud' ? 'form' : 'view';
    render();
    sheet.open(mode === 'form' ? 'full' : 'half');
    sheet.body.scrollTop = 0;
  }

  // ------------------------------------------------------------ 머리
  function header(list) {
    const { name, parent } = splitRegionName(current.regionName);
    const visited = list.filter((e) => e.status === 'visited');
    const planned = list.filter((e) => e.status === 'planned').length;
    const bits = [];
    if (visited.length) bits.push(`${visited.length}번 다녀왔어요`, `마지막 ${fmtDate(visited[0].startDate)}`);
    if (planned) bits.push(`계획 ${planned}건`);
    if (!bits.length) bits.push(list.length ? '가고 싶은 곳' : '아직 기록이 없어요');

    return h('header', { class: 'rs-head' },
      RegionGlyph({ maps, scope: current.scope, regionId: current.regionId, size: 44, filled: visited.length > 0 }),
      h('div', { class: 'rs-head__text' },
        h('h2', { class: 'rs-head__title', id: 'rs-title', tabindex: '-1' }, name),
        h('p', { class: 'rs-head__meta' }, parent ? `${parent} · ` : '', bits.join(' · '))),
      CloseButton('기록 시트 닫기', () => sheet.close()));
  }

  // ------------------------------------------------------------ 기록 한 줄
  function recordItem(entry) {
    const total = costTotal(entry);
    const rows = [];
    if (entry.companion) rows.push(['동행', entry.companion]);
    if (entry.place) rows.push(['세부 장소', entry.place]);
    if (total) {
      const parts = COST_KEYS.filter((k) => entry.costs[k]).map((k) => `${COST_LABEL[k]} ${fmtWon(entry.costs[k])}`);
      rows.push(['비용', h('span', {}, h('span', { class: 'num' }, fmtWon(total)), h('span', { class: 'rs-sub' }, parts.join(' · ')))]);
    }
    if (entry.note) rows.push(['메모', entry.note]);

    const actions = h('div', { class: 'rs-rec__actions' });
    const showActions = () => actions.replaceChildren(...[
      entry.status === 'planned'
        ? h('button', { type: 'button', class: 'btn btn--secondary btn--sm', onClick: doMarkVisited }, '다녀왔어요로 변경')
        : null,
      h('button', { type: 'button', class: 'btn btn--text', onClick: () => startForm(entry) }, '수정'),
      h('button', { type: 'button', class: 'btn btn--text btn--danger', onClick: confirmDelete }, '삭제'),
    ].filter(Boolean));
    async function doMarkVisited() {
      if (!ensureLoggedIn('기록을 바꾸려면 로그인이 필요해요.')) return;
      try { await markVisited(entry.id); toast.show('다녀왔어요로 바꿨어요.'); }
      catch (err) { toast.show(`바꾸지 못했어요. ${err.message || ''}`, { error: true }); }
    }
    function confirmDelete() {
      if (!ensureLoggedIn('기록을 지우려면 로그인이 필요해요.')) return;
      actions.replaceChildren(
        h('span', { class: 'rs-confirm' }, '이 기록을 지울까요?'),
        h('button', { type: 'button', class: 'btn btn--text btn--danger', onClick: doDelete }, '지우기'),
        h('button', { type: 'button', class: 'btn btn--text', onClick: showActions }, '취소'));
      actions.querySelector('.btn--danger').focus();
    }
    async function doDelete() {
      try { await removeEntry(entry.id); toast.show('기록을 지웠어요.'); }
      catch (err) { toast.show(`지우지 못했어요. ${err.message || ''}`, { error: true }); showActions(); }
    }
    showActions();

    const details = h('details', { class: 'rs-rec', open: expanded.has(entry.id) },
      h('summary', { class: 'rs-rec__sum' },
        h('span', { class: 'rs-rec__date num' }, fmtRange(entry)),
        h('span', { class: 'rs-rec__stay' }, entry.status === 'wishlist' ? '' : fmtStay(entry)),
        entry.status !== 'visited' ? h('span', { class: `tag tag--${entry.status}` }, STATUS_LABEL[entry.status]) : null,
        icon('chevron', 'rs-rec__chev')),
      h('div', { class: 'rs-rec__body' },
        rows.length
          ? h('dl', { class: 'rs-rec__rows' }, rows.map(([k, v]) => h('div', { class: 'rs-row' }, h('dt', {}, k), h('dd', {}, v))))
          : h('p', { class: 'rs-empty' }, '동행, 비용, 메모를 아직 적지 않았어요.'),
        actions));
    details.addEventListener('toggle', () => { if (details.open) expanded.add(entry.id); else expanded.delete(entry.id); });
    return h('li', {}, details);
  }

  // ------------------------------------------------------------ 화면
  function renderView() {
    const list = entriesForRegion(store.get().entries, current.scope, current.regionId);
    const photos = list.filter((e) => e.photo).map((e) => ({
      url: e.photo, alt: `${current.regionName} ${fmtRange(e)} 사진`, caption: fmtRange(e),
    }));
    sheet.body.replaceChildren(...[
      header(list),
      photos.length ? PhotoSlider(photos) : null,
      h('button', { type: 'button', class: 'btn btn--primary btn--block rs-add', onClick: () => startForm(null) },
        icon('plus'), '기록 추가'),
      list.length
        ? h('section', { class: 'rs-records', 'aria-labelledby': 'rs-records-h' },
          h('h3', { class: 'rs-records__h', id: 'rs-records-h' }, `기록 ${list.length}건`),
          h('ul', { class: 'rs-records__list' }, list.map(recordItem)))
        : null,
    ].filter(Boolean));
  }

  function renderForm() {
    const list = entriesForRegion(store.get().entries, current.scope, current.regionId);
    const form = EntryForm({
      scope: current.scope, regionId: current.regionId, regionName: current.regionName, entry: editing,
      suggestions: knownCompanions(store.get().entries),
      onCancel: () => (list.length ? backToView() : sheet.close()),
      onSubmit: async (draft, { photoBlob, removePhoto }) => {
        const saved = await saveEntry(draft, { photoBlob, removePhoto, id: editing?.id || null });
        toast.show(editing ? '수정했어요.' : '저장했어요.');
        expanded = new Set([saved.id]);
        backToView();
      },
    });
    sheet.body.replaceChildren(header(list),
      h('h3', { class: 'rs-form-title' }, editing ? `${fmtRange(editing)} 기록 수정` : '새 기록'),
      form);
    return form;
  }

  function render() { if (mode === 'form') renderForm(); else renderView(); }

  function startForm(entry) {
    if (!ensureLoggedIn(entry ? '기록을 고치려면 로그인이 필요해요.' : '기록을 남기려면 로그인이 필요해요. 로그인하면 이 지도에 내 여행이 칠해져요.')) return;
    mode = 'form'; editing = entry;
    const form = renderForm();
    sheet.setSnap('full');
    sheet.body.scrollTop = 0;
    form.focusFirst();
  }
  function backToView() {
    mode = 'view'; editing = null;
    render();
    sheet.body.querySelector('#rs-title')?.focus({ preventScroll: true });
  }

  return {
    el: sheet.el,
    openRegion,
    close: () => sheet.close(),
    get current() { return sheet.el.hidden ? null : current; },
  };
}
