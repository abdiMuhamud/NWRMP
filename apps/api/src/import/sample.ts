import path from 'node:path';
import type { Db } from '../database/db';
import { importWorkbook, type ImportSummary } from './excel-import';

// Works from both src/import (tsx) and dist/import (compiled).
export const SAMPLE_WORKBOOK = path.resolve(__dirname, '../../data/National_Water_Source_Data_SAMPLE.xlsx');

export async function importSample(db: Db): Promise<ImportSummary> {
  return importWorkbook(db, SAMPLE_WORKBOOK, {
    batch: `sample-${new Date().toISOString().slice(0, 10)}`,
    dataSource: 'Sample workbook (example data)',
  });
}

export async function seedIfEmpty(db: Db): Promise<ImportSummary | null> {
  const [{ count }] = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM water_sources');
  if (count > 0) return null;
  return importSample(db);
}

export function describeImport(summary: ImportSummary): string {
  const sheets = summary.sheets
    .map((s) => `  ${s.sheet.padEnd(20)} ${String(s.imported).padStart(4)} imported, ${s.skipped} skipped`)
    .join('\n');
  const { info, warning, error } = summary.issues;
  return [
    `Import ${summary.batch}: ${summary.imported} sources imported, ${summary.skipped} skipped`,
    sheets,
    `  Issues logged: ${error} errors, ${warning} warnings, ${info} notes; ${summary.possibleDuplicates} possible duplicates`,
  ].join('\n');
}
