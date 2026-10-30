// Supabase 연결부. 이전 버전(script.js)과 같은 프로젝트·테이블·스토리지·세션 키를 쓴다.
// → 이전 버전에서 로그인해 두었다면 그 세션을 그대로 이어받는다.
// 서버 모듈을 못 불러오면(오프라인 등) null 을 돌려주고, 앱은 예시 기록으로 동작한다.

const SUPABASE_URL = 'https://vqmdcyoldsosvonlagdv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Q5LoKBKG0YtgZivMORFTsQ_jXfF_0pB';
const SUPABASE_ESM = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
const PHOTO_BUCKET = 'trip-photos';

let sb = null;

const withTimeout = (promise, ms) => Promise.race([
  promise, new Promise((_, reject) => { setTimeout(() => reject(new Error('timeout')), ms); }),
]);

export async function connect() {
  try {
    const { createClient } = await withTimeout(import(SUPABASE_ESM), 6000);
    sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
        storage: window.localStorage, storageKey: 'travel-log-auth',
      },
    });
    const { data } = await withTimeout(sb.auth.getSession(), 6000);
    return { available: true, session: data.session };
  } catch (err) {
    console.warn('서버 모듈을 불러오지 못했어요 — 예시 기록으로 엽니다.', err);
    sb = null;
    return { available: false, session: null };
  }
}

export function onAuthChange(callback) {
  if (!sb) return () => {};
  const { data } = sb.auth.onAuthStateChange((event, session) => callback(event, session));
  return () => data.subscription.unsubscribe();
}

// ---------- 행 ↔ 기록 변환 (schema.sql 의 entries 테이블) ----------
export function rowToEntry(r) {
  return {
    id: r.id, scope: r.scope, regionId: r.region_id, regionName: r.region_name, status: r.status,
    startDate: r.start_date, endDate: r.end_date || r.start_date,
    companion: r.companion || '', place: r.place || '', note: r.note || '',
    costs: {
      flight: r.cost_flight || 0, lodging: r.cost_lodging || 0, transport: r.cost_transport || 0,
      food: r.cost_food || 0, other: r.cost_other || 0,
    },
    photo: r.photo_url || null,
  };
}

function entryToRow(entry, userId) {
  const isWish = entry.status === 'wishlist';
  return {
    user_id: userId, scope: entry.scope, region_id: entry.regionId, region_name: entry.regionName,
    status: entry.status,
    start_date: isWish ? null : entry.startDate,
    end_date: isWish ? null : (entry.endDate && entry.endDate !== entry.startDate ? entry.endDate : null),
    companion: entry.companion || null, place: entry.place || null, note: entry.note || null,
    cost_flight: entry.costs.flight || 0, cost_lodging: entry.costs.lodging || 0,
    cost_transport: entry.costs.transport || 0, cost_food: entry.costs.food || 0, cost_other: entry.costs.other || 0,
    photo_url: entry.photo || null,
  };
}

// ---------- 기록 CRUD ----------
export async function fetchEntries(userId) {
  const { data, error } = await sb.from('entries').select('*').eq('user_id', userId).order('start_date', { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToEntry);
}

export async function insertEntry(entry, userId) {
  const { data, error } = await sb.from('entries').insert(entryToRow(entry, userId)).select().single();
  if (error) throw error;
  return rowToEntry(data);
}

/** 여러 기록을 한 번에 (CSV 가져오기) */
export async function insertEntries(entries, userId) {
  const { data, error } = await sb.from('entries').insert(entries.map((e) => entryToRow({ ...e, photo: null }, userId))).select();
  if (error) throw error;
  return (data || []).map(rowToEntry);
}

export async function updateEntry(id, entry, userId) {
  const { data, error } = await sb.from('entries').update(entryToRow(entry, userId)).eq('id', id).select().single();
  if (error) throw error;
  return rowToEntry(data);
}

export async function deleteEntry(id) {
  const { error } = await sb.from('entries').delete().eq('id', id);
  if (error) throw error;
}

// ---------- 마지막 접속 기록 (휴면 계정 정리용, supabase/inactive-accounts.sql) ----------
/** 접속했다고 남긴다. 안내 메일을 받았던 계정이면 삭제 예정도 이때 풀린다. 실패해도 앱 사용에는 영향 없음. */
export async function touchActivity() {
  if (!sb) return;
  const { error } = await sb.rpc('touch_activity');
  if (error) console.warn('접속 기록을 남기지 못했어요(무시)', error.message);
}

// ---------- 사진 (trip-photos 버킷) ----------
export async function uploadPhoto(blob, userId) {
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await sb.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return sb.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function deletePhoto(url) {
  const marker = `/${PHOTO_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return;
  const { error } = await sb.storage.from(PHOTO_BUCKET).remove([url.slice(i + marker.length).split('?')[0]]);
  if (error) console.warn('사진 파일 삭제 실패(무시)', error);
}

// ---------- 로그인 (이메일 8자리 코드) ----------
export async function sendCode(email) {
  const { error } = await sb.auth.signInWithOtp({ email });
  if (error) throw error;
}
export async function verifyCode(email, token) {
  const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
}
export async function signOut() { await sb?.auth.signOut(); }

/** 인증 오류를 사용자에게 보여줄 문장으로 (기존 앱 describeAuthError 이식) */
export function describeAuthError(error, step) {
  const status = error.status || 0;
  const code = error.code || '';
  const msg = (error.message || '').toLowerCase();
  if (!navigator.onLine) return '인터넷에 연결되어 있지 않아요. 네트워크를 확인하고 다시 시도해 주세요.';
  if (error.name === 'AuthRetryableFetchError' || status === 0 || msg.includes('failed to fetch')) {
    return '서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.';
  }
  if (status === 429 || code.includes('rate_limit')) {
    return step === 'send' ? '요청이 너무 잦아요. 1분 뒤에 다시 코드를 받아 주세요.' : '시도가 너무 많아요. 잠시 후 다시 입력해 주세요.';
  }
  if (status >= 500) return '서버에 일시적인 문제가 있어요. 잠시 후 다시 시도해 주세요.';
  if (step === 'send') {
    if (code === 'email_address_invalid' || code === 'validation_failed') return '이메일 주소 형식을 다시 확인해 주세요.';
    return `코드를 보내지 못했어요: ${error.message}`;
  }
  if (code === 'otp_expired' || msg.includes('expired')) return '코드가 만료됐거나 맞지 않아요. 새 코드를 받아 주세요.';
  return `코드를 확인하지 못했어요: ${error.message}`;
}
