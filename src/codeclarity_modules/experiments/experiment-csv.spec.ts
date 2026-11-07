import { type Readable } from "node:stream";

import {
  type CsvRow,
  encodeCsvRow,
  RUN_CSV_COLUMNS,
  streamCsv,
  VULNERABILITY_CSV_COLUMNS,
} from "./experiment-csv";

async function readAll(stream: Readable): Promise<string> {
  let text = "";
  for await (const chunk of stream) text += String(chunk);
  return text;
}

/** A keyset source over `total` synthetic rows keyed by `rank`. */
function syntheticSource(
  total: number,
  chunkSize: number,
): jest.Mock<Promise<CsvRow[]>, [CsvRow | null]> {
  return jest.fn((after: CsvRow | null) => {
    const start = after === null ? 0 : Number(after["rank"]) + 1;
    const end = Math.min(total, start + chunkSize);
    const rows: CsvRow[] = [];
    for (let rank = start; rank < end; rank++) {
      rows.push({ rank, name: `repo-${rank}` });
    }
    return Promise.resolve(rows);
  });
}

describe("experiment CSV encoding", () => {
  describe("encodeCsvRow", () => {
    it("writes cells in column order and ends the line with CRLF", () => {
      const row = { b: "two", a: 1, c: true };
      expect(encodeCsvRow(["a", "b", "c"], row)).toBe("1,two,true\r\n");
      expect(encodeCsvRow(["c", "a"], row)).toBe("true,1\r\n");
    });

    it("leaves null, undefined and missing values blank", () => {
      expect(
        encodeCsvRow(["a", "b", "c", "d"], { a: null, b: undefined, d: 0 }),
      ).toBe(",,,0\r\n");
    });

    it("writes dates as ISO 8601 and false as false", () => {
      expect(
        encodeCsvRow(["at", "flag"], {
          at: new Date("2026-03-04T05:06:07.000Z"),
          flag: false,
        }),
      ).toBe("2026-03-04T05:06:07.000Z,false\r\n");
    });

    it("quotes cells holding commas, quotes or line breaks, doubling quotes", () => {
      expect(
        encodeCsvRow(["a", "b", "c", "d"], {
          a: "x,y",
          b: 'say "hi"',
          c: "line\nbreak",
          d: "cr\rhere",
        }),
      ).toBe('"x,y","say ""hi""","line\nbreak","cr\rhere"\r\n');
    });

    it("neutralizes spreadsheet formulas by prefixing a single quote", () => {
      expect(
        encodeCsvRow(["a", "b", "c", "d", "e", "f"], {
          a: "=HYPERLINK(1)",
          b: "+1",
          c: "-2+3",
          d: "@SUM(A1)",
          e: "\tTAB",
          f: "\rCR",
        }),
      ).toBe(`'=HYPERLINK(1),'+1,'-2+3,'@SUM(A1),'\tTAB,"'\rCR"\r\n`);
    });

    it("guards formulas before quoting", () => {
      expect(encodeCsvRow(["a"], { a: '=1,"2"' })).toBe(`"'=1,""2"""\r\n`);
    });

    it("keeps real numbers numeric, negative ones included", () => {
      expect(encodeCsvRow(["a", "b"], { a: -1.5, b: 9.8 })).toBe(
        "-1.5,9.8\r\n",
      );
    });
  });

  describe("export columns", () => {
    it("lists entry metadata, the grid date, run state then the summary columns", () => {
      expect(RUN_CSV_COLUMNS).toEqual([
        "rank",
        "full_name",
        "stars",
        "git_url",
        "grid_date",
        "status",
        "error",
        "attempts",
        "branch",
        "commit_hash",
        "committed_at",
        "analysis_id",
        "total_dependencies",
        "direct_dependencies",
        "transitive_dependencies",
        "dev_dependencies",
        "prod_dependencies",
        "package_manager",
        "total_vulnerabilities",
        "vulnerable_dependencies",
        "direct_vulnerabilities",
        "transitive_vulnerabilities",
        "n_critical",
        "n_high",
        "n_medium",
        "n_low",
        "n_none",
      ]);
    });

    it("lists entry metadata, the snapshot holding the rows, then the vulnerability instance columns", () => {
      expect(VULNERABILITY_CSV_COLUMNS).toEqual([
        "rank",
        "full_name",
        "stars",
        "git_url",
        "grid_date",
        "commit_hash",
        "workspace",
        "vulnerability_id",
        "affected_dependency",
        "affected_version",
        "direct_dependency",
        "severity_class",
        "severity_score",
        "severity_vector",
        "impact",
        "exploitability",
        "epss_score",
        "epss_percentile",
        "conflict_flag",
        "winning_source",
        "published_date",
        "modified_date",
        "withdrawn_date",
      ]);
    });
  });

  describe("streamCsv", () => {
    it("writes the header then every row of every chunk", async () => {
      const source = syntheticSource(3, 2);
      const text = await readAll(streamCsv(["rank", "name"], source));
      expect(text).toBe(
        "rank,name\r\n0,repo-0\r\n1,repo-1\r\n2,repo-2\r\n",
      );
    });

    it("writes only the header when there are no rows", async () => {
      const text = await readAll(
        streamCsv(["rank", "name"], syntheticSource(0, 10)),
      );
      expect(text).toBe("rank,name\r\n");
    });

    it("pages through a large experiment by the last row of each chunk", async () => {
      const source = syntheticSource(25_000, 1_000);
      const text = await readAll(streamCsv(["rank", "name"], source));

      const lines = text.split("\r\n");
      expect(lines).toHaveLength(25_002); // header, rows, trailing ""
      expect(lines[25_000]).toBe("24999,repo-24999");
      // 25 full chunks, then the empty one that ends the export
      expect(source).toHaveBeenCalledTimes(26);
      expect(source.mock.calls[0]![0]).toBeNull();
      expect(source.mock.calls[1]![0]).toEqual({ rank: 999, name: "repo-999" });
    });

    it("pulls chunks only as the consumer reads", async () => {
      const source = syntheticSource(25_000, 1_000);
      const stream = streamCsv(["rank", "name"], source);
      const iterator = stream[Symbol.asyncIterator]();
      await iterator.next();
      await iterator.next();
      expect(source.mock.calls.length).toBeLessThanOrEqual(3);
      stream.destroy();
    });

    it("fails the stream when a chunk cannot be read", async () => {
      const source = jest.fn().mockRejectedValue(new Error("db gone"));
      await expect(readAll(streamCsv(["rank"], source))).rejects.toThrow(
        "db gone",
      );
    });
  });
});
