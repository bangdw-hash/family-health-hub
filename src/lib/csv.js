// Excel에서 한글이 깨지지 않도록 BOM을 붙인 CSV. 수식 주입(=,+,-,@) 방지를 위해 위험 문자로 시작하면 ' 를 앞에 붙입니다.
export function csvCell(v) {
  let s = v == null ? '' : Array.isArray(v) ? v.join(' ') : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function toCsv(rows, columns) {
  const head = columns.map(c => csvCell(c.label)).join(',');
  const body = rows.map(r => columns.map(c => csvCell(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(','));
  return '﻿' + [head, ...body].join('\r\n') + '\r\n';
}
