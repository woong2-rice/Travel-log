// 앱 상태 한 곳. 화면 컴포넌트는 store.subscribe 로 다시 그리고, 바꿀 때는 아래 action 만 부른다.
// 같은 숫자가 여러 화면에 나오면(진행률, 총 방문 등) 반드시 여기 selector 하나에서 계산한다.

import * as api from './api.js';
import { SAMPLE_ENTRIES } from './sample.js';
import { costTotal, daysOf, companionsOf, COST_KEYS, todayIso } from '../lib/format.js';

const state = {
  mode: 'sample',        // 'sample' | 'cloud'
  backend: false,        // 서버 모듈을 불러왔는가
  user: null,            // { id, email }
  entries: [],
  loading: true,
  error: null,
};

const listeners = new Set();
export const store = {
  get: () => state,
  set(patch) { Object.assign(state, patch); listeners.forEach((fn) => fn(state)); },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

// ---------------------------------------------------------------- 시작 · 로그인
export async function boot() {
  const { available, session } = await api.connect();
  store.set({ backend: available });
  if (session) await enterCloud(session);
  else store.set({ mode: 'sample', entries: structuredClone(SAMPLE_ENTRIES), loading: false });

  api.onAuthChange(async (event, sess) => {
    if (sess && (!state.user || state.user.id !== sess.user.id)) await enterCloud(sess);
    if (event === 'SIGNED_OUT') store.set({ mode: 'sample', user: null, entries: structuredClone(SAMPLE_ENTRIES) });
  });
}

async function enterCloud(session) {
  store.set({ loading: true, user: { id: session.user.id, email: session.user.email || '' }, mode: 'cloud' });
  touchActivityThrottled(session.user.id);
  try {
    store.set({ entries: await api.fetchEntries(session.user.id), loading: false, error: null });
  } catch (err) {
    console.error(err);
    store.set({ loading: false, error: `기록을 불러오지 못했어요. ${err.message || ''}`.trim() });
  }
}

// 접속 기록은 12시간에 한 번만 남긴다 (매번 열 때마다 서버에 쓰지 않게)
function touchActivityThrottled(userId) {
  const key = `travel-log-touched-${userId}`;
  try {
    const last = Number(localStorage.getItem(key)) || 0;
    if (Date.now() - last < 12 * 3600 * 1000) return;
    localStorage.setItem(key, String(Date.now()));
  } catch { /* 저장소를 못 쓰면 매번 남긴다 */ }
  api.touchActivity();
}

// ---------------------------------------------------------------- 로그인 확인
// 로그인하지 않은 상태(예시 기록)에서는 아무것도 저장하지 않는다.
// 화면은 ensureLoggedIn() 으로 먼저 묻고, 아니면 로그인 화면을 띄운다.
let loginPrompt = null;
export function setLoginPrompt(fn) { loginPrompt = fn; }
export function ensureLoggedIn(reason) {
  if (state.mode === 'cloud') return true;
  loginPrompt?.(reason);
  return false;
}
function assertCloud() {
  if (state.mode !== 'cloud') throw new Error('로그인한 뒤에 저장할 수 있어요.');
}

// ---------------------------------------------------------------- 기록 변경
/** draft: 기록 필드 전체, photoBlob: 새 사진, removePhoto: 사진 빼기, id: 수정할 기록 id */
export async function saveEntry(draft, { photoBlob = null, removePhoto = false, id = null } = {}) {
  const prev = id ? state.entries.find((x) => x.id === id) : null;
  const entry = { ...draft, photo: removePhoto ? null : (prev?.photo || null) };

  assertCloud();
  const uid = state.user.id;
  if (photoBlob) entry.photo = await api.uploadPhoto(photoBlob, uid);
  const saved = id ? await api.updateEntry(id, entry, uid) : await api.insertEntry(entry, uid);
  if (prev?.photo && prev.photo !== saved.photo) await api.deletePhoto(prev.photo);
  replaceOrAdd(saved, id);
  return saved;
}

function replaceOrAdd(saved, id) {
  const list = id ? state.entries.map((x) => (x.id === id ? saved : x)) : [...state.entries, saved];
  store.set({ entries: list });
}

/** 계획 중 → 다녀왔어요 (기존 앱의 '다녀왔어요로 변경') */
export async function markVisited(id) {
  const entry = state.entries.find((x) => x.id === id);
  if (!entry) return null;
  const { id: _omit, photo: _p, ...draft } = entry;
  return saveEntry({ ...draft, status: 'visited' }, { id });
}

/** CSV 가져오기: 200건씩 나눠 저장한다 */
export async function importEntries(list) {
  assertCloud();
  const added = [];
  for (let i = 0; i < list.length; i += 200) {
    added.push(...await api.insertEntries(list.slice(i, i + 200), state.user.id));
  }
  store.set({ entries: [...state.entries, ...added] });
  return added.length;
}

export async function removeEntry(id) {
  assertCloud();
  const target = state.entries.find((x) => x.id === id);
  await api.deleteEntry(id);
  if (target?.photo) await api.deletePhoto(target.photo);
  store.set({ entries: state.entries.filter((x) => x.id !== id) });
}

// ---------------------------------------------------------------- selector
const byDateDesc = (a, b) => (b.startDate || '').localeCompare(a.startDate || '');

/** 지역별 상태 개수: Map(regionId → { visited, planned, wishlist }) */
export function regionCounts(entries, scope) {
  const map = new Map();
  for (const e of entries) {
    if (e.scope !== scope) continue;
    const c = map.get(e.regionId) || { visited: 0, planned: 0, wishlist: 0 };
    c[e.status] = (c[e.status] || 0) + 1;
    map.set(e.regionId, c);
  }
  return map;
}

/** 진행률: 국내는 시/군/구, 해외는 나라 단위 */
export function progress(entries, scope, maps) {
  const visited = entries.filter((e) => e.scope === scope && e.status === 'visited');
  const done = scope === 'world'
    ? new Set(visited.map((e) => maps.countryOf(e.regionId) || e.regionName)).size
    : new Set(visited.map((e) => e.regionId)).size;
  return { done, total: maps.totals[scope] };
}

export function entriesForRegion(entries, scope, regionId) {
  return entries.filter((e) => e.scope === scope && e.regionId === regionId).sort(byDateDesc);
}

/** 이전에 쓴 동행 이름 (자주 쓴 순) — 입력 칩 추천용 */
export function knownCompanions(entries) {
  const counts = new Map();
  entries.forEach((e) => companionsOf(e).forEach((n) => counts.set(n, (counts.get(n) || 0) + 1)));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
}

/** 연표용: 다녀온 + 계획 중 기록을 연도별로 (최신 연도부터) */
export function timelineGroups(entries, query = '') {
  const q = query.trim().toLowerCase();
  const list = entries
    .filter((e) => e.status !== 'wishlist' && e.startDate)
    .filter((e) => !q || `${e.regionName} ${e.companion} ${e.place}`.toLowerCase().includes(q))
    .sort(byDateDesc);
  const groups = new Map();
  for (const e of list) {
    const y = e.startDate.slice(0, 4);
    if (!groups.has(y)) groups.set(y, []);
    groups.get(y).push(e);
  }
  return [...groups.entries()].map(([year, items]) => ({ year, items }));
}

/** 분석 화면의 모든 숫자. 합계는 항목에서만 계산한다. */
export function computeStats(entries, maps) {
  const visited = entries.filter((e) => e.status === 'visited');
  const domestic = visited.filter((e) => e.scope === 'domestic');
  const world = visited.filter((e) => e.scope === 'world');

  const costs = Object.fromEntries(COST_KEYS.map((k) => [k, 0]));
  visited.forEach((e) => COST_KEYS.forEach((k) => { costs[k] += Number(e.costs?.[k]) || 0; }));
  const totalCost = COST_KEYS.reduce((s, k) => s + costs[k], 0);
  const costedTrips = visited.filter((e) => costTotal(e) > 0).length;

  const companionCounts = new Map();
  visited.forEach((e) => companionsOf(e).forEach((n) => companionCounts.set(n, (companionCounts.get(n) || 0) + 1)));
  const companions = [...companionCounts.entries()].sort((a, b) => b[1] - a[1]);

  const regionVisits = new Map();
  visited.forEach((e) => {
    const key = `${e.scope}:${e.regionId}`;
    const cur = regionVisits.get(key) || { scope: e.scope, regionId: e.regionId, regionName: e.regionName, count: 0, last: '' };
    cur.count += 1;
    if ((e.startDate || '') > cur.last) cur.last = e.startDate;
    regionVisits.set(key, cur);
  });
  const topRegions = [...regionVisits.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last));

  const years = new Map();
  visited.forEach((e) => { if (e.startDate) { const y = e.startDate.slice(0, 4); years.set(y, (years.get(y) || 0) + 1); } });
  const thisYear = todayIso().slice(0, 4);
  const yearList = [];
  if (years.size) {
    const first = Math.min(...[...years.keys()].map(Number));
    for (let y = first; y <= Number(thisYear); y += 1) yearList.push({ year: String(y), count: years.get(String(y)) || 0 });
  }

  // 시·도별 진행률 (국내)
  const provinceDone = new Map();
  new Set(domestic.map((e) => e.regionId)).forEach((id) => {
    const p = id.slice(0, 2);
    provinceDone.set(p, (provinceDone.get(p) || 0) + 1);
  });
  const provinceTotals = new Map();
  maps.kr.forEach((r) => { const p = r.id.slice(0, 2); provinceTotals.set(p, (provinceTotals.get(p) || 0) + 1); });

  // 국내 · 해외 비교 (비용을 하나도 안 적은 여행은 평균에서 뺀다 — 기존 앱과 같은 기준)
  const scopeStats = (list) => {
    const costed = list.filter((e) => costTotal(e) > 0);
    const spent = costed.reduce((s, e) => s + costTotal(e), 0);
    const costedDays = costed.reduce((s, e) => s + daysOf(e), 0);
    return {
      trips: list.length,
      days: list.reduce((s, e) => s + daysOf(e), 0),
      spent, costed: costed.length,
      perTrip: costed.length ? spent / costed.length : 0,
      perDay: costedDays ? spent / costedDays : 0,
    };
  };
  const countryCounts = new Map();
  world.forEach((e) => { const c = maps.countryOf(e.regionId) || e.regionName; countryCounts.set(c, (countryCounts.get(c) || 0) + 1); });
  const countries = [...countryCounts.entries()].sort((a, b) => b[1] - a[1]);
  const recent = [...visited].sort(byDateDesc)[0] || null;

  const domesticProgress = progress(entries, 'domestic', maps);
  const worldProgress = progress(entries, 'world', maps);

  return {
    tripCount: visited.length,
    domesticTrips: domestic.length,
    worldTrips: world.length,
    totalDays: visited.reduce((s, e) => s + daysOf(e), 0),
    costs, totalCost, costedTrips,
    avgCost: costedTrips ? totalCost / costedTrips : 0,
    companions,
    topRegions,
    yearList, thisYear,
    domesticProgress, worldProgress,
    byScope: { domestic: scopeStats(domestic), world: scopeStats(world) },
    countries, recent,
    provinces: [...provinceTotals.entries()].map(([code, total]) => ({ code, total, done: provinceDone.get(code) || 0 })),
    wishlist: entries.filter((e) => e.status === 'wishlist'),
    planned: entries.filter((e) => e.status === 'planned' && e.startDate >= todayIso()).sort((a, b) => a.startDate.localeCompare(b.startDate)),
  };
}
