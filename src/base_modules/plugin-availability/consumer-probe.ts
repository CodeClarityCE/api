/**
 * Counts what listens for a plugin, from its dispatch queue's consumers.
 * @throws When the broker cannot be asked
 */
export abstract class ConsumerProbe {
  abstract count(plugin: string): Promise<number>;
}

/** Consumer counts set by hand, for tests; an unset plugin has none. */
export class InMemoryConsumerProbe extends ConsumerProbe {
  readonly consumers = new Map<string, number>();
  /** When set, every count fails with this error. */
  failWith: Error | undefined;

  count(plugin: string): Promise<number> {
    if (this.failWith) return Promise.reject(this.failWith);
    return Promise.resolve(this.consumers.get(plugin) ?? 0);
  }
}
