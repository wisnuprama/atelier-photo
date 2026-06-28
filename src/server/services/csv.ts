import Papa from "papaparse";

/**
 * CSV reader/writer for the admin photo table export/import round-trip, backed
 * by PapaParse. Operates on a grid of rows (`string[][]`); quoting/escaping of
 * embedded commas, double-quotes, and newlines is handled by the library.
 */

/** Serialize a grid of rows to RFC 4180 CSV text (fields quoted as needed, CRLF rows). */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return Papa.unparse(rows as string[][], { newline: "\r\n" });
}

/**
 * Parse CSV text into a grid of rows. Tolerates `\n`/`\r\n` line endings and a
 * trailing newline (blank lines are skipped); quoted fields with embedded
 * commas/quotes/newlines are preserved.
 */
export function parseCsv(text: string): string[][] {
  const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
  return result.data;
}

/**
 * Whether a parsed header row matches `expected` exactly (after trimming each
 * cell). Used to reject CSVs whose column shape doesn't match the export.
 */
export function headerMatches(header: readonly string[], expected: readonly string[]): boolean {
  if (header.length !== expected.length) return false;
  return expected.every((col, i) => header[i]?.trim() === col);
}
