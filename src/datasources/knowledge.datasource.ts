import { DataSource } from "typeorm";

import { buildBaseOptions } from "./base-options";

import "reflect-metadata";

const isTs = __filename.endsWith(".ts");
const entities = [
  // Only knowledge module entities
  isTs
    ? "src/codeclarity_modules/knowledge/**/*.entity.ts"
    : "dist/codeclarity_modules/knowledge/**/*.entity.js",
];
const migrations = [
  isTs ? "src/migrations/knowledge/*.ts" : "dist/migrations/knowledge/*.js",
];

export const KnowledgeDataSource = new DataSource({
  ...buildBaseOptions(),
  name: "knowledge",
  database: "knowledge",
  entities,
  migrations,
});
