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
    expect(escapeString("test<value")).toBe("test&amp;lt;value");
  });

  it("should escape greater than symbols", () => {
    expect(escapeString("test>value")).toBe("test&amp;gt;value");
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
      "test\\\"value\\'&amp;lt;script&amp;gt;&amp;alert();&amp;lt;\\/script&amp;gt;path";
    expect(escapeString(input)).toBe(expected);
  });

  it("should handle empty string", () => {
    expect(escapeString("")).toBe("");
  });

  it("should handle string with no special characters", () => {
    expect(escapeString("normaltext")).toBe("normaltext");
  });

  it("should handle string with only special characters", () => {
    expect(escapeString("\"'<>&/\\")).toBe(
      "\\\"\\'&amp;lt;&amp;gt;&amp;\\/\\\\",
    );
  });
});
