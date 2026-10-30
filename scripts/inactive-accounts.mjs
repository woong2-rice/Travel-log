// 휴면 계정 정리 — GitHub Actions 가 매일 한 번 실행한다 (.github/workflows/inactive-accounts.yml)
//
//   1) 마지막 접속이 1년 넘게 지난 계정 → 안내 메일을 보내고 warned_at 기록
//   2) 안내 메일을 보낸 날부터 6개월이 지났는데 그 뒤로 접속이 없으면 → 사진 · 기록 · 계정 삭제
//   3) 안내 메일을 받은 뒤 다시 접속했으면 → 삭제 예정 해제 (앱이 touch_activity 로 직접 풀기도 한다)
//
// '마지막 접속' = max(앱을 연 때 user_activity.last_seen_at, 마지막 로그인 auth.last_sign_in_at, 가입일)
//
// 환경 변수 (GitHub 저장소 Settings > Secrets and variables > Actions)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY      (service_role 키: 절대 앱 코드에 넣지 말 것)
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM
//   APP_URL                                      (메일 속 '여행 기록장 열기' 링크)
//   DRY_RUN=true 이면 메일도 삭제도 하지 않고 무엇을 할지만 출력한다.

import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

export const WARN_AFTER_MONTHS = 12;
export const DELETE_AFTER_WARN_MONTHS = 6;
const BUCKET = 'trip-photos';

export function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));                       // 1월 31일 + 1개월 = 2월 28/29일
  return d;
}

/** 한 계정에 무엇을 할지 정한다 (부수효과 없음 → 테스트 가능) */
export function decide({ createdAt, lastSignInAt, lastSeenAt, warnedAt }, now = new Date()) {
  const times = [createdAt, lastSignInAt, lastSeenAt].filter(Boolean).map((t) => new Date(t).getTime());
  const lastActive = new Date(Math.max(...times));
  if (warnedAt) {
    const warned = new Date(warnedAt);
    if (lastActive > warned) return { action: 'unwarn', lastActive };
    const deleteAt = addMonths(warned, DELETE_AFTER_WARN_MONTHS);
    if (now >= deleteAt) return { action: 'delete', lastActive, deleteAt };
    return { action: 'wait', lastActive, deleteAt };
  }
  if (now >= addMonths(lastActive, WARN_AFTER_MONTHS)) {
    return { action: 'warn', lastActive, deleteAt: addMonths(now, DELETE_AFTER_WARN_MONTHS) };
  }
  return { action: 'none', lastActive };
}

const fmt = (d) => `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;

export function warningMail({ email, lastActive, deleteAt, appUrl }) {
  const subject = `[여행 기록장] ${fmt(deleteAt)}에 계정이 삭제될 예정이에요`;
  const text = [
    '안녕하세요, 여행 기록장이에요.',
    '',
    `${email} 계정으로 ${fmt(lastActive)} 이후 1년 넘게 접속한 기록이 없어요.`,
    `${fmt(deleteAt)}까지 한 번도 접속하지 않으면 계정과 남긴 기록, 사진이 모두 삭제되고 되돌릴 수 없어요.`,
    '',
    '계속 쓰시려면: 아래 주소에서 앱을 한 번 열기만 하면 돼요. 삭제 예정이 바로 풀려요.',
    appUrl,
    '',
    "기록만 보관하고 싶다면: 앱의 설정 > 기록 내보내기에서 'CSV 내려받기'로 파일을 받아 두세요.",
    "나중에 다시 가입해 설정 > 기록 가져오기로 올리면 되살릴 수 있어요. (사진은 포함되지 않아요)",
    '',
    '이 메일은 보관 기간 안내를 위해 한 번만 보내요.',
  ].join('\n');
  const html = `<div style="font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;font-size:15px;line-height:1.65;color:#22241F;max-width:520px">
