export type ExcelColumn = { width: number };

/** Exportação estruturada reutilizável: uma linha por registo. */
export async function downloadExcelRows(
  rows: Record<string, unknown>[],
  sheetName: string,
  filename: string,
  columns: ExcelColumn[] = [],
) {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.json_to_sheet(rows);
  if (columns.length) sheet["!cols"] = columns.map(({ width }) => ({ wch: width }));
  if (rows.length && sheet["!ref"]) sheet["!autofilter"] = { ref: sheet["!ref"] };
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31));
  XLSX.writeFile(book, filename);
}