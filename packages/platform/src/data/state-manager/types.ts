export type StateDomainName = string;
export type StateKey = string;

export interface StateDomainAdapter {
  clear?(): Promise<void>;
  hydrate?(): Promise<Record<string, unknown>>;
  read?(key: StateKey): Promise<unknown>;
  remove(key: StateKey): Promise<void>;
  removeMany?(keys: readonly StateKey[]): Promise<void>;
  write(key: StateKey, value: unknown): Promise<void>;
  writeMany?(values: Record<string, unknown>): Promise<void>;
}

export interface StateDomainRegistration {
  adapter: StateDomainAdapter;
  description?: string;
}

export interface StateWriteOptions {
  revision?: number;
}

export interface StateSnapshot<T = unknown> {
  revision: number;
  value: T | undefined;
}

export type StateMutation<T> = (value: T | undefined) => T | undefined | Promise<T | undefined>;

export interface StateManager {
  clearDomain(domain: StateDomainName): Promise<void>;
  hydrate(domain: StateDomainName): Promise<Record<string, unknown>>;
  mutate<T>(
    domain: StateDomainName,
    key: StateKey,
    mutation: StateMutation<T>
  ): Promise<StateSnapshot<T>>;
  read<T = unknown>(domain: StateDomainName, key: StateKey): Promise<T | undefined>;
  readSnapshot<T = unknown>(domain: StateDomainName, key: StateKey): Promise<StateSnapshot<T>>;
  registerDomain(domain: StateDomainName, registration: StateDomainRegistration): void;
  remove(domain: StateDomainName, key: StateKey): Promise<void>;
  removeMany(domain: StateDomainName, keys: readonly StateKey[]): Promise<void>;
  write<T = unknown>(
    domain: StateDomainName,
    key: StateKey,
    value: T,
    options?: StateWriteOptions
  ): Promise<StateSnapshot<T>>;
  writeMany(domain: StateDomainName, values: Record<string, unknown>): Promise<void>;
}