<p>안녕하세요, 여행 기록장이에요.</p>
<p><b>${email}</b> 계정으로 ${fmt(lastActive)} 이후 1년 넘게 접속한 기록이 없어요.<br>
<b>${fmt(deleteAt)}</b>까지 한 번도 접속하지 않으면 계정과 남긴 기록, 사진이 모두 삭제되고 되돌릴 수 없어요.</p>
<p>계속 쓰시려면 앱을 한 번 열기만 하면 돼요. 삭제 예정이 바로 풀려요.</p>
<p><a href="${appUrl}" style="display:inline-block;padding:10px 18px;background:#22241F;color:#F9F8F6;border-radius:6px;text-decoration:none">여행 기록장 열기</a></p>
<p style="color:#5E615A;font-size:13px">기록만 보관하고 싶다면 설정 &gt; 기록 내보내기에서 'CSV 내려받기'로 파일을 받아 두세요. 나중에 다시 가입해 설정 &gt; 기록 가져오기로 올리면 되살릴 수 있어요. (사진은 포함되지 않아요)<br>이 메일은 보관 기간 안내를 위해 한 번만 보내요.</p>
</div>`;
  return { subject, text, html };
}

// ---------------------------------------------------------------- 실행
async function main() {
  const env = process.env;
  const dryRun = String(env.DRY_RUN || '').toLowerCase() === 'true';
  const need = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'APP_URL', ...(dryRun ? [] : ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'])];
  const missing = need.filter((k) => !env[k]);
  if (missing.length) {
    // 아직 설정 전이면 예약 실행은 조용히 건너뛴다 (매일 실패 메일이 오지 않게). 수동 실행은 오류로 알린다.
    const scheduled = env.GITHUB_EVENT_NAME === 'schedule';
    console.log(`${scheduled ? '::warning::' : '::error::'}Secret이 등록되지 않아 건너뜁니다: ${missing.join(', ')} (README '휴면 계정 정리' 참고)`);
    process.exit(scheduled ? 0 : 1);
  }

  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const mailer = dryRun ? null : nodemailer.createTransport({
    host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 465), secure: Number(env.SMTP_PORT || 465) === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });

  // 활동 기록 전부
  const { data: activityRows, error: actErr } = await sb.from('user_activity').select('user_id,last_seen_at,warned_at');
  if (actErr) throw new Error(`user_activity 를 읽지 못했어요 (supabase/inactive-accounts.sql 실행했나요?): ${actErr.message}`);
  const activity = new Map(activityRows.map((r) => [r.user_id, r]));

  // 계정 전부 (1000명씩)
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }

  const now = new Date();
  const summary = { warn: 0, delete: 0, unwarn: 0, wait: 0, none: 0, failed: 0 };
  for (const u of users) {
    const act = activity.get(u.id);
    const plan = decide({ createdAt: u.created_at, lastSignInAt: u.last_sign_in_at, lastSeenAt: act?.last_seen_at, warnedAt: act?.warned_at }, now);
    summary[plan.action] += 1;
    if (plan.action === 'none' || plan.action === 'wait') continue;
    const who = `${u.email || u.id} (마지막 접속 ${plan.lastActive.toISOString().slice(0, 10)})`;
    try {
      if (plan.action === 'unwarn') {
        console.log(`삭제 예정 해제: ${who}`);
        if (!dryRun) await sb.from('user_activity').update({ warned_at: null }).eq('user_id', u.id);
      } else if (plan.action === 'warn') {
        if (!u.email) { console.log(`이메일 없음, 건너뜀: ${u.id}`); continue; }
        console.log(`안내 메일: ${who} → ${plan.deleteAt.toISOString().slice(0, 10)} 삭제 예정`);
        if (!dryRun) {
          const mail = warningMail({ email: u.email, lastActive: plan.lastActive, deleteAt: plan.deleteAt, appUrl: env.APP_URL });
          await mailer.sendMail({ from: env.MAIL_FROM, to: u.email, ...mail });
          // 메일이 나간 뒤에만 기록 (실패하면 다음 날 다시 시도)
          await sb.from('user_activity').upsert({ user_id: u.id, last_seen_at: act?.last_seen_at || plan.lastActive.toISOString(), warned_at: now.toISOString() });
        }
      } else if (plan.action === 'delete') {
        console.log(`계정 삭제: ${who}`);
        if (!dryRun) {
          // 사진 파일 → 계정 (기록 entries · user_activity 는 계정과 함께 지워진다: on delete cascade)
          for (;;) {
            const { data: files, error } = await sb.storage.from(BUCKET).list(u.id, { limit: 1000 });
            if (error) throw error;
            if (!files.length) break;
            const { error: rmErr } = await sb.storage.from(BUCKET).remove(files.map((f) => `${u.id}/${f.name}`));
            if (rmErr) throw rmErr;
            if (files.length < 1000) break;
          }
          const { error } = await sb.auth.admin.deleteUser(u.id);
          if (error) throw error;
        }
      }
    } catch (err) {
      summary.failed += 1;
      console.error(`::warning::${who} 처리 실패: ${err.message}`);
    }
  }

  console.log(`${dryRun ? '[연습 실행 — 실제로는 아무것도 하지 않음] ' : ''}계정 ${users.length}개 · 안내 메일 ${summary.warn} · 삭제 ${summary.delete} · 예정 해제 ${summary.unwarn} · 삭제 대기 ${summary.wait} · 실패 ${summary.failed}`);
  if (summary.failed) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(`::error::${err.message}`); process.exit(1); });
}
