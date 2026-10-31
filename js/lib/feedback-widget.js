/*!
 * 피드백 창 (Woong's Launchpad 공용) — 의존성 없는 순수 자바스크립트 한 파일.
 * 어느 앱에서든 <script src="feedback-widget.js"></script> 또는 import 한 줄로 붙이고:
 *   LaunchFeedback.open({ app: 'langsplit', lang: 'ko', theme: { bg:'#fff', ink:'#111', ... } })
 * 보낸 내용은 Supabase 의 feedback 표에 쌓여요(읽기는 대시보드에서만).
 * 이 파일을 고치면 런치패드 public/feedback-widget.js 와 각 앱의 사본을 함께 바꿔 주세요.
 */
(function () {
  if (typeof window === 'undefined' || window.LaunchFeedback) return;

  var SUPABASE_URL = 'https://vqmdcyoldsosvonlagdv.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_Q5LoKBKG0YtgZivMORFTsQ_jXfF_0pB';
  var FALLBACK_EMAIL = 'woong2biz@gmail.com';

  var T = {
    ko: { title: '피드백 보내기', intro: '불편했던 점, 고장 난 곳, 있었으면 하는 기능을 알려 주세요. 하나하나 직접 읽어요.', kind: '어떤 이야기인가요?', bug: '고장 났어요', idea: '이런 게 있으면', praise: '좋았어요', other: '그 밖에', message: '내용', hint: '어느 화면에서 무엇을 하다가 그랬는지 적어 주면 고치기 쉬워요.', contact: '답장 받을 연락처 (선택)', contactHint: '비워 두면 익명으로 보내져요.', send: '보내기', sending: '보내는 중…', cancel: '닫기', done: '잘 받았어요. 고마워요!', empty: '내용을 적어 주세요.', error: '지금은 보내지 못했어요. 잠시 뒤 다시 시도하거나 메일로 보내 주세요: ' },
    en: { title: 'Send feedback', intro: 'Tell me what felt awkward, what broke, or what you wish existed. I read every one myself.', kind: 'What kind?', bug: 'Something broke', idea: 'An idea', praise: 'I liked it', other: 'Something else', message: 'Message', hint: 'Saying which screen and what you were doing makes it easier to fix.', contact: 'Where to reply (optional)', contactHint: 'Leave blank to send anonymously.', send: 'Send', sending: 'Sending…', cancel: 'Close', done: 'Got it. Thank you!', empty: 'Please write a message.', error: "It didn't go through. Try again shortly, or email: " },
    ja: { title: 'フィードバックを送る', intro: '不便だった点、壊れていた所、あったらいい機能を教えてください。一つひとつ自分で読みます。', kind: 'どんな内容ですか？', bug: '不具合', idea: 'こんな機能が欲しい', praise: 'よかった', other: 'その他', message: '内容', hint: 'どの画面で何をしていたかを書いてもらえると直しやすいです。', contact: '返信先（任意）', contactHint: '空欄なら匿名で送られます。', send: '送る', sending: '送信中…', cancel: '閉じる', done: '受け取りました。ありがとう！', empty: '内容を書いてください。', error: 'いま送信できませんでした。少し後で試すか、メールで送ってください：' },
    zh: { title: '发送反馈', intro: '告诉我用起来不顺手的地方、坏掉的功能，或者你希望有的功能。每一条我都会亲自看。', kind: '是什么类型？', bug: '出故障了', idea: '我有个想法', praise: '很喜欢', other: '其他', message: '内容', hint: '写清楚在哪个页面、做什么时发生的，会更容易修复。', contact: '回复联系方式（选填）', contactHint: '留空则匿名发送。', send: '发送', sending: '发送中…', cancel: '关闭', done: '收到了，谢谢！', empty: '请填写内容。', error: '暂时没能发送。请稍后再试，或发邮件到：' }
  };

  var CSS = '' +
    '.lfb{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:end center;padding:0;background:rgba(0,0,0,.45);font:inherit;color:var(--lfb-ink)}' +
    '@media(min-width:640px){.lfb{place-items:center;padding:24px}}' +
    '.lfb__box{box-sizing:border-box;width:100%;max-width:520px;max-height:92vh;overflow:auto;background:var(--lfb-bg);color:var(--lfb-ink);padding:28px 24px calc(24px + env(safe-area-inset-bottom));border-radius:var(--lfb-radius) var(--lfb-radius) 0 0;animation:lfb-in .28s cubic-bezier(.16,1,.3,1)}' +
    '@media(min-width:640px){.lfb__box{border-radius:var(--lfb-radius);padding:32px}}' +
    '@keyframes lfb-in{from{transform:translateY(24px);opacity:0}}' +
    '@media(prefers-reduced-motion:reduce){.lfb__box{animation:none}}' +
    '.lfb h2{margin:0;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-.01em}' +
    '.lfb p{margin:0}' +
    '.lfb__intro{margin-top:8px!important;font-size:15px;line-height:1.6;color:var(--lfb-muted)}' +
    '.lfb__label{display:block;margin:22px 0 8px;font-size:15px;font-weight:600}' +
    '.lfb__kinds{display:flex;flex-wrap:wrap;gap:8px;border:0;margin:22px 0 0;padding:0}' +
    '.lfb__kinds legend{padding:0;margin:0 0 8px;font-size:15px;font-weight:600;float:left;width:100%}' +
    '.lfb__kind{position:relative;cursor:pointer;padding:9px 14px;font-size:15px;background:var(--lfb-surface);border-radius:var(--lfb-radius)}' +
    '.lfb__kind input{position:absolute;opacity:0;pointer-events:none}' +
    '.lfb__kind:has(input:checked){background:var(--lfb-accent);color:var(--lfb-accent-ink)}' +
    '.lfb__kind:has(input:focus-visible){outline:2px solid var(--lfb-accent);outline-offset:2px}' +
    '.lfb textarea,.lfb input[type=text]{box-sizing:border-box;width:100%;font:inherit;font-size:16px;color:var(--lfb-ink);background:var(--lfb-surface);border:0;border-radius:var(--lfb-radius);padding:12px 14px;outline:none}' +
    '.lfb textarea{min-height:130px;resize:vertical;line-height:1.55}' +
    '.lfb textarea:focus,.lfb input[type=text]:focus{box-shadow:inset 0 0 0 2px var(--lfb-accent)}' +
    '.lfb__hint{margin-top:6px!important;font-size:13px;line-height:1.5;color:var(--lfb-muted)}' +
    '.lfb__err{margin-top:8px!important;font-size:14px;font-weight:600;color:#c2410c}' +
    '.lfb__err a{color:inherit}' +
    '.lfb__row{display:flex;gap:10px;justify-content:flex-end;margin-top:24px}' +
    '.lfb__btn{font:inherit;font-size:16px;font-weight:600;min-height:48px;padding:0 20px;border:0;border-radius:var(--lfb-radius);cursor:pointer;transition:transform .15s}' +
    '.lfb__btn:active{transform:scale(.97)}' +
    '.lfb__btn--main{background:var(--lfb-accent);color:var(--lfb-accent-ink)}' +
    '.lfb__btn--ghost{background:transparent;color:var(--lfb-ink)}' +
    '.lfb__btn:disabled{opacity:.6;cursor:default}' +
    '.lfb__trap{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}' +
    '.lfb__done{padding:12px 0 4px;font-size:20px;font-weight:700}';

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) n.append(c); });
    return n;
  }

  function open(opts) {
    opts = opts || {};
    var lang = T[opts.lang] ? opts.lang : 'ko';
    var t = T[lang];
    var th = opts.theme || {};
    if (!document.getElementById('lfb-style')) document.head.append(el('style', { id: 'lfb-style', text: CSS }));

    var prevFocus = document.activeElement;
    var uid = 'lfb' + Math.random().toString(36).slice(2, 7);
    var msg = el('textarea', { id: uid + 'm', maxlength: '2000', 'aria-describedby': uid + 'h' });
    var contact = el('input', { id: uid + 'c', type: 'text', maxlength: '200', autocomplete: 'email', 'aria-describedby': uid + 'ch' });
    var trap = el('input', { type: 'text', tabindex: '-1', autocomplete: 'off', class: 'lfb__trap', 'aria-hidden': 'true' });
    var status = el('p', { class: 'lfb__err', role: 'alert' });
    var kinds = ['bug', 'idea', 'praise', 'other'].map(function (k) {
      return el('label', { class: 'lfb__kind' }, [el('input', { type: 'radio', name: uid + 'k', value: k }), document.createTextNode(t[k])]);
    });
    kinds[1].querySelector('input').checked = true;
    var sendBtn = el('button', { type: 'submit', class: 'lfb__btn lfb__btn--main', text: t.send });
    var form = el('form', { novalidate: 'true' }, [
      el('h2', { id: uid + 't', text: t.title }),
      el('p', { class: 'lfb__intro', text: t.intro }),
      el('fieldset', { class: 'lfb__kinds' }, [el('legend', { text: t.kind })].concat(kinds)),
      el('label', { class: 'lfb__label', for: uid + 'm', text: t.message }), msg,
      el('p', { class: 'lfb__hint', id: uid + 'h', text: t.hint }),
      el('label', { class: 'lfb__label', for: uid + 'c', text: t.contact }), contact,
      el('p', { class: 'lfb__hint', id: uid + 'ch', text: t.contactHint }),
      trap, status,
      el('div', { class: 'lfb__row' }, [el('button', { type: 'button', class: 'lfb__btn lfb__btn--ghost', text: t.cancel, onclick: close }), sendBtn])
    ]);
    var box = el('div', { class: 'lfb__box', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': uid + 't' }, [form]);
    var root = el('div', { class: 'lfb' }, [box]);
    var vars = {
      '--lfb-bg': th.bg || '#ffffff', '--lfb-ink': th.ink || '#1d1d1f', '--lfb-muted': th.muted || '#6e6e73',
      '--lfb-surface': th.surface || '#f2f2f4', '--lfb-accent': th.accent || '#1d1d1f', '--lfb-accent-ink': th.accentInk || '#ffffff',
      '--lfb-radius': (th.radius != null ? th.radius : 10) + 'px'
    };
    for (var v in vars) root.style.setProperty(v, vars[v]);

    function close() {
      document.removeEventListener('keydown', onKey);
      root.remove();
      if (prevFocus && prevFocus.focus) prevFocus.focus();
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') { // 창 안에서만 돌게
        var f = box.querySelectorAll('button,textarea,input:not([tabindex="-1"])');
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    root.addEventListener('mousedown', function (e) { if (e.target === root) close(); });
    document.addEventListener('keydown', onKey);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = msg.value.trim();
      if (!text) { status.textContent = t.empty; msg.focus(); return; }
      if (trap.value) { done(); return; }
      var kind = (form.querySelector('input[type=radio]:checked') || {}).value || 'other';
      sendBtn.disabled = true; sendBtn.textContent = t.sending; status.textContent = '';
      fetch(SUPABASE_URL + '/rest/v1/feedback', {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ app: opts.app || 'launchpad', kind: kind, message: text.slice(0, 2000), contact: contact.value.trim().slice(0, 200) || null, lang: lang, page: (location.pathname + location.hash).slice(0, 300) })
      }).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        done();
      }).catch(function () {
        sendBtn.disabled = false; sendBtn.textContent = t.send;
        status.textContent = t.error;
        status.append(el('a', { href: 'mailto:' + FALLBACK_EMAIL + '?subject=' + encodeURIComponent('[' + (opts.app || 'app') + '] feedback') + '&body=' + encodeURIComponent(text), text: FALLBACK_EMAIL }));
      });
    });

    function done() {
      box.replaceChildren(
        el('h2', { id: uid + 't', text: t.title }),
        el('p', { class: 'lfb__done', role: 'status', text: t.done }),
        el('div', { class: 'lfb__row' }, [el('button', { type: 'button', class: 'lfb__btn lfb__btn--main', text: t.cancel, onclick: close })])
      );
      box.querySelector('button').focus();
    }

    document.body.append(root);
    msg.focus();
    return { close: close };
  }

  window.LaunchFeedback = { open: open };
})();
