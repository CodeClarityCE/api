import { sep } from 'path';
import { validateAndJoinPath } from './path-validator';

describe('validateAndJoinPath', () => {
    const baseDir = sep === '\\' ? 'C:\\var\\data' : '/var/data';

    describe('Valid paths', () => {
        it('should construct valid path with single segment', () => {
            const result = validateAndJoinPath(baseDir, 'file.txt');
            expect(result).toBe(`${baseDir}${sep}file.txt`);
        });

        it('should construct valid path with multiple segments', () => {
            const result = validateAndJoinPath(baseDir, 'user123', 'project456', 'file.txt');
            expect(result).toBe(`${baseDir}${sep}user123${sep}project456${sep}file.txt`);
        });

        it('should handle UUID-like segments', () => {
            const uuid = '550e8400-e29b-41d4-a716-446655440000';
            const result = validateAndJoinPath(baseDir, uuid, 'file.txt');
            expect(result).toBe(`${baseDir}${sep}${uuid}${sep}file.txt`);
        });

        it('should handle numeric segments', () => {
            const result = validateAndJoinPath(baseDir, '123', '456');
            expect(result).toBe(`${baseDir}${sep}123${sep}456`);
        });

        it('should return base directory when no segments provided', () => {
            const result = validateAndJoinPath(baseDir);
            expect(result).toBe(baseDir);
        });
    });

    describe('Path traversal protection', () => {
        it('should sanitize parent directory traversal with ../', () => {
            // ../etc/passwd → after removing ../ and slashes → etcpasswd
            const result = validateAndJoinPath(baseDir, '../etc/passwd');
            expect(result).toBe(`${baseDir}${sep}etcpasswd`);
        });

        it('should sanitize multiple parent directory traversals', () => {
            // ../../etc/passwd → after removing ../ and slashes → etcpasswd
            const result = validateAndJoinPath(baseDir, '../../etc/passwd');
            expect(result).toBe(`${baseDir}${sep}etcpasswd`);
        });

        it('should sanitize parent directory in middle of path', () => {
            // '../admin' becomes 'admin' after removing ../
            const result = validateAndJoinPath(baseDir, 'user', '../admin', 'secrets.txt');
            expect(result).toBe(`${baseDir}${sep}user${sep}admin${sep}secrets.txt`);
        });

        it('should remove leading dots and return safe filename', () => {
            // Leading dots are removed, leaving 'passwd' which is a valid filename
            const result = validateAndJoinPath(baseDir, '...passwd');
            expect(result).toBe(`${baseDir}${sep}passwd`);
        });

        it('should block home directory reference', () => {
            const result = validateAndJoinPath(baseDir, '~user', 'file.txt');
            // After sanitization, '~user' becomes 'user'
            expect(result).toBe(`${baseDir}${sep}user${sep}file.txt`);
        });
    });

    describe('Directory separator protection', () => {
        it('should block forward slashes in segment', () => {
            const result = validateAndJoinPath(baseDir, 'user/admin', 'file.txt');
            // Forward slashes are removed, becomes 'useradmin'
            expect(result).toBe(`${baseDir}${sep}useradmin${sep}file.txt`);
        });

        it('should block backslashes in segment', () => {
            const result = validateAndJoinPath(baseDir, 'user\\admin', 'file.txt');
            // Backslashes are removed, becomes 'useradmin'
            expect(result).toBe(`${baseDir}${sep}useradmin${sep}file.txt`);
        });

        it('should block multiple slashes', () => {
            const result = validateAndJoinPath(baseDir, 'user///admin', 'file.txt');
            // All slashes removed
            expect(result).toBe(`${baseDir}${sep}useradmin${sep}file.txt`);
        });
    });

    describe('Null byte protection', () => {
        it('should block null bytes in segment', () => {
            const result = validateAndJoinPath(baseDir, 'file\0.txt');
            // Null byte removed
            expect(result).toBe(`${baseDir}${sep}file.txt`);
        });

        it('should block null byte path truncation attack', () => {
            const result = validateAndJoinPath(baseDir, 'safe.txt\0../../etc/passwd');
            // Null byte and traversal removed
            expect(result).toBe(`${baseDir}${sep}safe.txtetcpasswd`);
        });
    });

    describe('Input validation', () => {
        it('should reject relative base directory', () => {
            expect(() => {
                validateAndJoinPath('./relative/path', 'file.txt');
            }).toThrow('Base directory must be an absolute path');
        });

        it('should reject empty segment', () => {
            expect(() => {
                validateAndJoinPath(baseDir, '');
            }).toThrow('Invalid path segment');
        });

        it('should reject non-string segment', () => {
            expect(() => {
                validateAndJoinPath(baseDir, null as any);
            }).toThrow('Invalid path segment');
        });

        it('should reject undefined segment', () => {
            expect(() => {
                validateAndJoinPath(baseDir, undefined as any);
            }).toThrow('Invalid path segment');
        });

        it('should reject segment that becomes empty after sanitization', () => {
            expect(() => {
                validateAndJoinPath(baseDir, '../');
            }).toThrow('Path segment became empty after sanitization');
        });

        it('should reject segment with only dots and slashes', () => {
            expect(() => {
                validateAndJoinPath(baseDir, './../');
            }).toThrow('Path segment became empty after sanitization');
        });
    });

    describe('Real-world attack scenarios', () => {
        it('should block URL-encoded parent directory', () => {
            // %2e%2e%2f is ../
            const result = validateAndJoinPath(baseDir, '%2e%2e%2f', 'file.txt');
            // URL encoding stays as-is in this implementation, becomes safe filename
            expect(result).toBe(`${baseDir}${sep}%2e%2e%2f${sep}file.txt`);
        });

        it('should handle file with special characters safely', () => {
            const result = validateAndJoinPath(baseDir, 'file-name_v1.2.3.txt');
            expect(result).toBe(`${baseDir}${sep}file-name_v1.2.3.txt`);
        });

        it('should handle Unicode characters in filename', () => {
            const result = validateAndJoinPath(baseDir, 'файл.txt');
            expect(result).toBe(`${baseDir}${sep}файл.txt`);
        });

        it('should prevent escaping via absolute path injection', () => {
            // When an absolute path is passed as segment, slashes are removed
            const maliciousPath = sep === '\\' ? 'C:\\etc\\passwd' : '/etc/passwd';
            const result = validateAndJoinPath(baseDir, maliciousPath);
            // After sanitization, slashes and colons are removed
            // /etc/passwd → etcpasswd (after removing slashes)
            // C:\etc\passwd → Cetcpasswd (after removing backslashes and colons)
            const expected = sep === '\\' ? 'Cetcpasswd' : 'etcpasswd';
            expect(result).toBe(`${baseDir}${sep}${expected}`);
        });
    });

    describe('Edge cases', () => {
        it('should handle very long valid filenames', () => {
            const longName = `${'a'.repeat(200)  }.txt`;
            const result = validateAndJoinPath(baseDir, longName);
            expect(result).toBe(`${baseDir}${sep}${longName}`);
        });

        it('should handle files with multiple dots', () => {
            const result = validateAndJoinPath(baseDir, 'archive.tar.gz');
            expect(result).toBe(`${baseDir}${sep}archive.tar.gz`);
        });

        it('should handle files starting with valid single dot', () => {
            const result = validateAndJoinPath(baseDir, '.gitignore');
            // Leading dots are removed, so this becomes 'gitignore'
            expect(result).toBe(`${baseDir}${sep}gitignore`);
        });
    });
});
