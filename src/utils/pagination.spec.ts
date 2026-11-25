import { paginatedData, resolvePage } from "./pagination";

const CONFIG = { maxEntriesPerPage: 100, defaultEntriesPerPage: 10 };

describe("resolvePage", () => {
  it.each([
    [{}, 0, 10],
    [{ currentPage: -1, entriesPerPage: 1 }, 0, 1],
    [{ currentPage: 0, entriesPerPage: 0 }, 0, 10],
    [{ currentPage: 3, entriesPerPage: 500 }, 3, 100],
    [{ currentPage: 2, entriesPerPage: 25 }, 2, 25],
  ])("%j is page %i of size %i", (requested, page, size) => {
    expect(resolvePage(requested, CONFIG)).toEqual({
      currentPage: page,
      entriesPerPage: size,
    });
  });

  it("uses the default size for a negative size", () => {
    expect(resolvePage({ entriesPerPage: -5 }, CONFIG).entriesPerPage).toBe(10);
  });

  it("can raise a negative size to one", () => {
    expect(
      resolvePage({ entriesPerPage: -5 }, CONFIG, "one").entriesPerPage,
    ).toBe(1);
  });

  it("can keep a negative size as requested", () => {
    expect(
      resolvePage({ entriesPerPage: -5 }, CONFIG, "as-requested")
        .entriesPerPage,
    ).toBe(-5);
  });
});

describe("paginatedData", () => {
  it("builds the paginated response", () => {
    expect(
      paginatedData(["a", "b"], 7, { currentPage: 1, entriesPerPage: 2 }),
    ).toEqual({
      data: ["a", "b"],
      page: 1,
      entry_count: 2,
      entries_per_page: 2,
      total_entries: 7,
      total_pages: 4,
      matching_count: 7,
      filter_count: {},
    });
  });

  it("takes a different matching count", () => {
    expect(
      paginatedData(["a"], 7, { currentPage: 0, entriesPerPage: 2 }, 1)
        .matching_count,
    ).toBe(1);
  });
});
