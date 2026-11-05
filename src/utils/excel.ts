import * as XLSX from 'xlsx';

/**
 * Builds an XLSX workbook in memory from plain JSON row objects, setting readable column widths
 * and preserving exact numeric types for money and count columns so Excel formulas (SUM/AVERAGE) work.
 */
export function createReportWorkbook<TRow extends object>(
  rows: TRow[],
  sheetName: string,
  emptyHeaders?: string[],
): XLSX.WorkBook {
  const safeSheetName = sheetName.slice(0, 31) || 'Report';
  let worksheet: XLSX.WorkSheet;

  if (rows.length > 0) {
    worksheet = XLSX.utils.json_to_sheet(rows);
    const keys = Object.keys(rows[0] as Record<string, unknown>);
    worksheet['!cols'] = keys.map((key) => {
      let maxLen = key.length;
      for (const r of rows) {
        const val = (r as Record<string, unknown>)[key];
        const strLen = val === null || val === undefined ? 0 : String(val).length;
        if (strLen > maxLen) maxLen = strLen;
      }
      return { wch: Math.min(Math.max(maxLen + 3, 12), 40) };
    });
  } else {
    const headers = emptyHeaders ?? [];
    worksheet = XLSX.utils.aoa_to_sheet([headers]);
    worksheet['!cols'] = headers.map((h) => ({
      wch: Math.min(Math.max(h.length + 3, 12), 40),
    }));
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName);
  return workbook;
}

/**
 * Downloads the generated workbook as an .xlsx file in the browser.
 */
export function downloadWorkbookAsExcel<TRow extends object>(
  rows: TRow[],
  sheetName: string,
  filename: string,
  emptyHeaders?: string[],
): void {
  const workbook = createReportWorkbook(rows, sheetName, emptyHeaders);
  XLSX.writeFile(workbook, filename, { bookType: 'xlsx', compression: true });
}
