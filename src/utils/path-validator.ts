import { basename, isAbsolute, join, resolve, sep } from "path";

/**
 * Safely constructs a file path by joining a base directory with user-provided segments.
 * Prevents path traversal attacks by validating the final path stays within the base directory.
 *
 * This function provides defense-in-depth security by:
 * 1. Sanitizing each path segment individually
 * 2. Using path.join() for proper cross-platform path construction
 * 3. Resolving to absolute path to handle any remaining relative components
 * 4. Validating the resolved path is within the base directory
 *
 * @param baseDir - The base directory (must be an absolute path)
 * @param pathSegments - Path segments to join (user-provided data)
 * @returns The validated absolute path
 * @throws Error if the path attempts to escape the base directory or contains invalid segments
 *
 * @example
 * // Valid usage
 * const path = validateAndJoinPath('/var/data', 'user123', 'file.txt');
 * // Returns: '/var/data/user123/file.txt'
 *
 * @example
 * // Blocked path traversal
 * validateAndJoinPath('/var/data', '../../etc/passwd');
 * // Throws: Error('Path segment became empty after sanitization')
 */
export function validateAndJoinPath(
  baseDir: string,
  ...pathSegments: string[]
): string {
  // Validate base directory is absolute
  if (!isAbsolute(baseDir)) {
    throw new Error("Base directory must be an absolute path");
  }

  // Sanitize each segment individually
  const sanitizedSegments = pathSegments.map((segment) => {
    if (!segment || typeof segment !== "string") {
      throw new Error("Invalid path segment");
    }

    // Remove dangerous characters and patterns
    let sanitized = segment
      .replace(/\.\./g, "") // Remove parent directory references
      .replace(/^\.+/, "") // Remove leading dots
      .replace(/\/+/g, "") // Remove forward slashes
      .replace(/\\+/g, "") // Remove backslashes
      .replace(/\0/g, "") // Remove null bytes
      .replace(/^~/, ""); // Remove home directory reference

    // Use basename to extract just the filename/dirname component
    // This handles any remaining edge cases
    sanitized = basename(sanitized);

    if (!sanitized) {
      throw new Error("Path segment became empty after sanitization");
    }

    return sanitized;
  });

  // Construct the path
  const constructedPath = join(baseDir, ...sanitizedSegments);

  // Resolve to absolute path (resolves any remaining relative components)
  const resolvedPath = resolve(constructedPath);
  const resolvedBase = resolve(baseDir);

  // Verify the resolved path is within the base directory
  // Must either start with base + separator OR be exactly equal to base
  if (
    !resolvedPath.startsWith(resolvedBase + sep) &&
    resolvedPath !== resolvedBase
  ) {
    throw new Error(
      `Path traversal detected: attempted to access ${resolvedPath} outside of ${resolvedBase}`,
    );
  }

  return resolvedPath;
}
