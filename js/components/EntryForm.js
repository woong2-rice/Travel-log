// 기록 추가 · 수정 폼.
// 필수(상태, 날짜)는 처음부터 보이고, 동행 · 비용 · 사진 · 메모는 접어 둔다.
// 접힌 제목 옆에는 지금 입력된 값이 짧게 보여서 펼치지 않아도 내용을 안다.
import { h, icon, disclosure } from '../lib/dom.js';
import { SegmentedToggle } from './controls.js';
import { compressImage } from '../lib/image.js';
import { COST_KEYS, COST_LABEL, fmtInt, fmtWon, todayIso } from '../lib/format.js';

const STATUS_OPTIONS = [
  { value: 'visited', label: '다녀왔어요' },
  { value: 'planned', label: '계획 중' },
  { value: 'wishlist', label: '가고 싶어요' },
];

const digits = (v) => Number(String(v).replace(/[^\d]/g, '')) || 0;

export function EntryForm({ scope, regionId, regionName, displayName = regionName, entry = null, suggestions = [], onSubmit, onCancel }) {
  let status = entry?.status || 'visited';
  let photoBlob = null;
  let photoUrl = entry?.photo || null;
  let removePhoto = false;

  // ---- 필수: 상태 + 날짜 ----
  const statusToggle = SegmentedToggle({
    label: '상태', options: STATUS_OPTIONS, value: status, className: 'segmented--fill',
    onChange: (v) => { status = v; syncDates(); },
  });
  const start = h('input', { class: 'input', type: 'date', id: 'f-start', value: entry?.startDate || todayIso(), required: true });
  const end = h('input', { class: 'input', type: 'date', id: 'f-end', value: entry?.endDate && entry.endDate !== entry.startDate ? entry.endDate : '' });
  start.addEventListener('change', () => { end.min = start.value; });
  end.min = start.value;
  const dates = h('div', { class: 'form__dates' },
    h('label', { class: 'field', for: 'f-start' }, h('span', { class: 'field__label' }, '떠난 날'), start),
    h('label', { class: 'field', for: 'f-end' }, h('span', { class: 'field__label' }, '돌아온 날 (당일이면 비워 두기)'), end));
  function syncDates() { dates.hidden = status === 'wishlist'; }
  syncDates();

  // ---- 동행 ----
  const companion = h('input', { class: 'input', id: 'f-companion', value: entry?.companion || '', placeholder: '이름을 쉼표로 나눠 적기', autocomplete: 'off' });
  const chips = suggestions.slice(0, 6).map((name) => h('button', {
    type: 'button', class: 'pick', 'aria-pressed': 'false',
    onClick: () => {
      const names = companion.value.split(',').map((t) => t.trim()).filter(Boolean);
      const has = names.includes(name);
      companion.value = (has ? names.filter((n) => n !== name) : [...names, name]).join(', ');
      syncCompanion();
    },
  }, name));
  const companionBox = disclosure({ title: '동행', className: 'form__more' },
    h('label', { class: 'field', for: 'f-companion' }, h('span', { class: 'sr-only' }, '동행'), companion),
    chips.length ? h('div', { class: 'picks', role: 'group', 'aria-label': '전에 함께 간 사람' }, chips) : null);
  function syncCompanion() {
    const names = companion.value.split(',').map((t) => t.trim()).filter(Boolean);
    chips.forEach((c) => c.setAttribute('aria-pressed', String(names.includes(c.textContent))));
    companionBox.setPreview(names.length === 0 ? '' : names.length === 1 ? names[0] : `${names[0]} 외 ${names.length - 1}명`);
  }
  companion.addEventListener('input', syncCompanion);

  // ---- 비용 ----
  const costKeys = scope === 'world' ? COST_KEYS : COST_KEYS.filter((k) => k !== 'flight');   // 항공료는 해외만
  const costInputs = Object.fromEntries(costKeys.map((k) => [k, h('input', {
    class: 'input num', id: `f-cost-${k}`, inputmode: 'numeric', autocomplete: 'off', placeholder: '0',
    value: entry?.costs?.[k] ? fmtInt(entry.costs[k]) : '',
  })]));
  const costTotalEl = h('span', { class: 'num' });
  const costBox = disclosure({ title: '비용', className: 'form__more' },
    h('div', { class: 'form__costs' }, costKeys.map((k) => h('label', { class: 'field field--cost', for: `f-cost-${k}` },
      h('span', { class: 'field__label' }, COST_LABEL[k]),
      h('span', { class: 'input-unit' }, costInputs[k], h('span', { class: 'input-unit__suffix', 'aria-hidden': 'true' }, '원'))))),
    h('p', { class: 'form__total' }, '합계 ', costTotalEl));
  function syncCost() {
    const total = costKeys.reduce((s2, k) => s2 + digits(costInputs[k].value), 0);
    costTotalEl.textContent = fmtWon(total);
    costBox.setPreview(total ? fmtWon(total) : '');
  }
  Object.values(costInputs).forEach((inp) => {
    inp.addEventListener('input', syncCost);
    inp.addEventListener('blur', () => { const n = digits(inp.value); inp.value = n ? fmtInt(n) : ''; });
  });

  // ---- 사진 ----
  const fileInput = h('input', { type: 'file', accept: 'image/*', id: 'f-photo', class: 'sr-only' });
  const preview = h('img', { class: 'form__photo', alt: '고른 사진 미리보기', hidden: !photoUrl, src: photoUrl || undefined });
  const removeBtn = h('button', { type: 'button', class: 'btn btn--text btn--danger', hidden: !photoUrl }, '사진 빼기');
  const photoBox = disclosure({ title: '사진', className: 'form__more' },
    h('div', { class: 'form__photo-row' },
      preview,
      h('div', { class: 'form__photo-actions' },
        h('label', { class: 'btn btn--secondary', for: 'f-photo' }, icon('photo'), photoUrl ? '다른 사진 고르기' : '사진 고르기'),
        removeBtn),
      fileInput));
  const syncPhoto = () => photoBox.setPreview(preview.hidden ? '' : '1장');
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      photoBlob = await compressImage(file);
      if (preview.dataset.objurl) URL.revokeObjectURL(preview.dataset.objurl);
      preview.dataset.objurl = URL.createObjectURL(photoBlob);
      preview.src = preview.dataset.objurl;
      preview.hidden = false; removeBtn.hidden = false; removePhoto = false;
      syncPhoto();
    } catch (err) { showError(err.message); }
  });
  removeBtn.addEventListener('click', () => {
    photoBlob = null; removePhoto = true; preview.hidden = true; removeBtn.hidden = true; fileInput.value = '';
    syncPhoto();
  });

  // ---- 메모 ----
  const place = h('input', { class: 'input', id: 'f-place', value: entry?.place || '', placeholder: '예: 애월, 협재' });
  const note = h('textarea', { class: 'input', id: 'f-note', rows: 3, placeholder: '기억하고 싶은 한 줄' }, entry?.note || '');
  const memoBox = disclosure({ title: '메모', className: 'form__more' },
    h('label', { class: 'field', for: 'f-place' }, h('span', { class: 'field__label' }, '세부 장소'), place),
    h('label', { class: 'field', for: 'f-note' }, h('span', { class: 'field__label' }, '메모'), note));
  const syncMemo = () => memoBox.setPreview([place.value.trim(), note.value.trim()].filter(Boolean).join(' · ').slice(0, 24));
  place.addEventListener('input', syncMemo);
  note.addEventListener('input', syncMemo);

  // ---- 제출 ----
  const errorEl = h('p', { class: 'form__error', role: 'alert', hidden: true });
  function showError(text) { errorEl.textContent = text; errorEl.hidden = false; }
  const submitLabel = entry ? '수정 저장' : '기록 저장';
  const submit = h('button', { type: 'submit', class: 'btn btn--primary' }, submitLabel);

  const form = h('form', { class: 'entry-form', novalidate: true, 'aria-label': `${displayName} 기록 ${entry ? '수정' : '추가'}` },
    h('div', { class: 'form__essentials' },
      h('div', { class: 'field' }, h('span', { class: 'field__label', id: 'f-status-label' }, '상태'), statusToggle),
      dates),
    h('div', { class: 'form__group' }, companionBox, costBox, photoBox, memoBox),
    errorEl,
    h('div', { class: 'form__actions' },
      h('button', { type: 'button', class: 'btn btn--text', onClick: () => onCancel?.() }, '취소'),
      submit));

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    errorEl.hidden = true;
    if (status !== 'wishlist') {
      if (!start.value) { showError('떠난 날을 골라 주세요.'); start.focus(); return; }
      if (end.value && end.value < start.value) { showError('돌아온 날이 떠난 날보다 빨라요.'); end.focus(); return; }
    }
    const costs = Object.fromEntries(COST_KEYS.map((k) => [k, costInputs[k] ? digits(costInputs[k].value) : 0]));
    const draft = {
      scope, regionId, regionName, status,
      startDate: status === 'wishlist' ? null : start.value,
      endDate: status === 'wishlist' ? null : (end.value || start.value),
      companion: companion.value.split(',').map((t) => t.trim()).filter(Boolean).join(', '),
      place: place.value.trim(), note: note.value.trim(), costs,
    };
    submit.disabled = true;
    submit.textContent = '저장하는 중…';
    try {
      await onSubmit?.(draft, { photoBlob, removePhoto });
    } catch (err) {
      console.error(err);
      showError(`저장하지 못했어요. ${err.message || '네트워크를 확인하고 다시 눌러 주세요.'}`);
      submit.disabled = false;
      submit.textContent = submitLabel;
    }
  });

  syncCompanion(); syncCost(); syncPhoto(); syncMemo();
  form.focusFirst = () => start.focus({ preventScroll: true });
  return form;
}
