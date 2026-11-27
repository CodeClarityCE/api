/* eslint-disable security/detect-non-literal-fs-filename -- walks the src tree for error modules */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PluginFailed, PublicAPIError } from "./error.types";

const SRC = join(__dirname, "..");

// Every source file under src that declares a PublicAPIError subclass.
function errorModuleFiles(dir: string = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return errorModuleFiles(path);
    if (!entry.name.endsWith(".ts") || entry.name.endsWith(".spec.ts"))
      return [];
    return readFileSync(path, "utf8").includes("extends PublicAPIError")
      ? [path]
      : [];
  });
}

// Every exported PublicAPIError subclass of the given modules, with its name.
function publicErrorClasses(
  modules: Record<string, unknown>[],
): [string, typeof PublicAPIError][] {
  return modules.flatMap((module) =>
    Object.entries(module).filter(
      (entry): entry is [string, typeof PublicAPIError] =>
        typeof entry[1] === "function" &&
        entry[1].prototype instanceof PublicAPIError,
    ),
  );
}

describe("PublicAPIError subclasses", () => {
  const classes = publicErrorClasses(
    errorModuleFiles().map((file) =>
      jest.requireActual<Record<string, unknown>>(file),
    ),
  );

  it("finds the error classes", () => {
    expect(classes.map(([name]) => name)).toEqual(
      expect.arrayContaining([
        "PluginFailed",
        "AccountNotActivated",
        "AnalyzerHasAnalyses",
        "IncorrectCurrentPassword",
        "InvalidFigureDefinition",
      ]),
    );
  });

  it.each(classes)("%s has a non-empty errorMessage", (_name, errorClass) => {
    expect(typeof errorClass.errorMessage).toBe("string");
    expect(errorClass.errorMessage.trim()).not.toBe("");
  });

  it("PluginFailed answers with the plugin failure message", () => {
    const error = new PluginFailed();
    expect(error.error_code).toBe("PluginResultFailed");
    expect(error.error_message).toBe("The plugin failed to run.");
  });
});
