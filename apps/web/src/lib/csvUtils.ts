export function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  function splitLine(line: string): string[] {
    const cells: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        cells.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    return cells;
  }

  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
  return { headers, rows };
}

export function generateCSVTemplate(): string {
  const headers = ['sku', 'barcode', 'location_id', 'location', 'quantity', 'reorder_point', 'reorder_qty', 'bin_location', 'cost'];
  const example = ['TSHIRT-BLK-M', '', '', 'Main Store', '50', '10', '25', 'A1-B2', '12.50'];
  return [headers.join(','), example.join(',')].join('\n');
}
