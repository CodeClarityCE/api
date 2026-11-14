import type { AnalysisStartMessageCreate } from "src/types/rabbitMqMessages.types";

/**
 * Hands an analysis start message to the dispatcher.
 * @throws When the broker did not accept the message
 */
export abstract class AnalysisPublisher {
  abstract publish(message: AnalysisStartMessageCreate): Promise<void>;
}

/** Keeps published messages in memory, for tests. */
export class InMemoryAnalysisPublisher extends AnalysisPublisher {
  readonly published: AnalysisStartMessageCreate[] = [];
  /** When set, every publish fails with this error. */
  failWith: Error | undefined;

  publish(message: AnalysisStartMessageCreate): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.published.push(message);
    return Promise.resolve();
  }
}
