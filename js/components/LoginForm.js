// 이메일 8자리 코드 로그인 폼. 로그인 화면(AuthGate)과 설정 화면이 같이 쓴다.
// 성공하면 Supabase 의 onAuthStateChange 가 store 를 'cloud' 로 바꾸고, onSuccess 가 불린다.
import { h } from '../lib/dom.js';
import * as api from '../data/api.js';

const RESEND_WAIT = 60;   // 초. Supabase 는 같은 주소로 60초에 한 번만 코드를 보낸다

export function LoginForm({ idPrefix = 'login', onSuccess } = {}) {
  let pendingEmail = null;
  let cooldownTimer = null;
  const msg = h('p', { class: 'form__msg', role: 'status', 'aria-live': 'polite' });
  const emailInput = h('input', {
    class: 'input', type: 'email', id: `${idPrefix}-email`, autocomplete: 'email', required: true, placeholder: '이메일 주소',
  });
  const codeInput = h('input', {
    class: 'input num', id: `${idPrefix}-code`, inputmode: 'numeric', autocomplete: 'one-time-code',
    maxlength: '8', pattern: '[0-9]*', placeholder: '8자리 숫자',
  });

  const emailForm = h('form', { class: 'set-form' },
    h('label', { class: 'field', for: `${idPrefix}-email` }, h('span', { class: 'field__label' }, '이메일'), emailInput),
    h('button', { type: 'submit', class: 'btn btn--primary' }, '로그인 코드 받기'));
  const codeForm = h('form', { class: 'set-form', hidden: true },
    h('label', { class: 'field', for: `${idPrefix}-code` }, h('span', { class: 'field__label' }, '메일로 받은 8자리 코드'), codeInput),
    h('button', { type: 'submit', class: 'btn btn--primary' }, '로그인'),
    h('div', { class: 'set-form__row' },
      h('button', { type: 'button', class: 'btn btn--text', onClick: showEmailStep }, '다른 이메일로'),
      h('button', { type: 'button', class: 'btn btn--text login-form__resend', onClick: resend }, '코드 다시 받기')));
  const resendBtn = codeForm.querySelector('.login-form__resend');

  function showEmailStep() {
    stopCooldown();
    codeForm.hidden = true; emailForm.hidden = false; msg.textContent = '';
    emailInput.focus();
  }

  // 다시 받기는 60초 뒤에 누를 수 있다 (남은 시간을 버튼에 보여준다)
  function startCooldown() {
    stopCooldown();
    let left = RESEND_WAIT;
    const tick = () => {
      resendBtn.disabled = left > 0;
      resendBtn.textContent = left > 0 ? `코드 다시 받기 (${left}초)` : '코드 다시 받기';
      left -= 1;
      if (left < -1) stopCooldown();
    };
    tick();
    cooldownTimer = setInterval(tick, 1000);
  }
  function stopCooldown() {
    clearInterval(cooldownTimer); cooldownTimer = null;
    resendBtn.disabled = false; resendBtn.textContent = '코드 다시 받기';
  }

  async function resend() {
    if (!pendingEmail) return showEmailStep();
    resendBtn.disabled = true; msg.textContent = '코드를 다시 보내는 중…';
    try {
      await api.sendCode(pendingEmail);
      codeInput.value = ''; codeInput.focus();
      msg.textContent = `${pendingEmail} 로 새 코드를 보냈어요. 가장 최근에 온 메일의 코드를 넣어 주세요.`;
      startCooldown();
    } catch (err) {
      msg.textContent = api.describeAuthError(err, 'send');
      resendBtn.disabled = false;
    }
  }

  emailForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = emailInput.value.trim();
    if (!email) { msg.textContent = '이메일 주소를 적어 주세요.'; return; }
    const btn = emailForm.querySelector('button[type="submit"]');
    btn.disabled = true; msg.textContent = '코드를 보내는 중…';
    try {
      await api.sendCode(email);
      pendingEmail = email;
      emailForm.hidden = true; codeForm.hidden = false; codeInput.value = ''; codeInput.focus();
      msg.textContent = `${email} 로 8자리 코드를 보냈어요. 메일이 안 보이면 스팸함도 확인해 주세요.`;
      startCooldown();
    } catch (err) { msg.textContent = api.describeAuthError(err, 'send'); }
    btn.disabled = false;
  });

  codeForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const token = codeInput.value.trim();
    if (token.length < 8) { msg.textContent = '8자리 코드를 모두 적어 주세요.'; return; }
    const btn = codeForm.querySelector('button[type="submit"]');
    btn.disabled = true; msg.textContent = '확인하는 중…';
    try {
      await api.verifyCode(pendingEmail, token);
      msg.textContent = '';
      stopCooldown();
      onSuccess?.();
    } catch (err) { msg.textContent = api.describeAuthError(err, 'verify'); }
    btn.disabled = false;
  });

  const el = h('div', { class: 'login-form' }, emailForm, codeForm, msg);
  el.focusFirst = () => (codeForm.hidden ? emailInput : codeInput).focus({ preventScroll: true });
  return el;
}
