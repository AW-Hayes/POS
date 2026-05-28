/** Escape a CSV field — wraps in quotes and doubles any internal quotes. */
function escField(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export function buildCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(escField).join(','), ...rows.map((r) => r.map(escField).join(','))];
  return lines.join('\r\n');
}

export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob(['﻿' + csv, ''], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function isoToLocal(iso: string): string {
  return new Date(iso).toLocaleString();
}
