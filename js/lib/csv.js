// CSV 읽기 · 쓰기. 엑셀에서 저장한 파일(한글 윈도우는 CP949)도 읽는다.

/** 따옴표 안의 쉼표·줄바꿈, "" 이스케이프를 처리해 행 배열로 */
export function parseCsv(text) {
  const rows = [];
  let row = []; let cell = ''; let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

export function toCsv(rows) {
  const cell = (v) => { const t = String(v ?? ''); return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

/** 파일을 글자로: UTF-8 이 아니면 CP949(EUC-KR)로 다시 읽는다 */
export async function readTextFile(file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { return new TextDecoder('euc-kr').decode(buf); }
}
