import { config } from 'dotenv';

// Temporarily suppress console.log to avoid dotenv promotional message
const originalLog = console.log;
console.log = () => {};

// Load test environment variables
config({ path: '.env.test' });

// Restore console.log
console.log = originalLog;

// Set test environment
process.env.ENV = 'test';
process.env.NODE_ENV = 'test';

// Mock external dependencies globally
jest.mock('amqplib');
jest.mock('nodemailer');

// Global test configuration
jest.setTimeout(10000);

// Mock console methods in tests to reduce noise
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;

beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Mock console methods to avoid noise in tests
    console.error = jest.fn();
    console.warn = jest.fn();
    console.log = jest.fn();
});

afterEach(() => {
    // Restore console methods after each test
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    console.log = originalConsoleLog;
});

// Global test utilities
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace jest {
        interface Matchers<R> {
            toBeValidUuid(): R;
            toBeValidEmail(): R;
        }
    }
}

// Custom Jest matchers
expect.extend({
    toBeValidUuid(received: string) {
        const uuidRegex =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const pass = uuidRegex.test(received);

        if (pass) {
            return {
                message: () => `Expected ${received} not to be a valid UUID`,
                pass: true
            };
        } else {
            return {
                message: () => `Expected ${received} to be a valid UUID`,
                pass: false
            };
        }
    },

    toBeValidEmail(received: string) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const pass = emailRegex.test(received);

        if (pass) {
            return {
                message: () => `Expected ${received} not to be a valid email`,
                pass: true
            };
        } else {
            return {
                message: () => `Expected ${received} to be a valid email`,
                pass: false
            };
        }
    }
});
