import { Environment, validate } from "./validate-env";

describe("validate-env", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("validate", () => {
    it("should validate production environment config", () => {
      process.env["ENV"] = "prod";

      const validConfig = {
        ENV: Environment.Production,
        PORT: 3000,
        HOST: "localhost",
        AMQP_ANALYSES_QUEUE: "analyses",
        AMQP_PROTOCOL: "amqp",
        AMQP_HOST: "rabbitmq",
        AMQP_PORT: "5672",
        AMQP_USER: "admin",
        AMQP_PASSWORD: "password",
        MAIL_HOST: "smtp.gmail.com",
        MAIL_PORT: 587,
        MAIL_AUTH_USER: "user@example.com",
        MAIL_AUTH_PASSWORD: "password",
        MAIL_DEFAULT_FROM: "noreply@example.com",
        COOKIE_SECRET: "secret-key",
        WEB_HOST: "localhost",
        PLATFORM_NAME: "CodeClarity",
      };

      const result = validate(validConfig);
      expect(result).toBeDefined();
      expect(result.ENV).toBe(Environment.Production);
      expect(result.PORT).toBe(3000);
      expect(result.HOST).toBe("localhost");
    });

    it("accepts a production config with no GitHub or GitLab sign-in settings and no mail password", () => {
      process.env["ENV"] = "prod";

      const config = {
        ENV: Environment.Production,
        PORT: 3000,
        HOST: "https://localhost/api",
        AMQP_ANALYSES_QUEUE: "api_request",
        AMQP_PROTOCOL: "amqps",
        AMQP_HOST: "rabbitmq",
        AMQP_PORT: "5671",
        AMQP_USER: "codeclarity",
        AMQP_PASSWORD: "generated",
        MAIL_HOST: "localhost",
        MAIL_PORT: "465",
        MAIL_AUTH_USER: "noreply@localhost",
        MAIL_AUTH_PASSWORD: "",
        MAIL_DEFAULT_FROM: "noreply@localhost",
        COOKIE_SECRET: "generated",
        WEB_HOST: "https://localhost",
        PLATFORM_NAME: "CodeClarity",
      };

      expect(validate(config).ENV).toBe(Environment.Production);
    });

    it("should validate development environment config", () => {
      process.env["ENV"] = "dev";

      const validConfig = {
        ENV: Environment.Development,
        PORT: 3000,
        HOST: "localhost",
        AMQP_ANALYSES_QUEUE: "analyses",
        AMQP_PROTOCOL: "amqp",
        AMQP_HOST: "rabbitmq",
        AMQP_PORT: "5672",
        AMQP_USER: "admin",
        AMQP_PASSWORD: "password",
        MAIL_HOST: "smtp.gmail.com",
        MAIL_PORT: 587,
        MAIL_AUTH_USER: "user@example.com",
        MAIL_AUTH_PASSWORD: "password",
        MAIL_DEFAULT_FROM: "noreply@example.com",
        COOKIE_SECRET: "secret-key",
        WEB_HOST: "localhost",
        PLATFORM_NAME: "CodeClarity",
        TEST_EMAIL: "test@example.com",
        REQUIRE_ACCOUNT_VERIFICATION: "false",
      };

      const result = validate(validConfig);
      expect(result).toBeDefined();
      expect(result.ENV).toBe(Environment.Development);
      expect((result as any).TEST_EMAIL).toBe("test@example.com");
      expect((result as any).REQUIRE_ACCOUNT_VERIFICATION).toBe(false);
    });

    it("should throw error when ENV is missing", () => {
      delete process.env["ENV"];

      expect(() => validate({})).toThrow("'ENV' environment variable missing");
    });

    it("should throw error when ENV is empty", () => {
      process.env["ENV"] = "";

      expect(() => validate({})).toThrow("'ENV' environment variable missing");
    });

    it("should throw error for invalid config", () => {
      process.env["ENV"] = "prod";

      const invalidConfig = {
        ENV: "invalid-env",
        PORT: "not-a-number",
        HOST: "",
      };

      expect(() => validate(invalidConfig)).toThrow();
    });

    it("should throw error for missing required fields", () => {
      process.env["ENV"] = "prod";

      const incompleteConfig = {
        ENV: Environment.Production,
        PORT: 3000,
        // Missing HOST and other required fields
      };

      expect(() => validate(incompleteConfig)).toThrow();
    });

    it("should convert string numbers to integers", () => {
      process.env["ENV"] = "prod";

      const configWithStringNumbers = {
        ENV: Environment.Production,
        PORT: "3000",
        HOST: "localhost",
        AMQP_ANALYSES_QUEUE: "analyses",
        AMQP_PROTOCOL: "amqp",
        AMQP_HOST: "rabbitmq",
        AMQP_PORT: "5672",
        AMQP_USER: "admin",
        AMQP_PASSWORD: "password",
        MAIL_HOST: "smtp.gmail.com",
        MAIL_PORT: "587",
        MAIL_AUTH_USER: "user@example.com",
        MAIL_AUTH_PASSWORD: "password",
        MAIL_DEFAULT_FROM: "noreply@example.com",
        COOKIE_SECRET: "secret-key",
        WEB_HOST: "localhost",
        PLATFORM_NAME: "CodeClarity",
      };

      const result = validate(configWithStringNumbers);
      expect(result.PORT).toBe(3000);
      expect(result.MAIL_PORT).toBe(587);
      expect(typeof result.PORT).toBe("number");
      expect(typeof result.MAIL_PORT).toBe("number");
    });

    it("should handle REQUIRE_ACCOUNT_VERIFICATION boolean transformation in dev", () => {
      process.env["ENV"] = "dev";

      const configWithBooleanString = {
        ENV: Environment.Development,
        PORT: 3000,
        HOST: "localhost",
        AMQP_ANALYSES_QUEUE: "analyses",
        AMQP_PROTOCOL: "amqp",
        AMQP_HOST: "rabbitmq",
        AMQP_PORT: "5672",
        AMQP_USER: "admin",
        AMQP_PASSWORD: "password",
        MAIL_HOST: "smtp.gmail.com",
        MAIL_PORT: 587,
        MAIL_AUTH_USER: "user@example.com",
        MAIL_AUTH_PASSWORD: "password",
        MAIL_DEFAULT_FROM: "noreply@example.com",
        COOKIE_SECRET: "secret-key",
        WEB_HOST: "localhost",
        PLATFORM_NAME: "CodeClarity",
        TEST_EMAIL: "test@example.com",
        REQUIRE_ACCOUNT_VERIFICATION: "true",
      };

      const result = validate(configWithBooleanString);
      expect((result as any).REQUIRE_ACCOUNT_VERIFICATION).toBe(true);
    });
  });

  describe("Environment enum", () => {
    it("should have correct enum values", () => {
      expect(Environment.Development).toBe("dev");
      expect(Environment.Production).toBe("prod");
      expect(Environment.Staging).toBe("staging");
      expect(Environment.Test).toBe("test");
    });
  });
});
