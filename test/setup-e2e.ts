import { config } from 'dotenv';

// Load test environment variables
config({ path: 'env/.env.test' });

// Set default test environment
process.env.ENV = 'test';
process.env.NODE_ENV = 'test';

// Increase timeout for E2E tests
jest.setTimeout(30000);
