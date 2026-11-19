import { escapeString } from "./cleaner";

describe("escapeString", () => {
  it("should escape backslashes", () => {
    expect(escapeString("test\\path")).toBe("test\\\\path");
  });

  it("should escape double quotes", () => {
    expect(escapeString('test"value')).toBe('test\\"value');
  });

  it("should escape single quotes", () => {
    expect(escapeString("test'value")).toBe("test\\'value");
  });

  it("should escape less than symbols", () => {
    expect(escapeString("test<value")).toBe("test&lt;value");
  });

  it("should escape greater than symbols", () => {
    expect(escapeString("test>value")).toBe("test&gt;value");
  });

  it("should escape ampersands", () => {
    expect(escapeString("test&value")).toBe("test&amp;value");
  });

  it("should escape forward slashes", () => {
    expect(escapeString("test/path")).toBe("test\\/path");
  });

  it("should remove directory traversal attempts", () => {
    expect(escapeString("test../path")).toBe("testpath");
    expect(escapeString("../../../etc/passwd")).toBe("etc\\/passwd");
  });

  it("should handle multiple special characters", () => {
    const input = "test\"value'<script>&alert();</script>../path";
    const expected =
      "test\\\"value\\'&lt;script&gt;&amp;alert();&lt;\\/script&gt;path";
    expect(escapeString(input)).toBe(expected);
  });

  it("should handle empty string", () => {
    expect(escapeString("")).toBe("");
  });

  it("should handle string with no special characters", () => {
    expect(escapeString("normaltext")).toBe("normaltext");
  });

  it("should handle string with only special characters", () => {
    expect(escapeString("\"'<>&/\\")).toBe("\\\"\\'&lt;&gt;&amp;\\/\\\\");
  });

  it("escapes an existing entity once, without double escaping", () => {
    expect(escapeString("&lt;")).toBe("&amp;lt;");
    expect(escapeString("<&>")).toBe("&lt;&amp;&gt;");
  });

  it("removes traversal sequences that reappear after one pass", () => {
    expect(escapeString("....//etc")).toBe("etc");
    expect(escapeString(".../...//x")).toBe("x");
    expect(escapeString("..././..././")).toBe("");
  });

  it("removes a long run of nested traversal sequences", () => {
    const nested = `${"..".repeat(2000) + "/".repeat(2000)}secret`;
    expect(escapeString(nested)).toBe("secret");
  });
});
