/**
 * Counts what listens for a plugin, from its dispatch queue's consumers.
 * @throws When the broker cannot be asked
 */
export abstract class ConsumerProbe {
  abstract count(plugin: string): Promise<number>;
}
