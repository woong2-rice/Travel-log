// 날짜 · 금액 · 기간 포맷. 화면에 같은 사실이 두 번 나오면 반드시 이 함수들을 거친다.

export const STATUS_LABEL = { visited: '다녀왔어요', planned: '계획 중', wishlist: '가고 싶어요' };
export const COST_KEYS = ['flight', 'lodging', 'transport', 'food', 'other'];
export const COST_LABEL = { flight: '항공', lodging: '숙박', transport: '교통', food: '식비', other: '기타' };

/** '2025-05-03' → '2025.05.03' */
export function fmtDate(iso) {
  return iso ? iso.replaceAll('-', '.') : '';
}

/** 기간: 같은 해면 끝 날짜의 연도를 줄인다. '2025.05.03 – 05.05' */
export function fmtRange(entry) {
  if (!entry.startDate) return '날짜 미정';
  const start = fmtDate(entry.startDate);
  const end = entry.endDate;
  if (!end || end === entry.startDate) return start;
  const sameYear = end.slice(0, 4) === entry.startDate.slice(0, 4);
  return `${start} – ${sameYear ? fmtDate(end.slice(5)) : fmtDate(end)}`;
}

export function daysOf(entry) {
  if (!entry.startDate) return 0;
  const s = new Date(`${entry.startDate}T00:00:00`);
  const e = new Date(`${(entry.endDate || entry.startDate)}T00:00:00`);
  return Math.max(1, Math.round((e - s) / 86400000) + 1);
}

/** '2박 3일' / '당일' */
export function fmtStay(entry) {
  const days = daysOf(entry);
  if (!days) return '';
  return days === 1 ? '당일' : `${days - 1}박 ${days}일`;
}

export function costTotal(entry) {
  if (!entry.costs) return 0;
  return COST_KEYS.reduce((sum, k) => sum + (Number(entry.costs[k]) || 0), 0);
}

const nf = new Intl.NumberFormat('ko-KR');
export const fmtInt = (n) => nf.format(Math.round(n));
export const fmtWon = (n) => `${fmtInt(n)}원`;

/** 큰 금액을 값과 단위로 나눈다. 단위는 작은 회색 글자로 붙인다. */
export function wonParts(n) {
  if (n >= 1e8) return { value: trimZero((n / 1e8).toFixed(1)), unit: '억원' };
  if (n >= 1e4) return { value: fmtInt(n / 1e4), unit: '만원' };
  return { value: fmtInt(n), unit: '원' };
}
const trimZero = (s) => s.replace(/\.0$/, '');

export function pct(part, whole, digits = 1) {
  if (!whole) return '0';
  return trimZero(((part / whole) * 100).toFixed(digits));
}

/** '가고시마현 · 일본' → { name: '가고시마현', parent: '일본' } */
export function splitRegionName(full) {
  if (!full.includes('·')) return { name: full, parent: '' };
  const [name, parent] = full.split('·').map((t) => t.trim());
  return { name, parent };
}

/** 동행 문자열 '민수, 지윤' → ['민수', '지윤'] */
export function companionsOf(entry) {
  return (entry.companion || '').split(/[,、/·]+/).map((t) => t.trim()).filter(Boolean);
}

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
