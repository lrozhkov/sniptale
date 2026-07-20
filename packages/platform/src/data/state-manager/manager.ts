import type {
  StateDomainName,
  StateDomainRegistration,
  StateKey,
  StateManager,
  StateMutation,
  StateSnapshot,
  StateWriteOptions,
} from './types';

type DomainState = StateDomainRegistration & {
  mutationQueues: Map<StateKey, Promise<unknown>>;
  revisions: Map<StateKey, number>;
};

function createStaleRevisionError(domain: StateDomainName, key: StateKey): Error {
  return new Error(`StateManager stale revision for ${domain}:${key}`);
}

class StateManagerImpl implements StateManager {
  private readonly domains = new Map<StateDomainName, DomainState>();

  async clearDomain(domain: StateDomainName): Promise<void> {
    const registration = this.getDomain(domain);
    if (registration.adapter.clear) {
      await registration.adapter.clear();
    } else {
      const hydrated = (await registration.adapter.hydrate?.()) ?? {};
      await Promise.all(Object.keys(hydrated).map((key) => registration.adapter.remove(key)));
    }
    registration.revisions.clear();
  }

  async hydrate(domain: StateDomainName): Promise<Record<string, unknown>> {
    const registration = this.getDomain(domain);
    return (await registration.adapter.hydrate?.()) ?? {};
  }

  async mutate<T>(
    domain: StateDomainName,
    key: StateKey,
    mutation: StateMutation<T>
  ): Promise<StateSnapshot<T>> {
    const registration = this.getDomain(domain);
    const previousMutation = registration.mutationQueues.get(key) ?? Promise.resolve();
    const nextMutation = previousMutation
      .catch(() => undefined)
      .then(() => this.runMutation(domain, key, mutation));

    registration.mutationQueues.set(key, nextMutation);
    return this.finalizeMutationQueue(registration, key, nextMutation);
  }

  async read<T = unknown>(domain: StateDomainName, key: StateKey): Promise<T | undefined> {
    return (await this.readRaw(this.getDomain(domain), key)) as T | undefined;
  }

  async readSnapshot<T = unknown>(
    domain: StateDomainName,
    key: StateKey
  ): Promise<StateSnapshot<T>> {
    const registration = this.getDomain(domain);
    return {
      revision: this.getRevision(registration, key),
      value: (await this.readRaw(registration, key)) as T | undefined,
    };
  }

  registerDomain(domain: StateDomainName, registration: StateDomainRegistration): void {
    this.domains.set(domain, {
      ...registration,
      mutationQueues:
        this.domains.get(domain)?.mutationQueues ?? new Map<StateKey, Promise<unknown>>(),
      revisions: this.domains.get(domain)?.revisions ?? new Map<StateKey, number>(),
    });
  }

  async remove(domain: StateDomainName, key: StateKey): Promise<void> {
    const registration = this.getDomain(domain);
    await registration.adapter.remove(key);
    this.setNextRevision(registration, key);
  }

  async removeMany(domain: StateDomainName, keys: readonly StateKey[]): Promise<void> {
    const registration = this.getDomain(domain);
    if (registration.adapter.removeMany) {
      await registration.adapter.removeMany(keys);
    } else {
      await Promise.all(keys.map((key) => registration.adapter.remove(key)));
    }
    keys.forEach((key) => this.setNextRevision(registration, key));
  }

  async write<T = unknown>(
    domain: StateDomainName,
    key: StateKey,
    value: T,
    options: StateWriteOptions = {}
  ): Promise<StateSnapshot<T>> {
    const registration = this.getDomain(domain);
    const revision = this.getRevision(registration, key);
    if (options.revision !== undefined && options.revision !== revision) {
      throw createStaleRevisionError(domain, key);
    }

    await registration.adapter.write(key, value);
    return {
      revision: this.setNextRevision(registration, key),
      value,
    };
  }

  async writeMany(domain: StateDomainName, values: Record<string, unknown>): Promise<void> {
    const registration = this.getDomain(domain);
    if (registration.adapter.writeMany) {
      await registration.adapter.writeMany(values);
    } else {
      await Promise.all(
        Object.entries(values).map(([key, value]) => registration.adapter.write(key, value))
      );
    }
    Object.keys(values).forEach((key) => this.setNextRevision(registration, key));
  }

  private async finalizeMutationQueue<T>(
    registration: DomainState,
    key: StateKey,
    nextMutation: Promise<StateSnapshot<T>>
  ): Promise<StateSnapshot<T>> {
    try {
      return await nextMutation;
    } finally {
      if (registration.mutationQueues.get(key) === nextMutation) {
        registration.mutationQueues.delete(key);
      }
    }
  }

  private getDomain(domain: StateDomainName): DomainState {
    const registration = this.domains.get(domain);
    if (!registration) {
      throw new Error(`StateManager domain is not registered: ${domain}`);
    }
    return registration;
  }

  private getRevision(registration: DomainState, key: StateKey): number {
    return registration.revisions.get(key) ?? 0;
  }

  private async readRaw(registration: DomainState, key: StateKey): Promise<unknown> {
    if (registration.adapter.read) {
      return registration.adapter.read(key);
    }

    return (await registration.adapter.hydrate?.())?.[key];
  }

  private async runMutation<T>(
    domain: StateDomainName,
    key: StateKey,
    mutation: StateMutation<T>
  ): Promise<StateSnapshot<T>> {
    const snapshot = await this.readSnapshot<T>(domain, key);
    const nextValue = await mutation(snapshot.value);
    if (nextValue === undefined) {
      await this.remove(domain, key);
      return { revision: snapshot.revision + 1, value: undefined };
    }
    return this.write(domain, key, nextValue, { revision: snapshot.revision });
  }

  private setNextRevision(registration: DomainState, key: StateKey): number {
    const revision = this.getRevision(registration, key) + 1;
    registration.revisions.set(key, revision);
    return revision;
  }
}

export function createStateManager(): StateManager {
  return new StateManagerImpl();
}
