// 칠하는 색(테마). 지도 10단계, 올해 막대, 진행 막대, 실루엣이 모두 이 한 색을 따른다.
// 기존 앱과 같은 테마 id를 써서, 예전에 고른 색(travel-app-theme)을 그대로 이어받는다.
// 10단계 농도가 종이 바탕에서 구분되도록 기존 스와치보다 조금 진하게 맞춘 값이 있다.

export const THEMES = [
  { id: 'sage', label: '세이지', hex: '#56765C' },
  { id: 'teal', label: '틸', hex: '#3D7068' },
  { id: 'green', label: '그린', hex: '#5C8A52' },
  { id: 'skyblue', label: '스카이블루', hex: '#3F88B5' },
  { id: 'blue', label: '블루', hex: '#3D5A80' },
  { id: 'purple', label: '퍼플', hex: '#7A5C8A' },
  { id: 'pink', label: '핑크', hex: '#B8607A' },
  { id: 'coral', label: '코랄', hex: '#C1684F' },
  { id: 'yellow', label: '옐로우', hex: '#B5862F' },
  { id: 'gray', label: '그레이', hex: '#6B6F76' },
  { id: 'black', label: '블랙', hex: '#34373B' },
];

const KEY = 'travel-log-v2-theme';
const OLD_KEY = 'travel-app-theme';          // 기존 앱의 저장 키

const find = (id) => THEMES.find((t) => t.id === id);

export function readTheme() {
  try {
    const v = localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY);
    return find(v) ? v : 'sage';
  } catch { return 'sage'; }
}

export function applyTheme(id) {
  const t = find(id) || THEMES[0];
  const n = parseInt(t.hex.slice(1), 16);
  document.documentElement.style.setProperty('--accent-rgb', `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`);
  document.documentElement.dataset.accent = t.id;
  return t;
}

export function saveTheme(id) {
  applyTheme(id);
  try { localStorage.setItem(KEY, id); } catch { /* 저장 못 해도 이번 화면에는 적용됨 */ }
}
