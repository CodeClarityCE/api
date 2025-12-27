/**
 * Escapes special characters in a string for HTML/SQL contexts.
 *
 * This function replaces any occurrences of special characters in the input string with their corresponding HTML entity equivalents,
 * effectively "escaping" them to prevent potential security vulnerabilities or formatting issues when used in certain contexts, such as
 * building SQL queries or filling in placeholders for templating engines.
 *
 * ⚠️ **WARNING: This function is NOT suitable for filesystem path sanitization.**
 * For filesystem paths, use `validateAndJoinPath()` from `utils/path-validator.ts` instead.
 * This function escapes slashes and other characters in ways that break filesystem path construction
 * and does not provide adequate protection against path traversal attacks.
 *
 * @param str The input string to be escaped.
 * @returns The escaped string safe for HTML/SQL contexts
 *
 * @see validateAndJoinPath For filesystem path sanitization
 */
export function escapeString(str: string): string {
  // Remove any instances of "../" to prevent directory traversal
  str = str.replace(/\.\.\//g, "");

  return str
    .replace(/\\/g, "\\\\") // Escape backslashes
    .replace(/"/g, '\\"') // Escape double quotes
    .replace(/'/g, "\\'") // Escape single quotes
    .replace(/</g, "&lt;") // Escape less than
    .replace(/>/g, "&gt;") // Escape greater than
    .replace(/&/g, "&amp;") // Escape ampersand
    .replace(/\//g, "\\/"); // Escape forward slash
}
