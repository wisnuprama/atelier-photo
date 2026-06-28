/**
 * Minimal, dependency-free RFC 4180 CSV reader/writer used by the admin photo
 * table export/import round-trip. Handles quoted fields with embedded commas,
 * double-quotes (escaped as `""`), and newlines.
 */

/** A field needs quoting if it contains a comma, double-quote, CR, or LF. */
function needsQuoting(field: string): boolean {
  return /[",\r\n]/.test(field);
}

function encodeField(field: string): string {
  return needsQuoting(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

/**
 * Serialize a grid of rows to RFC 4180 CSV text. Fields are quoted only when
 * necessary; rows are terminated with CRLF.
 */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(encodeField).join(",")).join("\r\n");
}

/**
 * Parse RFC 4180 CSV text into a grid of rows. Tolerates `\n` or `\r\n` line
 * endings and a single trailing newline. Embedded commas/quotes/newlines inside
 * quoted fields are preserved.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      endField();
      i++;
      continue;
    }
    if (ch === "\r") {
      // Swallow CRLF as a single line break; a lone CR also ends the row.
      endRow();
      i += text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    if (ch === "\n") {
      endRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }

  // Flush the final field/row unless the input ended exactly on a row break
  // (i.e. a single trailing newline produced no pending content).
  if (field !== "" || row.length > 0) endRow();

  return rows;
}

/**
 * Whether a parsed header row matches `expected` exactly (after trimming each
 * cell). Used to reject CSVs whose column shape doesn't match the export.
 */
export function headerMatches(header: readonly string[], expected: readonly string[]): boolean {
  if (header.length !== expected.length) return false;
  return expected.every((col, i) => header[i]?.trim() === col);
}
