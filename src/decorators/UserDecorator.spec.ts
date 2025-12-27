import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

jest.mock("@nestjs/common", () => ({
  createParamDecorator: jest.fn(),
}));

describe("UserDecorator", () => {
  const mockCreateParamDecorator = createParamDecorator as jest.MockedFunction<
    typeof createParamDecorator
  >;
  let decoratorFactory: (data: unknown, ctx: ExecutionContext) => any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateParamDecorator.mockImplementation((factory) => {
      decoratorFactory = factory;
      return jest.fn() as any;
    });
  });

  it("should be created with createParamDecorator", async () => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    await import("./UserDecorator");
    expect(mockCreateParamDecorator).toHaveBeenCalled();
  });

  describe("decorator factory function", () => {
    beforeEach(async () => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      await import("./UserDecorator");
    });

    describe("HTTP context", () => {
      it("should return user from HTTP request", () => {
        const mockUser = { id: "user123", email: "test@example.com" };
        const mockRequest = { user: mockUser };
        const mockContext = {
          getType: jest.fn().mockReturnValue("http"),
          switchToHttp: jest.fn().mockReturnValue({
            getRequest: jest.fn().mockReturnValue(mockRequest),
          }),
          switchToWs: jest.fn(),
        } as unknown as ExecutionContext;

        const result = decoratorFactory(undefined, mockContext);

        expect(mockContext.getType).toHaveBeenCalled();
        expect(mockContext.switchToHttp).toHaveBeenCalled();
        expect(result).toBe(mockUser);
      });

      it("should return undefined if no user in HTTP request", () => {
        const mockRequest = { user: undefined };
        const mockContext = {
          getType: jest.fn().mockReturnValue("http"),
          switchToHttp: jest.fn().mockReturnValue({
            getRequest: jest.fn().mockReturnValue(mockRequest),
          }),
          switchToWs: jest.fn(),
        } as unknown as ExecutionContext;

        const result = decoratorFactory(undefined, mockContext);

        expect(result).toBeUndefined();
      });

      it("should return null if user is null in HTTP request", () => {
        const mockRequest = { user: null };
        const mockContext = {
          getType: jest.fn().mockReturnValue("http"),
          switchToHttp: jest.fn().mockReturnValue({
            getRequest: jest.fn().mockReturnValue(mockRequest),
          }),
          switchToWs: jest.fn(),
        } as unknown as ExecutionContext;

        const result = decoratorFactory(undefined, mockContext);

        expect(result).toBeNull();
      });
    });

    describe("WebSocket context", () => {
      it("should return user from WebSocket client data", () => {
        const mockUser = { id: "user456", email: "ws@example.com" };
        const mockClient = { data: { user: mockUser } };
        const mockContext = {
          getType: jest.fn().mockReturnValue("ws"),
          switchToWs: jest.fn().mockReturnValue({
            getClient: jest.fn().mockReturnValue(mockClient),
          }),
          switchToHttp: jest.fn(),
        } as unknown as ExecutionContext;

        const result = decoratorFactory(undefined, mockContext);

        expect(mockContext.getType).toHaveBeenCalled();
        expect(mockContext.switchToWs).toHaveBeenCalled();
        expect(result).toBe(mockUser);
      });

      it("should return undefined if no user data in WebSocket client", () => {
        const mockClient = { data: { user: undefined } };
        const mockContext = {
          getType: jest.fn().mockReturnValue("ws"),
          switchToWs: jest.fn().mockReturnValue({
            getClient: jest.fn().mockReturnValue(mockClient),
          }),
          switchToHttp: jest.fn(),
        } as unknown as ExecutionContext;

        const result = decoratorFactory(undefined, mockContext);

        expect(result).toBeUndefined();
      });

      it("should throw error if no data object in WebSocket client", () => {
        const mockClient = { data: undefined };
        const mockContext = {
          getType: jest.fn().mockReturnValue("ws"),
          switchToWs: jest.fn().mockReturnValue({
            getClient: jest.fn().mockReturnValue(mockClient),
          }),
          switchToHttp: jest.fn(),
        } as unknown as ExecutionContext;

        expect(() => decoratorFactory(undefined, mockContext)).toThrow();
      });

      it("should throw error when data property is missing", () => {
        const mockClient = {};
        const mockContext = {
          getType: jest.fn().mockReturnValue("ws"),
          switchToWs: jest.fn().mockReturnValue({
            getClient: jest.fn().mockReturnValue(mockClient),
          }),
          switchToHttp: jest.fn(),
        } as unknown as ExecutionContext;

        expect(() => decoratorFactory(undefined, mockContext)).toThrow();
      });
    });

    describe("context type handling", () => {
      it("should handle different context types correctly", () => {
        const mockUser = { id: "user789" };
        const mockRequest = { user: mockUser };
        const mockContext = {
          getType: jest.fn().mockReturnValue("graphql"),
          switchToHttp: jest.fn().mockReturnValue({
            getRequest: jest.fn().mockReturnValue(mockRequest),
          }),
          switchToWs: jest.fn(),
        } as unknown as ExecutionContext;

        const result = decoratorFactory(undefined, mockContext);

        expect(mockContext.getType).toHaveBeenCalled();
        expect(mockContext.switchToHttp).toHaveBeenCalled();
        expect(mockContext.switchToWs).not.toHaveBeenCalled();
        expect(result).toBe(mockUser);
      });

      it("should handle unknown context types as HTTP", () => {
        const mockUser = { id: "user999" };
        const mockRequest = { user: mockUser };
        const mockContext = {
          getType: jest.fn().mockReturnValue("unknown"),
          switchToHttp: jest.fn().mockReturnValue({
            getRequest: jest.fn().mockReturnValue(mockRequest),
          }),
          switchToWs: jest.fn(),
        } as unknown as ExecutionContext;

        const result = decoratorFactory(undefined, mockContext);

        expect(result).toBe(mockUser);
      });
    });

    describe("data parameter", () => {
      it("should ignore data parameter in HTTP context", () => {
        const mockUser = { id: "user123" };
        const mockRequest = { user: mockUser };
        const mockContext = {
          getType: jest.fn().mockReturnValue("http"),
          switchToHttp: jest.fn().mockReturnValue({
            getRequest: jest.fn().mockReturnValue(mockRequest),
          }),
          switchToWs: jest.fn(),
        } as unknown as ExecutionContext;

        const result1 = decoratorFactory(undefined, mockContext);
        const result2 = decoratorFactory("someData", mockContext);
        const result3 = decoratorFactory({ custom: "object" }, mockContext);

        expect(result1).toBe(mockUser);
        expect(result2).toBe(mockUser);
        expect(result3).toBe(mockUser);
      });

      it("should ignore data parameter in WebSocket context", () => {
        const mockUser = { id: "user456" };
        const mockClient = { data: { user: mockUser } };
        const mockContext = {
          getType: jest.fn().mockReturnValue("ws"),
          switchToWs: jest.fn().mockReturnValue({
            getClient: jest.fn().mockReturnValue(mockClient),
          }),
          switchToHttp: jest.fn(),
        } as unknown as ExecutionContext;

        const result1 = decoratorFactory(undefined, mockContext);
        const result2 = decoratorFactory("someData", mockContext);
        const result3 = decoratorFactory({ custom: "object" }, mockContext);

        expect(result1).toBe(mockUser);
        expect(result2).toBe(mockUser);
        expect(result3).toBe(mockUser);
      });
    });
  });
});
