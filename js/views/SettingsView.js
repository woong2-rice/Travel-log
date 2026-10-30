// 설정 화면. 구역마다: 왼쪽(또는 위) 제목 · 설명, 오른쪽 패널. 컨트롤은 바로 저장된다.
import { h, icon } from '../lib/dom.js';
import { SegmentedToggle } from '../components/controls.js';
import { store, ensureLoggedIn, importEntries } from '../data/store.js';
import { planImport } from '../data/csvImport.js';
import { toCsv, readTextFile } from '../lib/csv.js';
import * as api from '../data/api.js';
import { readDefaultScope, writeDefaultScope } from './MapView.js';
import { STATUS_LABEL, costTotal, COST_KEYS } from '../lib/format.js';
import { THEMES, readTheme, saveTheme } from '../lib/theme.js';
import { LoginForm } from '../components/LoginForm.js';

export function SettingsView({ toast, maps }) {
  const accountPanel = h('div', { class: 'set-panel' });
  const exportCount = h('span', { class: 'num' });
  const el = h('section', { class: 'view view--settings', id: 'view-settings', 'aria-labelledby': 'set-h', hidden: true },
    h('header', { class: 'view__head' }, h('h1', { class: 'view__title', id: 'set-h' }, '설정')));

  const section = (title, desc, panel) => h('section', { class: 'set-sec' },
    h('div', { class: 'set-sec__label' }, h('h2', { class: 'set-sec__title' }, title), desc ? h('p', { class: 'set-sec__desc' }, desc) : null),
    panel);

  // ---- 계정 보관 기간 안내 (scripts/inactive-accounts.mjs 와 같은 기준) ----
  const retentionNote = () => h('p', { class: 'set-retention' },
    '1년 동안 접속하지 않으면 가입한 이메일로 안내 메일을 보내요. 그 뒤 6개월 안에 한 번도 들어오지 않으면 계정과 기록, 사진이 모두 삭제돼요. 앱을 한 번 열기만 하면 삭제 예정이 풀려요.');

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
          h('button', { type: 'button', class: 'btn btn--secondary', onClick: () => api.signOut() }, '로그아웃')),
        retentionNote());
      return;
    }
    accountPanel.replaceChildren(
      h('p', { class: 'set-note' }, '지금은 예시 기록이에요. 로그인해야 기록을 남기고 고칠 수 있어요.'),
      LoginForm({ idPrefix: 'acc', onSuccess: () => toast.show('로그인했어요.') }),
      retentionNote());
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
    // 마지막 '지역ID' 열 덕분에 다시 올릴 때 '중구'처럼 이름이 같은 지역도 정확히 찾는다
    const head = ['시작일', '종료일', '구분', '상태', '지역', '동행', '세부장소', '메모', '항공료', '숙박비', '교통비', '식비', '기타비용', '합계', '지역ID'];
    const rows = entries.map((e) => [e.startDate, e.endDate, e.scope === 'domestic' ? '국내' : '해외', STATUS_LABEL[e.status],
      maps.label(e.scope, e.regionId, e.regionName).full, e.companion, e.place, e.note, ...COST_KEYS.map((k) => e.costs[k] || 0), costTotal(e), e.regionId]);
    const url = URL.createObjectURL(new Blob([`\ufeff${toCsv([head, ...rows])}`], { type: 'text/csv;charset=utf-8' }));
    const a = h('a', { href: url, download: `여행기록_${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast.show('CSV 파일을 내려받았어요.');
  }

  // ---- 가져오기: 파일 고르기 → 미리보기(추가 · 이미 있음 · 확인 필요) → 확인하면 저장 ----
  const fileInput = h('input', { type: 'file', accept: '.csv,text/csv', id: 'import-file', class: 'sr-only' });
  const importPreview = h('div', { class: 'import-preview', hidden: true, 'aria-live': 'polite' });
  const pickLabel = h('label', { class: 'btn btn--secondary', for: 'import-file' }, icon('upload'), 'CSV 파일 고르기');
  pickLabel.addEventListener('click', (ev) => {
    if (!ensureLoggedIn('기록을 가져오려면 로그인이 필요해요. 가져온 기록은 로그인한 계정에 저장돼요.')) ev.preventDefault();
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    let plan;
    try { plan = planImport(await readTextFile(file), maps, store.get().entries); }
    catch (err) { plan = { error: `파일을 읽지 못했어요. ${err.message || ''}` }; }
    showPlan(file.name, plan);
  });

  function showPlan(name, plan) {
    importPreview.hidden = false;
    if (plan.error) {
      importPreview.replaceChildren(h('p', { class: 'import-preview__error' }, plan.error));
      return;
    }
    const { ready, duplicates, skipped } = plan;
    const confirmBtn = h('button', { type: 'button', class: 'btn btn--primary', disabled: !ready.length }, `${ready.length}건 가져오기`);
    confirmBtn.addEventListener('click', async () => {
      if (!ensureLoggedIn('기록을 가져오려면 로그인이 필요해요.')) return;
      confirmBtn.disabled = true; confirmBtn.textContent = '가져오는 중…';
      try {
        const n = await importEntries(ready);
        importPreview.hidden = true;
        toast.show(`${n}건을 가져왔어요.`);
      } catch (err) {
        confirmBtn.disabled = false; confirmBtn.textContent = `${ready.length}건 가져오기`;
        toast.show(`가져오지 못했어요. ${err.message || ''}`, { error: true });
      }
    });
    importPreview.replaceChildren(
      h('p', { class: 'import-preview__file' }, name),
      h('dl', { class: 'import-preview__counts' },
        h('div', {}, h('dt', {}, '새로 추가'), h('dd', { class: 'num' }, ready.length)),
        h('div', {}, h('dt', {}, '이미 있음'), h('dd', { class: 'num' }, duplicates)),
        h('div', {}, h('dt', {}, '확인 필요'), h('dd', { class: `num${skipped.length ? ' is-warn' : ''}` }, skipped.length))),
      skipped.length ? h('ul', { class: 'import-preview__issues' },
        skipped.slice(0, 6).map((s2) => h('li', {}, h('span', { class: 'num' }, `${s2.line}행`), s2.reason)),
        skipped.length > 6 ? h('li', { class: 'import-preview__more' }, `외 ${skipped.length - 6}건`) : null) : null,
      h('div', { class: 'import-preview__actions' },
        h('button', { type: 'button', class: 'btn btn--text', onClick: () => { importPreview.hidden = true; } }, '취소'),
        confirmBtn));
  }

  el.append(
    section('계정', '이메일로 받은 코드로 로그인해요. 비밀번호는 없어요.', accountPanel),
    section('지도', '앱을 열 때 먼저 보일 지도, 칠하는 색과 그 농도 기준이에요.', h('div', { class: 'set-panel' },
      h('div', { class: 'set-row' }, h('p', { class: 'set-row__title' }, '처음 열 지도'), scopeToggle),
      themePicker,
      h('div', { class: 'set-block' }, h('p', { class: 'set-row__title' }, '방문 횟수별 색'), legend, marks))),
    section('기록 가져오기', "CSV 파일을 올리면 기록에 더해져요. 'CSV 내려받기'로 받은 파일이나 같은 열 이름으로 만든 엑셀 CSV를 쓸 수 있어요. 이미 있는 기록은 건너뛰어요.", h('div', { class: 'set-panel' },
      h('div', { class: 'set-row' }, h('p', { class: 'set-row__title' }, 'CSV에서 기록 추가'), pickLabel, fileInput),
      importPreview)),
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
