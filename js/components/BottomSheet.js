// Tripsy 식 바텀 시트. 지도를 덮지 않고 아래에서 올라온다.
//   두 높이: 'half'(지도가 위에 보임) ↔ 'full'. 손잡이를 끌어 바꾸고, 아래로 끌면 닫힌다.
//   Esc 로 닫고, 닫으면 열기 전 포커스로 돌아간다.
import { h } from '../lib/dom.js';

export function createBottomSheet({ label, onClose } = {}) {
  const handle = h('button', { type: 'button', class: 'sheet__handle', 'aria-label': '시트 높이 바꾸기' },
    h('span', { class: 'sheet__grip', 'aria-hidden': 'true' }));
  const body = h('div', { class: 'sheet__body' });
  const el = h('section', { class: 'sheet', role: 'dialog', 'aria-modal': 'false', 'aria-label': label, hidden: true, 'data-snap': 'closed' },
    handle, body);

  let snap = 'closed';
  let returnFocus = null;

  // 'half' 높이에서 시트가 내려가 있는 거리(px)
  const offsetFor = (name) => {
    const height = el.getBoundingClientRect().height;
    if (name === 'full') return 0;
    if (name === 'half') return Math.max(0, height - Math.round(window.innerHeight * 0.5));
    return height + 24;
  };

  function setSnap(name) {
    snap = name;
    el.dataset.snap = name;
    const offset = offsetFor(name);
    el.style.transform = `translateY(${offset}px)`;
    // 반쯤 열린 상태에서도 스크롤로 마지막 내용까지 닿도록, 화면 밖으로 내려간 만큼 여백을 준다
    body.style.paddingBottom = name === 'half' ? `${offset + 32}px` : '';
  }

  function open(initial = 'half') {
    if (el.hidden) {
      returnFocus = document.activeElement;
      el.hidden = false;
      el.style.transition = 'none';
      setSnap('closed');
      el.getBoundingClientRect();          // 시작 위치를 먼저 그린 뒤
      el.style.transition = '';
    }
    requestAnimationFrame(() => setSnap(initial));
  }

  function close() {
    if (el.hidden) return;
    setSnap('closed');
    const done = () => { el.hidden = true; el.removeEventListener('transitionend', done); };
    el.addEventListener('transitionend', done);
    setTimeout(done, 400);
    onClose?.();
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }

  // ---- 끌기 ----
  let drag = null;
  handle.addEventListener('pointerdown', (ev) => {
    handle.setPointerCapture(ev.pointerId);
    drag = { y: ev.clientY, start: offsetFor(snap), t: performance.now(), moved: false };
    el.style.transition = 'none';
  });
  handle.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const dy = ev.clientY - drag.y;
    if (Math.abs(dy) > 4) drag.moved = true;
    el.style.transform = `translateY(${Math.max(0, drag.start + dy)}px)`;
  });
  const endDrag = (ev) => {
    if (!drag) return;
    el.style.transition = '';
    const dy = ev.clientY - drag.y;
    const velocity = dy / Math.max(1, performance.now() - drag.t);   // px/ms
    const wasTap = !drag.moved;
    drag = null;
    if (wasTap) { setSnap(snap === 'full' ? 'half' : 'full'); return; }
    if (velocity > 0.6 || dy > 160) { snap === 'full' && dy < 320 ? setSnap('half') : close(); return; }
    if (velocity < -0.6 || dy < -80) { setSnap('full'); return; }
    setSnap(snap);
  };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);
  handle.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowUp') { ev.preventDefault(); setSnap('full'); }
    if (ev.key === 'ArrowDown') { ev.preventDefault(); snap === 'full' ? setSnap('half') : close(); }
  });

  el.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') close(); });
  window.addEventListener('resize', () => { if (!el.hidden) setSnap(snap); });

  return {
    el, body, open, close, setSnap,
    get isOpen() { return !el.hidden && snap !== 'closed'; },
    get snap() { return snap; },
  };
}
