// 작은 DOM 헬퍼. innerHTML 대신 h()로 요소를 만들어 사용자 입력이 HTML로 해석되지 않게 한다.

const SVG_NS = 'http://www.w3.org/2000/svg';
const PROP_KEYS = new Set(['value', 'checked', 'hidden', 'disabled', 'open', 'selected', 'indeterminate']);

function setProps(el, props) {
  for (const [key, val] of Object.entries(props || {})) {
    if (val === undefined || val === null || val === false) continue;
    if (key === 'class') el.setAttribute('class', Array.isArray(val) ? val.filter(Boolean).join(' ') : val);
    else if (key === 'text') el.textContent = val;
    else if (key === 'dataset') Object.assign(el.dataset, val);
    else if (key === 'style' && typeof val === 'object') Object.assign(el.style, val);
    else if (key.startsWith('on') && typeof val === 'function') el.addEventListener(key.slice(2).toLowerCase(), val);
    else if (PROP_KEYS.has(key)) el[key] = val;
    else el.setAttribute(key, val === true ? '' : val);
  }
}

function appendKids(el, kids) {
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
}

/** HTML 요소: h('button', { class: 'btn', onClick }, '저장') */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  setProps(el, props);
  appendKids(el, kids);
  return el;
}

/** SVG 요소: s('path', { d }) */
export function s(tag, attrs, ...kids) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, val] of Object.entries(attrs || {})) {
    if (val === undefined || val === null || val === false) continue;
    if (key === 'class') el.setAttribute('class', val);
    else if (key.startsWith('on') && typeof val === 'function') el.addEventListener(key.slice(2).toLowerCase(), val);
    else el.setAttribute(key, val);
  }
  appendKids(el, kids);
  return el;
}

/** 아이콘: 한 벌의 1.5px 외곽선 아이콘. 경로만 다르다. */
const ICONS = {
  map: 'M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20V6.5ZM9 4v13.5M15 6.5V20',
  timeline: 'M7 3v18M7 6.5h.01M7 12h.01M7 17.5h.01M11 6.5h9M11 12h6M11 17.5h8',
  chart: 'M4 20h16M6.5 20v-6M11 20V8M15.5 20v-9M20 20V5',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  close: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  chevron: 'm9 6 6 6-6 6',
  photo: 'M4 7h3l2-2.5h6L17 7h3v12H4V7Zm8 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  search: 'm20 20-4.5-4.5M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Z',
  download: 'M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M5 19h14',
  upload: 'M12 15V4m0 0 4.5 4.5M12 4 7.5 8.5M5 19h14',
  reset: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5',
};

export function icon(name, extraClass = '') {
  return s('svg', { class: `icon ${extraClass}`.trim(), viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
    s('path', { d: ICONS[name] }));
}

export function clear(el) { el.replaceChildren(); return el; }

/** 접기/펼치기 섹션. summary 옆에 현재 값 미리보기를 보여준다. */
export function disclosure({ title, preview = '', open = false, className = '' }, ...body) {
  const previewEl = h('span', { class: 'disclosure__preview' }, preview);
  const el = h('details', { class: `disclosure ${className}`.trim(), open },
    h('summary', { class: 'disclosure__summary' },
      h('span', { class: 'disclosure__title' }, title),
      previewEl,
      icon('chevron', 'disclosure__chev')),
    h('div', { class: 'disclosure__body' }, ...body));
  el.setPreview = (text) => { previewEl.textContent = text; };
  return el;
}
