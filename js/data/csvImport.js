// CSV → 기록. 'CSV 내려받기'로 받은 파일을 그대로 다시 올릴 수 있고,
// 같은 열 이름을 쓴 엑셀 파일이나 예전 버전에서 받은 CSV(지역ID 열 없음)도 받는다.
//
// 결과는 바로 저장하지 않고 '계획'으로 돌려준다 → 화면에서 미리 보여주고 확인을 받은 뒤 저장.
//   { ready: [기록…], duplicates: n, skipped: [{ line, reason }] }
import { parseCsv } from '../lib/csv.js';
import { PROVINCES } from './maps.js';
import { COST_KEYS } from '../lib/format.js';

// 열 이름(여러 표기 허용) → 필드
const COLUMNS = {
  startDate: ['시작일', '떠난 날', '시작'],
  endDate: ['종료일', '돌아온 날', '종료'],
  scope: ['구분', '국내/해외'],
  status: ['상태'],
  region: ['지역', '지역명'],
  regionId: ['지역ID', '지역id', '지역 ID'],
  companion: ['동행'],
  place: ['세부장소', '세부 장소'],
  note: ['메모'],
  flight: ['항공료', '항공'],
  lodging: ['숙박비', '숙박'],
  transport: ['교통비', '교통'],
  food: ['식비'],
  other: ['기타비용', '기타'],
};

const STATUS = {
  visited: ['다녀옴', '다녀왔어요', 'visited', '방문'],
  planned: ['예정', '계획 중', '계획중', '계획', 'planned'],
  wishlist: ['위시리스트', '가고 싶어요', '가고싶어요', 'wishlist'],
};

const norm = (t) => String(t ?? '').trim();
const digits = (v) => Number(String(v ?? '').replace(/[^\d]/g, '')) || 0;

/** '2025-5-3', '2025.05.03', '2025/05/03', '20250503' → '2025-05-03' (아니면 null) */
export function normalizeDate(v) {
  const t = norm(v);
  if (!t) return null;
  const m = t.match(/^(\d{4})[-./년\s]*(\d{1,2})[-./월\s]*(\d{1,2})일?$/) || t.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return undefined;                              // 적혀 있지만 읽을 수 없음
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return undefined;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 지역 이름 → id. 같은 이름이 여러 곳(예: 중구)이면 '부산 중구'처럼 시·도를 앞에 붙여야 한다. */
function buildResolver(maps) {
  const byName = { domestic: new Map(), world: new Map() };
  // 띄어쓰기는 무시하고 찾는다 ('전주시 완산구' = '전주시완산구')
  const add = (scope, name, id) => {
    const key = name.replace(/\s+/g, '');
    if (!byName[scope].has(key)) byName[scope].set(key, new Set());
    byName[scope].get(key).add(id);
  };
  maps.kr.forEach((r) => {
    add('domestic', r.name, r.id);
    const prov = PROVINCES[r.id.slice(0, 2)];
    if (prov) add('domestic', `${prov} ${r.name}`, r.id);
  });
  maps.world.forEach((r) => {
    add('world', r.name, r.id);                          // '후쿠오카현 · 일본'
    const short = r.name.includes('·') ? r.name.split('·')[0].trim() : r.name;
    add('world', short, r.id);                            // '후쿠오카현'
    if (r.name.includes('·')) add('world', `${r.name.split('·')[1].trim()} ${short}`, r.id);   // '일본 후쿠오카현' (내려받기 표기)
  });

  return function resolve(scope, name, id) {
    if (id && maps.region(scope, id)) return { id };
    const scopes = scope ? [scope] : ['domestic', 'world'];
    let key = norm(name).replace(/\s+/g, ' ');
    // '부산광역시 중구' → '부산 중구'
    key = key.replace(/^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)\S*\s/, '$1 ');
    const found = [];
    key = key.replace(/\s+/g, '');
    scopes.forEach((sc) => (byName[sc].get(key) || []).forEach((rid) => found.push({ scope: sc, id: rid })));
    if (found.length === 1) return found[0];
    if (found.length > 1) return { error: `'${name}' 지역이 여러 곳이에요. '부산 중구'처럼 시·도를 붙이거나 지역ID 열을 넣어 주세요.` };
    return { error: `'${name}' 지역을 지도에서 찾지 못했어요.` };
  };
}

const dupKey = (e) => [e.scope, e.regionId, e.status, e.startDate || '', e.endDate || ''].join('|');

export function planImport(text, maps, existing) {
  const rows = parseCsv(text);
  if (!rows.length) return { error: '파일이 비어 있어요.' };
  const header = rows[0].map(norm);
  const col = {};
  Object.entries(COLUMNS).forEach(([field, names]) => {
    const i = header.findIndex((hd) => names.includes(hd));
    if (i !== -1) col[field] = i;
  });
  if (col.region === undefined && col.regionId === undefined) {
    return { error: "첫 줄에 '지역' 열이 없어요. 'CSV 내려받기'로 받은 파일 형식에 맞춰 주세요." };
  }

  const resolve = buildResolver(maps);
  const seen = new Set(existing.map(dupKey));
  const ready = []; const skipped = []; let duplicates = 0;
  const get = (r, f) => (col[f] === undefined ? '' : norm(r[col[f]]));

  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;                                 // 엑셀 행 번호와 맞춤 (머리글이 1행)
    const scopeText = get(r, 'scope');
    const scope = scopeText === '국내' ? 'domestic' : scopeText === '해외' ? 'world' : null;
    const statusText = get(r, 'status');
    const status = statusText ? Object.keys(STATUS).find((k) => STATUS[k].includes(statusText)) : 'visited';
    if (!status) { skipped.push({ line, reason: `상태 '${statusText}'를 알 수 없어요.` }); return; }

    const where = resolve(scope, get(r, 'region'), get(r, 'regionId'));
    if (where.error) { skipped.push({ line, reason: where.error }); return; }
    const sc = where.scope || scope;
    const region = maps.region(sc, where.id);

    let startDate = normalizeDate(get(r, 'startDate'));
    let endDate = normalizeDate(get(r, 'endDate'));
    if (startDate === undefined || endDate === undefined) { skipped.push({ line, reason: '날짜 형식을 읽지 못했어요. 2025-05-03 처럼 적어 주세요.' }); return; }
    if (status === 'wishlist') { startDate = null; endDate = null; }
    else if (!startDate) { skipped.push({ line, reason: '시작일이 비어 있어요.' }); return; }
    if (endDate && startDate && endDate < startDate) { skipped.push({ line, reason: '종료일이 시작일보다 빨라요.' }); return; }

    const costs = Object.fromEntries(COST_KEYS.map((k) => [k, digits(get(r, k))]));
    if (sc === 'domestic') costs.flight = 0;              // 항공료는 해외 기록에만

    const entry = {
      scope: sc, regionId: region.id, regionName: region.name, status,
      startDate, endDate: endDate || startDate,
      companion: get(r, 'companion'), place: get(r, 'place'), note: get(r, 'note'), costs,
    };
    const key = dupKey(entry);
    if (seen.has(key)) { duplicates += 1; return; }
    seen.add(key);
    ready.push(entry);
  });

  return { ready, duplicates, skipped, total: rows.length - 1 };
}
