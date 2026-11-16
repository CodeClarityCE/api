import { type ConfigService } from "@nestjs/config";
import * as amqp from "amqplib";
import { EventEmitter } from "events";

import {
  PROBE_TIMEOUT_MS,
  RabbitMqConsumerProbe,
} from "./rabbitmq-consumer-probe";

jest.mock("amqplib", () => ({ connect: jest.fn() }));

/** A broker whose queues have the consumer counts set in `queues`. */
class FakeConnection extends EventEmitter {
  queues = new Map<string, number>();
  /** When set, queue checks never answer. */
  hang = false;
  createChannel = jest.fn(async () =>
    Object.assign(new EventEmitter(), {
      checkQueue: jest.fn(async (queue: string) => {
        if (this.hang) return new Promise(() => undefined);
        const consumers = this.queues.get(queue);
        if (consumers === undefined) {
          throw Object.assign(new Error(`NOT_FOUND - no queue '${queue}'`), {
            code: 404,
          });
        }
        return { queue, messageCount: 0, consumerCount: consumers };
      }),
      close: jest.fn(async () => undefined),
    }),
  );
  close = jest.fn(async () => undefined);
}

const config = {
  getOrThrow: (key: string): string =>
    ({
      AMQP_PROTOCOL: "amqp",
      AMQP_USER: "guest",
      AMQP_HOST: "rabbitmq",
      AMQP_PORT: "5672",
    })[key]!,
} as unknown as ConfigService;

describe("RabbitMqConsumerProbe", () => {
  const connect = amqp.connect as unknown as jest.Mock;
  let connection: FakeConnection;
  let probe: RabbitMqConsumerProbe;

  beforeEach(() => {
    connection = new FakeConnection();
    connect.mockReset().mockResolvedValue(connection);
    probe = new RabbitMqConsumerProbe(config);
  });

  it("counts the consumers of a plugin's dispatch queue", async () => {
    connection.queues.set("dispatcher_js-sbom", 2);
    await expect(probe.count("js-sbom")).resolves.toBe(2);
  });

  it("counts no consumer when the queue was never declared", async () => {
    await expect(probe.count("codeql")).resolves.toBe(0);
  });

  it("asks over one connection", async () => {
    connection.queues.set("dispatcher_js-sbom", 1);
    await probe.count("js-sbom");
    await probe.count("codeql");
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("fails when the broker cannot be reached", async () => {
    connect.mockReset().mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(probe.count("js-sbom")).rejects.toThrow("ECONNREFUSED");
  });

  describe("against a broker that does not answer", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("gives up on a connect that hangs", async () => {
      connect.mockReset().mockReturnValue(new Promise(() => undefined));
      const failed = expect(probe.count("js-sbom")).rejects.toThrow(
        "timed out",
      );
      await jest.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS);
      await failed;
    });

    it("gives up on a queue check that hangs", async () => {
      connection.hang = true;
      const failed = expect(probe.count("js-sbom")).rejects.toThrow(
        "timed out",
      );
      await jest.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS);
      await failed;
    });

    it("connects again after a connect timed out", async () => {
      connect.mockReset().mockReturnValueOnce(new Promise(() => undefined));
      const failed = expect(probe.count("js-sbom")).rejects.toThrow(
        "timed out",
      );
      await jest.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS);
      await failed;
      connect.mockResolvedValue(connection);
      connection.queues.set("dispatcher_js-sbom", 1);
      await expect(probe.count("js-sbom")).resolves.toBe(1);
    });
  });
});
