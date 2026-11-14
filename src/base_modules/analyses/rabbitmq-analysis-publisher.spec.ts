import { type ConfigService } from "@nestjs/config";
import * as amqp from "amqplib";
import { EventEmitter } from "events";

import type { AnalysisStartMessageCreate } from "src/types/rabbitMqMessages.types";

import { RabbitMqAnalysisPublisher } from "./rabbitmq-analysis-publisher";

jest.mock("amqplib", () => ({ connect: jest.fn() }));

/** A broker connection that records what it was sent. */
class FakeConnection extends EventEmitter {
  readonly sent: { queue: string; message: unknown }[] = [];
  closed = false;
  channel = Object.assign(new EventEmitter(), {
    assertQueue: jest.fn().mockResolvedValue({}),
    sendToQueue: jest.fn(
      (
        queue: string,
        content: Buffer,
        _options: unknown,
        callback: (err: unknown) => void,
      ) => {
        if (this.silent) return true;
        if (this.nackWith) {
          callback(this.nackWith);
        } else {
          this.sent.push({ queue, message: JSON.parse(content.toString()) });
          callback(null);
        }
        return true;
      },
    ),
  });
  nackWith: Error | undefined;
  /** Never confirms, like a broker blocking publishers. */
  silent = false;

  createConfirmChannel = jest.fn(async () => this.channel);
  close = jest.fn(async () => {
    this.closed = true;
  });
}

const message: AnalysisStartMessageCreate = {
  analysis_id: "analysis-1",
  integration_id: null,
  organization_id: "org-1",
  project_id: "project-1",
};

const config = {
  getOrThrow: (key: string): string =>
    ({
      AMQP_ANALYSES_QUEUE: "api_request",
      AMQP_PROTOCOL: "amqp",
      AMQP_USER: "guest",
      AMQP_HOST: "rabbitmq",
      AMQP_PORT: "5672",
    })[key]!,
} as unknown as ConfigService;

describe("RabbitMqAnalysisPublisher", () => {
  const connect = amqp.connect as unknown as jest.Mock;
  let connections: FakeConnection[];
  let publisher: RabbitMqAnalysisPublisher;

  beforeEach(() => {
    connections = [];
    connect.mockReset();
    connect.mockImplementation(async () => {
      const connection = new FakeConnection();
      connections.push(connection);
      return connection;
    });
    publisher = new RabbitMqAnalysisPublisher(config);
  });

  it("sends every message over one connection", async () => {
    await publisher.publish(message);
    await publisher.publish({ ...message, analysis_id: "analysis-2" });

    expect(connections).toHaveLength(1);
    expect(connections[0]!.sent).toEqual([
      { queue: "api_request", message },
      {
        queue: "api_request",
        message: { ...message, analysis_id: "analysis-2" },
      },
    ]);
  });

  it("reconnects on the next publish after the connection drops", async () => {
    await publisher.publish(message);
    connections[0]!.emit("close", new Error("broker restarted"));

    await publisher.publish(message);

    expect(connections).toHaveLength(2);
    expect(connections[1]!.sent).toHaveLength(1);
  });

  it("retries the connection on the next publish after it could not open", async () => {
    connect.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(publisher.publish(message)).rejects.toThrow("ECONNREFUSED");
    await publisher.publish(message);

    expect(connections).toHaveLength(1);
    expect(connections[0]!.sent).toHaveLength(1);
  });

  it("rejects when the broker does not confirm the message", async () => {
    await publisher.publish(message);
    connections[0]!.nackWith = new Error("message nacked");

    await expect(publisher.publish(message)).rejects.toThrow("message nacked");
  });

  it("gives up when the broker never confirms, and reconnects next time", async () => {
    await publisher.publish(message);
    connections[0]!.silent = true;
    jest.useFakeTimers();
    try {
      const pending = publisher.publish(message);
      const outcome = expect(pending).rejects.toThrow(
        "not confirmed the message in time",
      );
      await jest.advanceTimersByTimeAsync(10_000);
      await outcome;
    } finally {
      jest.useRealTimers();
    }

    await publisher.publish(message);

    expect(connections).toHaveLength(2);
  });

  it("keeps its current connection when an old one reports closing late", async () => {
    await publisher.publish(message);
    connections[0]!.emit("close", new Error("dropped"));
    await publisher.publish(message);

    connections[0]!.emit("close", new Error("late duplicate"));
    await publisher.publish(message);

    expect(connections).toHaveLength(2);
    expect(connections[1]!.sent).toHaveLength(2);
  });

  it("closes its connection on shutdown", async () => {
    await publisher.publish(message);

    await publisher.onApplicationShutdown();

    expect(connections[0]!.closed).toBe(true);
  });

  it("shuts down cleanly when it never connected", async () => {
    await expect(publisher.onApplicationShutdown()).resolves.toBeUndefined();
    expect(connect).not.toHaveBeenCalled();
  });
});
