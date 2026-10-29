// 지도 데이터 로딩 + 지역 조회. data/*.json 을 쓴다.

const BASE = new URL('../../data/', import.meta.url);

// 시/군/구 코드 앞 두 자리 → 시·도 (통계청 행정구역 코드)
export const PROVINCES = {
  11: '서울', 21: '부산', 22: '대구', 23: '인천', 24: '광주', 25: '대전', 26: '울산', 29: '세종',
  31: '경기', 32: '강원', 33: '충북', 34: '충남', 35: '전북', 36: '전남', 37: '경북', 38: '경남', 39: '제주',
};

async function getJson(file) {
  const res = await fetch(new URL(file, BASE));
  if (!res.ok) throw new Error(`${file} 을(를) 불러오지 못했어요 (${res.status})`);
  return res.json();
}

/** path d 문자열의 좌표에서 경계 상자 계산 (데이터는 절대좌표 M/L/Z 만 쓴다) */
export function bboxOfPath(d) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  const re = /(-?\d+\.?\d*)[ ,](-?\d+\.?\d*)/g;
  let m;
  while ((m = re.exec(d))) {
    const x = +m[1]; const y = +m[2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, w: Math.max(maxX - minX, 1), h: Math.max(maxY - minY, 1) };
}

// ---------------------------------------------------------------- 세계지도 투영
// world-map.json 은 위도 85°~-58° 를 자른 등장방형(가로 1000 = 경도 360°) 좌표라
// 고위도가 납작하고 가로로 늘어나 보인다. 불러올 때 밀러 원통 도법으로 다시 투영한다.
// 밀러 도법: 사각형 그대로인 평면 지도이면서, 메르카토르처럼 극지방이 지나치게 커지지 않는다.
// 원본 JSON은 기존 앱도 쓰므로 건드리지 않는다.
const SRC = { degPerUnit: 0.36, lonLeft: -180, latTop: 85 };
const RAD = Math.PI / 180;

function miller(lon, lat) {
  const phi = Math.max(-89, Math.min(89, lat)) * RAD;
  return [lon * RAD, 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * phi))];
}

const PAIR = /(-?\d+\.?\d*)[ ,](-?\d+\.?\d*)/g;
const WIDTH = 1000;
const K = WIDTH / (2 * Math.PI);                 // 경도 ±180° 가 가로 1000 이 되게

function projectPoint(x, y) {
  const lon = SRC.lonLeft + x * SRC.degPerUnit;
  const lat = SRC.latTop - y * SRC.degPerUnit;
  const [px, py] = miller(lon, lat);
  return [WIDTH / 2 + px * K, -py * K];           // 화면 y 는 아래로
}

function reprojectWorld(world, outlines) {
  let minY = Infinity; let maxY = -Infinity;
  const mapD = (d) => d.replace(PAIR, (_, x, y) => {
    const [px, py] = projectPoint(+x, +y);
    if (py < minY) minY = py; if (py > maxY) maxY = py;
    return `${px.toFixed(1)},${py.toFixed(1)}`;
  });
  const w2 = world.map((r) => {
    const [cx, cy] = projectPoint(r.cx, r.cy);
    return { ...r, d: mapD(r.d), cx, cy };
  });
  const o2 = outlines.map((o) => ({ ...o, d: mapD(o.d) }));
  // 위쪽 여백을 0으로 당긴다
  const shift = (d) => d.replace(PAIR, (_, x, y) => `${x},${(+y - minY).toFixed(1)}`);
  w2.forEach((r) => { r.d = shift(r.d); r.cy -= minY; });
  o2.forEach((o) => { o.d = shift(o.d); });
  return { world: w2, outlines: o2, viewBox: `0 0 ${WIDTH} ${(maxY - minY).toFixed(1)}` };
}

export async function loadMaps() {
  const [kr, rawWorld, rawOutlines] = await Promise.all([
    getJson('kr-map.json'), getJson('world-map.json'), getJson('world-outlines.json'),
  ]);
  const { world, outlines, viewBox: worldViewBox } = reprojectWorld(rawWorld, rawOutlines);

  const index = { domestic: new Map(kr.map((r) => [r.id, r])), world: new Map(world.map((r) => [r.id, r])) };

  // 해외 진행률은 '나라' 단위: 주/현으로 나뉜 나라도 하나로 센다.
  const countryOf = (r) => (r.kind === 'state' ? r.country : r.name);
  const countries = new Set(world.map(countryOf));

  const bboxCache = new Map();
  function bbox(scope, id) {
    const key = `${scope}:${id}`;
    if (bboxCache.has(key)) return bboxCache.get(key);
    const r = index[scope].get(id);
    if (!r) return null;
    const box = r.bw ? { x: r.bx, y: r.by, w: r.bw, h: r.bh } : bboxOfPath(r.d);
    bboxCache.set(key, box);
    return box;
  }

  return {
    kr, world, outlines,
    viewBox: { domestic: '0 0 916.0 970.8', world: worldViewBox },
    region: (scope, id) => index[scope].get(id) || null,
    bbox,
    countryOf: (id) => { const r = index.world.get(id); return r ? countryOf(r) : null; },
    totals: { domestic: kr.length, world: countries.size },
  };
}
