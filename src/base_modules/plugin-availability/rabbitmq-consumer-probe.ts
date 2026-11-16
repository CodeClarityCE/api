import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as amqp from "amqplib";

import { buildAmqpSocketOptions } from "src/utils/amqp";

import { ConsumerProbe } from "./consumer-probe";

// The broker's reply code for a queue that does not exist
const NOT_FOUND = 404;

// How long a connect or queue check may take before the count fails
export const PROBE_TIMEOUT_MS = 2_000;

function withTimeout<T>(work: Promise<T>, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${what} timed out`)),
      PROBE_TIMEOUT_MS,
    );
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Counts consumers with a passive queue check over one long-lived connection,
 * reopened on the next count after it drops.
 */
@Injectable()
export class RabbitMqConsumerProbe
  extends ConsumerProbe
  implements OnApplicationShutdown
{
  private connection: Promise<amqp.ChannelModel> | undefined;

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async count(plugin: string): Promise<number> {
    const connection = await this.open();
    // A missing queue closes the channel, so each check gets its own
    const channel = await connection.createChannel();
    channel.on("error", () => undefined);
    try {
      const queue = await withTimeout(
        channel.checkQueue(`dispatcher_${plugin}`),
        "RabbitMQ queue check",
      );
      return queue.consumerCount;
    } catch (err) {
      if ((err as { code?: number }).code === NOT_FOUND) return 0;
      throw err;
    } finally {
      channel.close().catch(() => undefined);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    const connection = this.connection;
    this.connection = undefined;
    if (!connection) return;
    try {
      await (await connection).close();
    } catch {
      // Already closed or never opened
    }
  }

  private open(): Promise<amqp.ChannelModel> {
    if (!this.connection) {
      const connecting = this.connect();
      this.connection = withTimeout(connecting, "RabbitMQ connect").catch(
        (err: unknown) => {
          this.connection = undefined;
          // Close a connection that only arrives after the timeout
          connecting.then((late) => late.close()).catch(() => undefined);
          throw err;
        },
      );
    }
    return this.connection;
  }

  private async connect(): Promise<amqp.ChannelModel> {
    const get = (key: string): string => this.configService.getOrThrow(key);
    const connection = await amqp.connect(
      `${get("AMQP_PROTOCOL")}://${get("AMQP_USER")}:${
        process.env["AMQP_PASSWORD"]
      }@${get("AMQP_HOST")}:${get("AMQP_PORT")}`,
      { ...buildAmqpSocketOptions(), timeout: PROBE_TIMEOUT_MS },
    );
    const forget = (): void => {
      this.connection = undefined;
    };
    connection.on("close", forget);
    connection.on("error", forget);
    return connection;
  }
}
