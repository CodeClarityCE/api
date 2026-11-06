import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as amqp from "amqplib";

import type { AnalysisStartMessageCreate } from "src/types/rabbitMqMessages.types";
import { buildAmqpSocketOptions } from "src/utils/amqp";

import { AnalysisPublisher } from "./analysis-publisher";

// How long a publish waits for the broker's confirmation
const CONFIRM_TIMEOUT_MS = 5_000;

interface Link {
  connection: amqp.ChannelModel;
  channel: amqp.ConfirmChannel;
}

/**
 * Publishes over one long-lived connection, opened on first use and reopened
 * on the next publish after it drops. A publish resolves once the broker confirms it.
 */
@Injectable()
export class RabbitMqAnalysisPublisher
  extends AnalysisPublisher
  implements OnApplicationShutdown
{
  private link: Promise<Link> | undefined;
  private current: amqp.ChannelModel | undefined;

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async publish(message: AnalysisStartMessageCreate): Promise<void> {
    const link = await this.open();
    const queue = this.configService.getOrThrow<string>("AMQP_ANALYSES_QUEUE");
    let timer: NodeJS.Timeout | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        // A blocked broker never confirms: drop the link so the next publish starts fresh
        timer = setTimeout(() => {
          this.drop(link.connection);
          reject(new Error("The broker has not confirmed the message in time"));
        }, CONFIRM_TIMEOUT_MS);
        link.channel.sendToQueue(
          queue,
          Buffer.from(JSON.stringify(message)),
          {},
          (err: unknown) => {
            if (!err) resolve();
            else if (err instanceof Error) reject(err);
            else reject(new Error("The broker did not confirm the message"));
          },
        );
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    const link = this.link;
    this.link = undefined;
    this.current = undefined;
    if (!link) return;
    try {
      await (await link).connection.close();
    } catch {
      // Already closed or never opened
    }
  }

  /** Retire a connection; only the current one clears the link, so a late event cannot. */
  private drop(connection: amqp.ChannelModel): void {
    if (this.current === connection) {
      this.current = undefined;
      this.link = undefined;
    }
    connection.close().catch(() => undefined);
  }

  private open(): Promise<Link> {
    this.link ??= this.connect().catch((err: unknown) => {
      // Half-open: close what was opened before the failure
      if (this.current) this.drop(this.current);
      this.link = undefined;
      throw err;
    });
    return this.link;
  }

  private async connect(): Promise<Link> {
    const connection = await amqp.connect(this.url(), buildAmqpSocketOptions());
    this.current = connection;
    // A dropped connection or channel makes the next publish reconnect
    const forget = (): void => {
      this.drop(connection);
    };
    connection.on("close", forget);
    connection.on("error", forget);
    const channel = await connection.createConfirmChannel();
    channel.on("close", forget);
    channel.on("error", forget);
    await channel.assertQueue(
      this.configService.getOrThrow<string>("AMQP_ANALYSES_QUEUE"),
    );
    return { connection, channel };
  }

  private url(): string {
    const get = (key: string): string => this.configService.getOrThrow(key);
    return `${get("AMQP_PROTOCOL")}://${get("AMQP_USER")}:${
      process.env["AMQP_PASSWORD"]
    }@${get("AMQP_HOST")}:${get("AMQP_PORT")}`;
  }
}
