import { hash, genRandomString } from './crypto';

describe('crypto utilities', () => {
    describe('hash', () => {
        it('should generate a consistent hash for the same input', async () => {
            const input = 'test string';
            const hash1 = await hash(input, {});
            const hash2 = await hash(input, {});
            expect(hash1).toBe(hash2);
        });

        it('should generate different hashes for different inputs', async () => {
            const hash1 = await hash('test string 1', {});
            const hash2 = await hash('test string 2', {});
            expect(hash1).not.toBe(hash2);
        });

        it('should generate a SHA-256 hash by default', async () => {
            const input = 'test';
            const result = await hash(input, {});
            expect(result).toHaveLength(64); // SHA-256 produces 64 character hex string
            expect(result).toMatch(/^[a-f0-9]+$/); // Only hex characters
        });

        it('should use custom algorithm when specified', async () => {
            const input = 'test';
            const sha1Hash = await hash(input, { algorithm: 'SHA-1' });
            const sha256Hash = await hash(input, { algorithm: 'SHA-256' });

            expect(sha1Hash).toHaveLength(40); // SHA-1 produces 40 character hex string
            expect(sha256Hash).toHaveLength(64); // SHA-256 produces 64 character hex string
            expect(sha1Hash).not.toBe(sha256Hash);
        });

        it('should handle empty string', async () => {
            const result = await hash('', {});
            expect(result).toHaveLength(64);
            expect(result).toMatch(/^[a-f0-9]+$/);
        });

        it('should handle unicode characters', async () => {
            const result = await hash('🚀 test 中文', {});
            expect(result).toHaveLength(64);
            expect(result).toMatch(/^[a-f0-9]+$/);
        });
    });

    describe('genRandomString', () => {
        it('should generate a random string of specified length', async () => {
            const size = 16;
            const result = await genRandomString(size);
            expect(result).toHaveLength(size * 2); // Each byte becomes 2 hex characters
            expect(result).toMatch(/^[a-f0-9]+$/);
        });

        it('should generate different strings on consecutive calls', async () => {
            const result1 = await genRandomString(16);
            const result2 = await genRandomString(16);
            expect(result1).not.toBe(result2);
        });

        it('should handle different sizes', async () => {
            const sizes = [1, 8, 16, 32, 64];

            for (const size of sizes) {
                const result = await genRandomString(size);
                expect(result).toHaveLength(size * 2);
                expect(result).toMatch(/^[a-f0-9]+$/);
            }
        });

        it('should handle zero size', async () => {
            const result = await genRandomString(0);
            expect(result).toBe('');
        });

        it('should reject for invalid size', async () => {
            await expect(genRandomString(-1)).rejects.toThrow();
        });
    });
});
