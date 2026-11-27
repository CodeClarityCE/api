import { config } from "dotenv";

// Temporarily suppress console.log to avoid dotenv promotional message
const originalLog = console.log;
console.log = () => {};

// Load test environment variables
config({ path: "env/.env.test" });

// Restore console.log
console.log = originalLog;

// Set default test environment
process.env["ENV"] = "test";
process.env["NODE_ENV"] = "test";

// No spec uses these pollers, and their reads race cleanDatabase's TRUNCATE.
process.env["EXPERIMENT_RUNNER_ENABLED"] = "false";
process.env["DATASET_BUILDER_ENABLED"] = "false";

// Increase timeout for E2E tests
jest.setTimeout(30000);
