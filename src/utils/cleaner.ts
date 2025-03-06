/**
 * Escapes special characters in a string.
 *
 * This function replaces any occurrences of special characters in the input string with their corresponding HTML entity equivalents,
 * effectively "escaping" them to prevent potential security vulnerabilities or formatting issues when used in certain contexts, such as
 * building SQL queries or filling in placeholders for templating engines.
 *
 * @param str The input string to be escaped.
 */
export function escapeString(str: string): string {
    // Remove any instances of "../" to prevent directory traversal
    str = str.replace(/\.\.\//g, '');

    return str
        .replace(/\\/g, '\\\\') // Escape backslashes
        .replace(/"/g, '\\"') // Escape double quotes
        .replace(/'/g, "\\'") // Escape single quotes
        .replace(/</g, '&lt;') // Escape less than
        .replace(/>/g, '&gt;') // Escape greater than
        .replace(/&/g, '&amp;') // Escape ampersand
        .replace(/\//g, '\\/'); // Escape forward slash
}