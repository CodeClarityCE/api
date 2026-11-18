import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

// The most "not implemented" lines production code in src/ may hold.
// Lower it in the same PR that removes or builds a stub; never raise it.
const CEILING = 0;

// Counts lines matching "not implemented" (any case) in the .ts files under
// dir, skipping *.spec.ts. Same as:
// grep -rni "not implemented" src --include=*.ts --exclude=*.spec.ts | wc -l
function countNotImplemented(dir: string): number {
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countNotImplemented(path);
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts")) {
      count += readFileSync(path, "utf8")
        .split("\n")
        .filter((line) => /not implemented/i.test(line)).length;
    }
  }
  return count;
}

describe("not implemented stubs", () => {
  it("stay at or below the ceiling", () => {
    const count = countNotImplemented(__dirname);

    if (count > CEILING) {
      throw new Error(
        `src/ has ${count} "not implemented" lines, above the ceiling of ${CEILING}. ` +
          "Build the feature or remove the route instead of adding a stub.",
      );
    }
    expect(count).toBeLessThanOrEqual(CEILING);
  });

  describe("counting", () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), "not-implemented-"));
      mkdirSync(join(dir, "nested"));
    });

    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it("counts matching lines in any case, in nested folders", () => {
      writeFileSync(
        join(dir, "a.ts"),
        'throw new Error("Not implemented");\nconst ok = 1;\n',
      );
      writeFileSync(
        join(dir, "nested", "b.ts"),
        'throw new Error("Method not implemented.");\n// NOT IMPLEMENTED\n',
      );

      expect(countNotImplemented(dir)).toBe(3);
    });

    it("skips spec files and files that are not TypeScript", () => {
      writeFileSync(
        join(dir, "a.spec.ts"),
        'expect(f).toThrow("Not implemented");\n',
      );
      writeFileSync(join(dir, "notes.md"), "Not implemented\n");

      expect(countNotImplemented(dir)).toBe(0);
    });
  });
});
