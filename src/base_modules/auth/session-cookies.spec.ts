import { CrossSiteRequestRefused } from "src/types/error.types";

import {
  ACCESS_COOKIE,
  assertSameOrigin,
  clearedSessionCookies,
  readCookie,
  REFRESH_COOKIE,
  sessionCookies,
} from "./session-cookies";

describe("session cookies", () => {
  describe("sessionCookies", () => {
    it("sets both tokens as host-only, HttpOnly, Secure, SameSite=Strict cookies", () => {
      const now = new Date("2026-11-27T10:00:00Z");
      const cookies = sessionCookies(
        {
          accessToken: "a.b.c",
          accessExpiry: new Date("2026-11-27T10:15:00Z"),
          refreshToken: "r_123",
          refreshExpiry: new Date("2026-12-04T10:00:00Z"),
        },
        now,
      );
      expect(cookies).toEqual([
        "__Host-Http-cc_access=a.b.c; Max-Age=900; Path=/; HttpOnly; Secure; SameSite=Strict",
        "__Host-Http-cc_refresh=r_123; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Strict",
      ]);
    });

    it("never sets a negative lifetime", () => {
      const now = new Date("2026-11-27T10:00:00Z");
      const [access] = sessionCookies(
        {
          accessToken: "a",
          accessExpiry: new Date("2026-11-27T09:00:00Z"),
          refreshToken: "r",
          refreshExpiry: now,
        },
        now,
      );
      expect(access).toContain("Max-Age=0;");
    });
  });

  it("clears both cookies with the attributes they were set with", () => {
    expect(clearedSessionCookies()).toEqual([
      "__Host-Http-cc_access=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict",
      "__Host-Http-cc_refresh=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict",
    ]);
  });

  describe("readCookie", () => {
    it("reads a cookie among others", () => {
      const headers = {
        cookie: `theme=dark; ${ACCESS_COOKIE}=a.b.c; ${REFRESH_COOKIE}=r_1`,
      };
      expect(readCookie(headers, ACCESS_COOKIE)).toBe("a.b.c");
      expect(readCookie(headers, REFRESH_COOKIE)).toBe("r_1");
    });

    it("finds nothing without a cookie header or with an empty value", () => {
      expect(readCookie({}, ACCESS_COOKIE)).toBeUndefined();
      expect(
        readCookie({ cookie: `${ACCESS_COOKIE}=` }, ACCESS_COOKIE),
      ).toBeUndefined();
    });

    it("refuses a name sent twice, since one of them was not set by the API", () => {
      const headers = {
        cookie: `${ACCESS_COOKIE}=one; ${ACCESS_COOKIE}=two`,
      };
      expect(readCookie(headers, ACCESS_COOKIE)).toBeUndefined();
    });

    it("refuses a value with characters no token has", () => {
      expect(
        readCookie({ cookie: `${ACCESS_COOKIE}="a b"` }, ACCESS_COOKIE),
      ).toBeUndefined();
    });
  });

  describe("assertSameOrigin", () => {
    const app = { host: "localhost", "x-codeclarity-csrf": "1" };

    it("lets the app's own requests through", () => {
      expect(() =>
        assertSameOrigin({
          ...app,
          "sec-fetch-site": "same-origin",
          origin: "https://localhost",
        }),
      ).not.toThrow();
    });

    it("lets a client that is not a browser through when it sends the header", () => {
      expect(() => assertSameOrigin(app)).not.toThrow();
    });

    it("refuses a request without the custom header", () => {
      expect(() =>
        assertSameOrigin({
          host: "localhost",
          "sec-fetch-site": "same-origin",
        }),
      ).toThrow(CrossSiteRequestRefused);
    });

    it.each(["same-site", "cross-site", "none"])(
      "refuses Sec-Fetch-Site %s",
      (site) => {
        expect(() =>
          assertSameOrigin({ ...app, "sec-fetch-site": site }),
        ).toThrow(CrossSiteRequestRefused);
      },
    );

    it("refuses an Origin on another host when the browser sends no Fetch Metadata", () => {
      expect(() =>
        assertSameOrigin({ ...app, origin: "https://evil.example" }),
      ).toThrow(CrossSiteRequestRefused);
      expect(() =>
        assertSameOrigin({ ...app, origin: "https://localhost:8443" }),
      ).toThrow(CrossSiteRequestRefused);
      expect(() => assertSameOrigin({ ...app, origin: "null" })).toThrow(
        CrossSiteRequestRefused,
      );
    });

    it("accepts an Origin on the request's host and port", () => {
      expect(() =>
        assertSameOrigin({
          ...app,
          host: "codeclarity.example:8443",
          origin: "https://codeclarity.example:8443",
        }),
      ).not.toThrow();
    });
  });
});
