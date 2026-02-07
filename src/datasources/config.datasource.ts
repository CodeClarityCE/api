import { DataSource } from "typeorm";

import { buildBaseOptions } from "./base-options";

import "reflect-metadata";

const isTs = __filename.endsWith(".ts");
const entities = [
  isTs
    ? "src/base_modules/config/config.entity.ts"
    : "dist/base_modules/config/config.entity.js",
];
const migrations = [
  isTs ? "src/migrations/config/*.ts" : "dist/migrations/config/*.js",
];

export const ConfigDataSource = new DataSource({
  ...buildBaseOptions(),
  name: "config",
  database: "config",
  entities,
  migrations,
});
