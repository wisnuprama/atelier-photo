import { describe, expect, it } from "vitest";
import { headerMatches, parseCsv, toCsv } from "./csv.js";

describe("toCsv", () => {
  it("leaves plain fields unquoted and joins with CRLF", () => {
    expect(
      toCsv([
        ["id", "title"],
        ["a1", "Sunrise"],
      ]),
    ).toBe("id,title\r\na1,Sunrise");
  });

  it("quotes fields containing a comma", () => {
    expect(toCsv([["a,b"]])).toBe('"a,b"');
  });

  it("quotes and escapes fields containing a double-quote", () => {
    expect(toCsv([['say "hi"']])).toBe('"say ""hi"""');
  });

  it("quotes fields containing a newline", () => {
    expect(toCsv([["line1\nline2"]])).toBe('"line1\nline2"');
  });
});

describe("parseCsv", () => {
  it("parses a simple two-row grid", () => {
    expect(parseCsv("id,title\r\na1,Sunrise")).toEqual([
      ["id", "title"],
      ["a1", "Sunrise"],
    ]);
  });

  it("parses quoted fields with embedded commas, quotes, and newlines", () => {
    expect(parseCsv('"a,b","say ""hi""","line1\nline2"')).toEqual([
      ["a,b", 'say "hi"', "line1\nline2"],
    ]);
  });

  it("tolerates a trailing newline", () => {
    expect(parseCsv("a,b\n")).toEqual([["a", "b"]]);
  });

  it("handles \\r\\n line endings", () => {
    expect(parseCsv("a,b\r\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("tolerates an empty trailing field (empty comment)", () => {
    expect(parseCsv("a1,path,Title,")).toEqual([["a1", "path", "Title", ""]]);
  });
});

describe("round-trip", () => {
  it("parseCsv(toCsv(rows)) deep-equals rows for an adversarial fixture", () => {
    const rows = [
      ["id", "path", "title", "comment"],
      ["a1", "images/a1.jpg", "Comma, here", 'Quote "q" and, comma'],
      ["b2", "images/b2.jpg", "Line\nbreak", ""],
      ["c3", "images/c3.jpg", "Únïcödé ☃", "tab\tand spaces  "],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe("headerMatches", () => {
  const expected = ["id", "path", "title", "comment"];

  it("accepts an exact header (trimming cells)", () => {
    expect(headerMatches(["id", "path", "title", "comment"], expected)).toBe(true);
    expect(headerMatches([" id ", "path", "title", "comment"], expected)).toBe(true);
  });

  it("rejects a wrong or missing header", () => {
    expect(headerMatches(["id", "title", "comment"], expected)).toBe(false);
    expect(headerMatches(["id", "path", "comment", "title"], expected)).toBe(false);
    expect(headerMatches([], expected)).toBe(false);
  });
});
