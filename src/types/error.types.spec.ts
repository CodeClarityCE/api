import * as analyzerErrors from "src/base_modules/analyzers/analyzers.errors";
import * as authErrors from "src/base_modules/auth/auth.errors";
import * as organizationErrors from "src/base_modules/organizations/organizations.errors";
import * as pluginAvailabilityErrors from "src/base_modules/plugin-availability/plugin-availability.errors";
import * as userErrors from "src/base_modules/users/users.errors";
import * as experimentErrors from "src/codeclarity_modules/experiments/experiments.errors";

import * as errorTypes from "./error.types";
import { PublicAPIError } from "./error.types";

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
  const classes = publicErrorClasses([
    errorTypes,
    analyzerErrors,
    authErrors,
    organizationErrors,
    pluginAvailabilityErrors,
    userErrors,
    experimentErrors,
  ]);

  it("finds the error classes", () => {
    expect(classes.map(([name]) => name)).toEqual(
      expect.arrayContaining(["PluginFailed", "AccountNotActivated"]),
    );
  });

  it.each(classes)("%s has a non-empty errorMessage", (_name, errorClass) => {
    expect(typeof errorClass.errorMessage).toBe("string");
    expect(errorClass.errorMessage.trim()).not.toBe("");
  });

  it("PluginFailed answers with the plugin failure message", () => {
    const error = new errorTypes.PluginFailed();
    expect(error.error_code).toBe("PluginResultFailed");
    expect(error.error_message).toBe("The plugin failed to run.");
  });
});
