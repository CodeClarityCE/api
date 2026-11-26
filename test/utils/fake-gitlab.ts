import { createServer, type IncomingMessage } from "http";
import type { AddressInfo } from "net";

/** Answers one request the way GitLab would */
type GitlabHandler = (
  url: string,
  init: { headers: Record<string, string> },
) => Response | Promise<Response>;

/** Request headers with their sent casing (Node lowercases `headers`) */
function sentHeaders(req: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {};
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    headers[req.rawHeaders[i]!] = req.rawHeaders[i + 1]!;
  }
  return headers;
}

/**
 * A stand-in GitLab on 127.0.0.1. Its url uses `host`, which the test must
 * resolve to 127.0.0.1 and list in GITLAB_ALLOWED_PRIVATE_HOSTS.
 */
export async function startFakeGitlab(
  host: string,
  handle: GitlabHandler,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    const url = `http://${req.headers.host}${req.url}`;
    Promise.resolve(handle(url, { headers: sentHeaders(req) }))
      .then(async (response) => {
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
      })
      .catch((err: unknown) => {
        res.writeHead(500);
        res.end(String(err));
      });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://${host}:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
