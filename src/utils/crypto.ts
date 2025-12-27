import * as crypto from "crypto";

/**
 * Generate a hash of a given string using SHA-256 by default.
 *
 * @param {string} string The input string to be hashed.
 * @param {object} [options] Optional configuration options.
 * @param {string} [options.algorithm='SHA-256'] The algorithm to use for hashing. Defaults to 'SHA-256'.
 * @returns {Promise<string>} A promise that resolves with the hexadecimal representation of the hash.
 */
export async function hash(
  string: string,
  { algorithm = "SHA-256" }: { algorithm?: string },
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(string);
  const hashBuffer = await crypto.subtle.digest(algorithm, data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex;
}

/**
 * Generates a cryptographically secure pseudo-random number and returns its hexadecimal string representation.
 *
 * @param {number} size The size of the random number in bytes.
 * @returns {Promise<string>} A promise that resolves with the hexadecimal string representation of the random number.
 */
export async function genRandomString(size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.randomBytes(size, (err: Error | null, bytes: Buffer) => {
      if (err) {
        reject(err);
      }
      resolve(bytes.toString("hex"));
    });
  });
}
