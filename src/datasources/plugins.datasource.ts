import "reflect-metadata";
import { DataSource } from "typeorm";
import { buildBaseOptions } from "./base-options";

const isTs = __filename.endsWith(".ts");
const entities = [
  isTs
    ? "src/base_modules/plugins/plugin.entity.ts"
    : "dist/base_modules/plugins/plugin.entity.js",
];
const migrations = [
  isTs ? "src/migrations/plugins/*.ts" : "dist/migrations/plugins/*.js",
];

export const PluginsDataSource = new DataSource({
  ...buildBaseOptions(),
  name: "plugins",
  database: "plugins",
  entities,
  migrations,
});
