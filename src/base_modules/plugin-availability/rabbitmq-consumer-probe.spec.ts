import { type ConfigService } from "@nestjs/config";
import * as amqp from "amqplib";
import { EventEmitter } from "events";

import { RabbitMqConsumerProbe } from "./rabbitmq-consumer-probe";

jest.mock("amqplib", () => ({ connect: jest.fn() }));

/** A broker whose queues have the consumer counts set in `queues`. */
class FakeConnection extends EventEmitter {
  queues = new Map<string, number>();
  createChannel = jest.fn(async () =>
    Object.assign(new EventEmitter(), {
      checkQueue: jest.fn(async (queue: string) => {
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
});
