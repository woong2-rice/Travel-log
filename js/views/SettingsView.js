// 설정 화면. 구역마다: 왼쪽(또는 위) 제목 · 설명, 오른쪽 패널. 컨트롤은 바로 저장된다.
import { h, icon } from '../lib/dom.js';
import { SegmentedToggle } from '../components/controls.js';
import { store } from '../data/store.js';
import * as api from '../data/api.js';
import { readDefaultScope, writeDefaultScope } from './MapView.js';
import { STATUS_LABEL, costTotal, COST_KEYS } from '../lib/format.js';
import { THEMES, readTheme, saveTheme } from '../lib/theme.js';
import { LoginForm } from '../components/LoginForm.js';

export function SettingsView({ toast }) {
  const accountPanel = h('div', { class: 'set-panel' });
  const exportCount = h('span', { class: 'num' });
  const el = h('section', { class: 'view view--settings', id: 'view-settings', 'aria-labelledby': 'set-h', hidden: true },
    h('header', { class: 'view__head' }, h('h1', { class: 'view__title', id: 'set-h' }, '설정')));

  const section = (title, desc, panel) => h('section', { class: 'set-sec' },
    h('div', { class: 'set-sec__label' }, h('h2', { class: 'set-sec__title' }, title), desc ? h('p', { class: 'set-sec__desc' }, desc) : null),
    panel);

  // ---- 계정 ----
  function renderAccount(state) {
    if (!state.backend) {
      accountPanel.replaceChildren(h('p', {}, '서버에 연결할 수 없어 예시 기록을 보여주고 있어요. 인터넷 연결을 확인한 뒤 앱을 다시 열어 주세요.'));
      return;
    }
    if (state.mode === 'cloud') {
      accountPanel.replaceChildren(
        h('div', { class: 'set-row' },
          h('div', {}, h('p', { class: 'set-row__title' }, state.user.email), h('p', { class: 'set-row__desc' }, '기록이 이 계정에 저장돼요.')),
          h('button', { type: 'button', class: 'btn btn--secondary', onClick: () => api.signOut() }, '로그아웃')));
      return;
    }
    accountPanel.replaceChildren(
      h('p', { class: 'set-note' }, '지금은 예시 기록이에요. 로그인해야 기록을 남기고 고칠 수 있어요.'),
      LoginForm({ idPrefix: 'acc', onSuccess: () => toast.show('로그인했어요.') }));
  }

  // ---- 지도 ----
  const scopeToggle = SegmentedToggle({
    label: '처음 열 지도', value: readDefaultScope(),
    options: [{ value: 'domestic', label: '국내' }, { value: 'world', label: '해외' }],
    onChange: (v) => { writeDefaultScope(v); toast.show('저장했어요.'); },
  });
  // 칠하는 색: 고르면 지도 · 차트 · 아래 색 단계가 바로 바뀐다
  let themeId = readTheme();
  const themeName = h('span', { class: 'theme-name' });
  const swatches = THEMES.map((t) => h('button', {
    type: 'button', class: 'theme-swatch', style: `--sw: ${t.hex}`, 'aria-label': t.label, title: t.label,
    'aria-pressed': String(t.id === themeId),
    onClick: () => {
      themeId = t.id; saveTheme(t.id);
      swatches.forEach((b, i) => b.setAttribute('aria-pressed', String(THEMES[i].id === t.id)));
      themeName.textContent = t.label;
    },
  }));
  themeName.textContent = THEMES.find((t) => t.id === themeId)?.label || '';
  const themePicker = h('div', { class: 'set-block' },
    h('p', { class: 'set-row__title' }, '칠하는 색 ', themeName),
    h('div', { class: 'theme-swatches', role: 'group', 'aria-label': '칠하는 색' }, swatches));

  const legend = h('ol', { class: 'ramp', 'aria-label': '방문 횟수별 색' },
    Array.from({ length: 10 }, (_, i) => h('li', { class: 'ramp__step' },
      h('span', { class: 'ramp__swatch', style: { background: `var(--visit-${i + 1})` } }),
      h('span', { class: 'ramp__label num' }, i === 9 ? '10+' : String(i + 1)))));
  const marks = h('ul', { class: 'marks' },
    h('li', {}, h('span', { class: 'mark mark--planned', 'aria-hidden': 'true' }), STATUS_LABEL.planned),
    h('li', {}, h('span', { class: 'mark mark--wishlist', 'aria-hidden': 'true' }), STATUS_LABEL.wishlist));

  // ---- 내보내기 ----
  function exportCsv() {
    const { entries } = store.get();
    if (!entries.length) { toast.show('내보낼 기록이 없어요.', { error: true }); return; }
    const head = ['시작일', '종료일', '구분', '상태', '지역', '동행', '세부장소', '메모', '항공료', '숙박비', '교통비', '식비', '기타비용', '합계'];
    const cell = (v) => { const t = String(v ?? ''); return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const rows = entries.map((e) => [e.startDate, e.endDate, e.scope === 'domestic' ? '국내' : '해외', STATUS_LABEL[e.status],
      e.regionName, e.companion, e.place, e.note, ...COST_KEYS.map((k) => e.costs[k] || 0), costTotal(e)]);
    const csv = [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = h('a', { href: url, download: `여행기록_${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast.show('CSV 파일을 내려받았어요.');
  }

  el.append(
    section('계정', '이메일로 받은 코드로 로그인해요. 비밀번호는 없어요.', accountPanel),
    section('지도', '앱을 열 때 먼저 보일 지도, 칠하는 색과 그 농도 기준이에요.', h('div', { class: 'set-panel' },
      h('div', { class: 'set-row' }, h('p', { class: 'set-row__title' }, '처음 열 지도'), scopeToggle),
      themePicker,
      h('div', { class: 'set-block' }, h('p', { class: 'set-row__title' }, '방문 횟수별 색'), legend, marks))),
    section('기록 내보내기', '엑셀에서 열 수 있는 CSV 파일로 모든 기록을 받아요.', h('div', { class: 'set-panel' },
      h('div', { class: 'set-row' },
        h('p', { class: 'set-row__title' }, '기록 ', exportCount, '건'),
        h('button', { type: 'button', class: 'btn btn--secondary', onClick: exportCsv }, icon('download'), 'CSV 내려받기')))));

  function render(state) {
    renderAccount(state);
    exportCount.textContent = state.entries.length;
  }
  let lastKey = '';
  store.subscribe((state) => {
    const key = `${state.mode}|${state.backend}|${state.user?.id}`;
    if (key !== lastKey) { lastKey = key; renderAccount(state); }     // 입력 중인 폼을 지우지 않게
    exportCount.textContent = state.entries.length;
  });
  render(store.get());
  lastKey = `${store.get().mode}|${store.get().backend}|${store.get().user?.id}`;
  return { el };
}
