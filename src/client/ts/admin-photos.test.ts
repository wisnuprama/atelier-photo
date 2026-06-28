import { describe, expect, it } from "vitest";
import type { PhotoTableRow } from "../../server/services/photos.js";
import {
  applyEdit,
  dirtyRows,
  filterRows,
  markError,
  markSaved,
  markSaving,
  paginate,
  type RowModel,
  toRowModel,
} from "./admin-photos.js";

function row(over: Partial<RowModel> = {}): RowModel {
  return {
    id: "id1",
    albumSlug: "mountains",
    albumName: "Mountains",
    title: "Title",
    commentary: "Note",
    invalid: false,
    state: "clean",
    error: null,
    ...over,
  };
}

describe("toRowModel", () => {
  it("maps a server row and coerces null title/commentary to empty strings", () => {
    const src: PhotoTableRow = {
      id: "a1",
      albumSlug: "s",
      albumName: "Album",
      title: null,
      commentary: null,
      cameraBody: null,
      lens: null,
      focalLength: null,
      aperture: null,
      shutter: null,
      iso: null,
    };
    expect(toRowModel(src)).toEqual({
      id: "a1",
      albumSlug: "s",
      albumName: "Album",
      title: "",
      commentary: "",
      invalid: false,
      state: "clean",
      error: null,
    });
  });
});

describe("filterRows", () => {
  const rows = [
    row({
      id: "a1b2",
      albumSlug: "mountains",
      albumName: "Mountains",
      title: "Summer",
      commentary: "warm",
    }),
    row({
      id: "c3d4",
      albumSlug: "city",
      albumName: "City",
      title: "Night lights",
      commentary: "cold",
    }),
    row({ id: "e5f6", albumSlug: "coast", albumName: "Coast", title: "Low tide", commentary: "" }),
  ];

  it("returns all rows for an empty/whitespace query", () => {
    expect(filterRows(rows, "")).toHaveLength(3);
    expect(filterRows(rows, "   ")).toHaveLength(3);
  });

  it("matches case-insensitively across id, album, title, and commentary", () => {
    expect(filterRows(rows, "MOUNT").map((r) => r.id)).toEqual(["a1b2"]);
    expect(filterRows(rows, "city").map((r) => r.id)).toEqual(["c3d4"]);
    expect(filterRows(rows, "e5f6").map((r) => r.id)).toEqual(["e5f6"]);
    expect(filterRows(rows, "night").map((r) => r.id)).toEqual(["c3d4"]);
    expect(filterRows(rows, "cold").map((r) => r.id)).toEqual(["c3d4"]);
  });

  it("returns nothing when no field matches", () => {
    expect(filterRows(rows, "zzz")).toEqual([]);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 5 }, (_, i) => i);

  it("slices the requested page", () => {
    expect(paginate(items, 0, 2)).toEqual({ items: [0, 1], page: 0, pageCount: 3 });
    expect(paginate(items, 1, 2)).toEqual({ items: [2, 3], page: 1, pageCount: 3 });
    expect(paginate(items, 2, 2)).toEqual({ items: [4], page: 2, pageCount: 3 });
  });

  it("clamps an out-of-range page into bounds", () => {
    expect(paginate(items, 99, 2).page).toBe(2);
    expect(paginate(items, -5, 2).page).toBe(0);
  });

  it("reports a single page (pageCount 1) for an empty list", () => {
    expect(paginate([], 0, 50)).toEqual({ items: [], page: 0, pageCount: 1 });
  });
});

describe("applyEdit + state transitions", () => {
  it("editing a field marks the row dirty", () => {
    const r = applyEdit(row(), "commentary", "new note");
    expect(r.commentary).toBe("new note");
    expect(r.state).toBe("dirty");
    expect(r.invalid).toBe(false);
  });

  it("flags an empty/whitespace title as invalid and keeps it out of the flush set", () => {
    const r = applyEdit(row(), "title", "   ");
    expect(r.invalid).toBe(true);
    expect(r.error).toBe("Title required");
    expect(r.state).toBe("dirty");
    expect(dirtyRows([r])).toEqual([]);
  });

  it("clears the invalid flag once the title is non-empty again", () => {
    const r = applyEdit(applyEdit(row(), "title", ""), "title", "Fixed");
    expect(r.invalid).toBe(false);
    expect(r.error).toBeNull();
    expect(dirtyRows([r])).toEqual([r]);
  });

  it("a successful save moves the row to saved (out of the flush set)", () => {
    const r = markSaved(markSaving(applyEdit(row(), "title", "x")));
    expect(r.state).toBe("saved");
    expect(r.error).toBeNull();
    expect(dirtyRows([r])).toEqual([]);
  });

  it("a failed save moves the row to error but stays in the flush set for retry", () => {
    const r = markError(markSaving(applyEdit(row(), "title", "x")), "boom");
    expect(r.state).toBe("error");
    expect(r.error).toBe("boom");
    expect(dirtyRows([r])).toEqual([r]);
  });
});

describe("dirtyRows", () => {
  it("collects dirty and error rows, excluding clean/saved/saving and invalid ones", () => {
    const rows = [
      row({ id: "clean", state: "clean" }),
      row({ id: "dirty", state: "dirty" }),
      row({ id: "saving", state: "saving" }),
      row({ id: "saved", state: "saved" }),
      row({ id: "error", state: "error" }),
      row({ id: "invalid", state: "dirty", invalid: true }),
    ];
    expect(dirtyRows(rows).map((r) => r.id)).toEqual(["dirty", "error"]);
  });
});
