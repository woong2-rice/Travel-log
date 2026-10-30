// 로그인 화면. 로그인하지 않은 사람이 기록을 남기지 못하게 하는 관문.
//   - 앱을 처음 열 때(로그인 안 됨): 로그인 / '먼저 예시로 둘러보기'
//   - 둘러보는 중에 기록 추가·수정·삭제를 누를 때: 이유를 알려 주고 다시 로그인을 권한다
//   - 로그인하면 저절로 닫히고, 로그아웃하면 다시 열린다
import { h, s } from '../lib/dom.js';
import { store } from '../data/store.js';
import { LoginForm } from './LoginForm.js';

const BROWSE_KEY = 'travel-log-browse';   // 이번 탭에서 '둘러보기'를 골랐는지 (탭을 닫으면 초기화)

const appMark = () => s('svg', { class: 'gate__mark', viewBox: '0 0 64 64', 'aria-hidden': 'true' },
  s('g', { fill: 'none', stroke: 'currentColor', 'stroke-width': '3', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' },
    s('path', { d: 'M14 19 L26 15 L38 19 L50 15 L50 45 L38 49 L26 45 L14 49 Z' }),
    s('path', { d: 'M26 15 V45 M38 19 V49' })),
  s('circle', { cx: '38', cy: '31.5', r: '4.6', class: 'gate__dot' }));

export function createAuthGate({ toast }) {
  const reasonEl = h('p', { class: 'gate__reason' });
  const offlineEl = h('p', { class: 'gate__offline', hidden: true },
    '지금은 서버에 연결할 수 없어 로그인할 수 없어요. 인터넷 연결을 확인한 뒤 앱을 다시 열어 주세요.');
  const form = LoginForm({ idPrefix: 'gate', onSuccess: () => { toast.show('로그인했어요.'); close(); } });
  const browseBtn = h('button', { type: 'button', class: 'btn btn--text gate__browse', onClick: browse }, '먼저 예시로 둘러보기');

  const el = h('div', { class: 'gate', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'gate-title', hidden: true },
    h('div', { class: 'gate__card' },
      appMark(),
      h('h2', { class: 'gate__title', id: 'gate-title' }, '여행 기록장'),
      h('p', { class: 'gate__tagline' }, '다녀온 곳을 칠하고, 내 여행 인생을 결산해요.'),
      reasonEl,
      offlineEl,
      form,
      browseBtn));

  let returnFocus = null;

  function open(reason = '로그인하면 내 기록이 이 계정에 안전하게 저장돼요.') {
    const { backend } = store.get();
    reasonEl.textContent = reason;
    offlineEl.hidden = backend;
    form.hidden = !backend;
    browseBtn.textContent = store.get().mode === 'sample' && sessionStorage.getItem(BROWSE_KEY) ? '예시 계속 보기' : '먼저 예시로 둘러보기';
    if (el.hidden) returnFocus = document.activeElement;
    el.hidden = false;
    document.body.classList.add('is-gated');
    requestAnimationFrame(() => (backend ? form.focusFirst() : browseBtn.focus()));
  }

  function close() {
    if (el.hidden) return;
    el.hidden = true;
    document.body.classList.remove('is-gated');
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }

  function browse() {
    try { sessionStorage.setItem(BROWSE_KEY, '1'); } catch { /* 저장 못 해도 이번에는 닫힌다 */ }
    close();
  }

  el.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') browse();
    if (ev.key === 'Tab') {                       // 포커스를 관문 안에 가둔다
      const items = [...el.querySelectorAll('button, input')].filter((n) => !n.disabled && n.offsetParent !== null);
      const first = items[0]; const last = items[items.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
  });

  // 로그인되면 닫고, 로그아웃되면 다시 연다
  let lastMode = store.get().mode;
  store.subscribe((state) => {
    if (state.mode === lastMode) return;
    if (state.mode === 'cloud') close();
    else if (lastMode === 'cloud') open('로그아웃했어요. 다시 로그인하면 내 기록을 볼 수 있어요.');
    lastMode = state.mode;
  });

  /** 앱 시작 시: 로그인 안 됐고 이번 탭에서 둘러보기를 고르지 않았으면 연다 */
  function openIfNeeded() {
    let browsing = false;
    try { browsing = !!sessionStorage.getItem(BROWSE_KEY); } catch { /* 없음으로 본다 */ }
    if (store.get().mode !== 'cloud' && !browsing) open();
  }

  return { el, open, close, openIfNeeded };
}
