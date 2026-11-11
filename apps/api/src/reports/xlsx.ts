import ExcelJS from 'exceljs';

export interface SheetColumn {
  header: string;
  key: string;
  /** 'date' and 'datetime' expect ISO strings or Date; 'number' keeps numbers as numbers */
  kind?: 'text' | 'number' | 'integer' | 'percent' | 'date' | 'datetime';
  width?: number;
}

export interface SheetSpec {
  name: string;
  columns: SheetColumn[];
  rows: Record<string, unknown>[];
  /** Lines printed above the table (title, filters, generation time) */
  heading?: string[];
}

const GREEN = 'FF0B8034';
const FORMATS: Partial<Record<NonNullable<SheetColumn['kind']>, string>> = {
  integer: '#,##0',
  number: '#,##0.##',
  percent: '0%',
  date: 'dd mmm yyyy',
  datetime: 'dd mmm yyyy hh:mm',
};

/** One styled table per sheet: green header row, frozen, with filters and sensible widths. */
export async function buildWorkbook(sheets: SheetSpec[], title: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NWRMP · Ministry of Water Development';
  wb.title = title;
  wb.created = new Date();

  for (const spec of sheets) {
    const ws = wb.addWorksheet(spec.name.slice(0, 31));
    const heading = spec.heading ?? [];
    heading.forEach((line, i) => {
      const cell = ws.getCell(i + 1, 1);
      cell.value = line;
      cell.font = i === 0 ? { bold: true, size: 13, color: { argb: GREEN } } : { color: { argb: 'FF5B6670' } };
    });
    const headerRow = heading.length ? heading.length + 2 : 1;

    const header = ws.getRow(headerRow);
    spec.columns.forEach((c, i) => {
      const cell = header.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    header.height = 30;

    spec.rows.forEach((row, r) => {
      const excelRow = ws.getRow(headerRow + 1 + r);
      spec.columns.forEach((c, i) => {
        const cell = excelRow.getCell(i + 1);
        cell.value = toCellValue(row[c.key], c.kind);
        const fmt = c.kind && FORMATS[c.kind];
        if (fmt) cell.numFmt = fmt;
      });
    });

    spec.columns.forEach((c, i) => {
      const longest = Math.max(
        c.header.length * 0.9,
        ...spec.rows.slice(0, 500).map((row) => String(row[c.key] ?? '').length),
      );
      ws.getColumn(i + 1).width = c.width ?? Math.min(50, Math.max(9, Math.ceil(longest) + 2));
    });
    ws.views = [{ state: 'frozen', ySplit: headerRow }];
    if (spec.rows.length) {
      ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow + spec.rows.length, column: spec.columns.length } };
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function toCellValue(value: unknown, kind: SheetColumn['kind']): ExcelJS.CellValue {
  if (value === null || value === undefined || value === '') return null;
  if ((kind === 'date' || kind === 'datetime') && !(value instanceof Date)) {
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? String(value) : d;
  }
  if ((kind === 'number' || kind === 'integer' || kind === 'percent') && typeof value !== 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n : String(value);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object' && !(value instanceof Date)) return JSON.stringify(value);
  return value as ExcelJS.CellValue;
}
