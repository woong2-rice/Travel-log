// 작은 공용 컴포넌트: 세그먼트 토글, 진행률 칩, 하단 탭 바, 토스트, 지역 실루엣.
import { h, s, icon } from '../lib/dom.js';

/** 세그먼트 토글. options: [{ value, label }] */
export function SegmentedToggle({ label, options, value, onChange, className = '' }) {
  const buttons = options.map((opt) => h('button', {
    type: 'button', class: 'segmented__opt', 'aria-pressed': String(opt.value === value),
    onClick: () => { set(opt.value); onChange?.(opt.value); },
  }, opt.label));
  const el = h('div', { class: `segmented ${className}`.trim(), role: 'group', 'aria-label': label }, buttons);
  function set(v) { buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === v))); }
  el.set = set;
  return el;
}

/** 지도 우측 하단 진행률 칩: '15 / 251' */
export function ProgressChip() {
  const done = h('span', { class: 'num chip__done' });
  const total = h('span', { class: 'num chip__total' });
  const unit = h('span', { class: 'chip__unit' });
  const el = h('p', { class: 'progress-chip', 'aria-live': 'polite' },
    unit, done, h('span', { class: 'chip__slash', 'aria-hidden': 'true' }, '/'), total);
  el.update = ({ done: d, total: t }, scope) => {
    done.textContent = d;
    total.textContent = t;
    unit.textContent = scope === 'world' ? '나라' : '시·군·구';
    el.setAttribute('aria-label', `${scope === 'world' ? '나라' : '시·군·구'} ${t}곳 중 ${d}곳 방문`);
  };
  return el;
}

export const TABS = [
  { id: 'map', label: '지도', icon: 'map' },
  { id: 'timeline', label: '연표', icon: 'timeline' },
  { id: 'analytics', label: '분석', icon: 'chart' },
  { id: 'settings', label: '설정', icon: 'settings' },
];

/** 하단 네비게이션: 해시(#map 등)로 화면을 바꾼다. */
export function BottomNav() {
  const links = TABS.map((t) => h('a', { class: 'tabbar__item', href: `#${t.id}`, 'data-tab': t.id },
    icon(t.icon), h('span', { class: 'tabbar__label' }, t.label)));
  const el = h('nav', { class: 'tabbar', 'aria-label': '화면 이동' }, h('div', { class: 'tabbar__inner' }, links));
  el.setActive = (id) => links.forEach((a) => {
    if (a.dataset.tab === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  return el;
}

/** 화면 아래 짧은 알림. 저장/삭제 결과를 alert() 대신 보여준다. */
export function createToast() {
  const el = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite', hidden: true });
  let timer;
  el.show = (text, { error = false } = {}) => {
    clearTimeout(timer);
    el.textContent = text;
    el.classList.toggle('toast--error', error);
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('is-shown'));
    timer = setTimeout(() => { el.classList.remove('is-shown'); setTimeout(() => { el.hidden = true; }, 240); }, error ? 5200 : 2600);
  };
  return el;
}

/**
 * 지역 실루엣: 사진이 없을 때의 썸네일. 지도 데이터의 그 지역 모양을 그대로 그린다.
 * 이 앱에만 있는 요소 — '다녀온 곳의 모양'이 곧 기록의 얼굴이 된다.
 */
export function RegionGlyph({ maps, scope, regionId, size = 56, filled = true }) {
  const r = maps.region(scope, regionId);
  const box = r && maps.bbox(scope, regionId);
  if (!r || !box) return h('span', { class: 'glyph glyph--empty', style: { width: `${size}px`, height: `${size}px` }, 'aria-hidden': 'true' });
  const pad = Math.max(box.w, box.h) * 0.14;
  const side = Math.max(box.w, box.h) + pad * 2;
  const vb = `${box.x + box.w / 2 - side / 2} ${box.y + box.h / 2 - side / 2} ${side} ${side}`;
  return h('span', { class: `glyph${filled ? '' : ' glyph--outline'}`, style: { width: `${size}px`, height: `${size}px` }, 'aria-hidden': 'true' },
    s('svg', { viewBox: vb, preserveAspectRatio: 'xMidYMid meet' }, s('path', { d: r.d })));
}

/** 닫기 버튼 (아이콘 + 접근 가능한 이름) */
export function CloseButton(label, onClick) {
  return h('button', { type: 'button', class: 'icon-btn', 'aria-label': label, onClick }, icon('close'));
}
