import { stateManager } from '../../../../composition/persistence/infrastructure/state-manager';
import {
  assertPolicyStateDescriptor,
  type PolicyStateId,
  type PolicyStateStorageClass,
} from '../../policy-state';

type PrivilegedMemoryDomain<T> = {
  clear(): void;
  delete(key: string): void;
  entries(): IterableIterator<[string, T]>;
  get(key: string): T | undefined;
  has(key: string): boolean;
  prune(shouldDelete: (entry: { key: string; value: T }) => boolean): void;
  set(key: string, value: T): void;
};

type PrivilegedCapabilityStoreOptions = {
  domain: string;
  policyId: PolicyStateId;
  storageClass: PolicyStateStorageClass;
};

const registeredDomains = new Set<string>();
const domainValues = new Map<string, Map<string, unknown>>();
const domainPolicyIds = new Map<string, PolicyStateId>();

function assertPrivilegedCapabilityPolicy({
  domain,
  policyId,
  storageClass,
}: PrivilegedCapabilityStoreOptions): void {
  const descriptor = assertPolicyStateDescriptor(policyId);
  if (descriptor.stateClass !== 'capability') {
    throw new Error(`Policy state is not a capability: ${policyId}`);
  }
  if (descriptor.storageClass !== storageClass) {
    throw new Error(
      [
        `Policy state storage class mismatch for ${policyId}:`,
        `expected ${descriptor.storageClass}, received ${storageClass}.`,
      ].join(' ')
    );
  }
  if (storageClass !== 'memory-only') {
    throw new Error(`Privileged capability store only supports memory-only storage: ${policyId}`);
  }
  if (!descriptor.failClosedOnRestart || descriptor.restartClass !== 'disposable-fail-closed') {
    throw new Error(`Memory-only privileged capability must fail closed: ${policyId}`);
  }

  const registeredPolicyId = domainPolicyIds.get(domain);
  if (registeredPolicyId && registeredPolicyId !== policyId) {
    throw new Error(
      `Privileged capability domain ${domain} already uses policy state ${registeredPolicyId}.`
    );
  }
  domainPolicyIds.set(domain, policyId);
}

function createPrivilegedMemoryAdapter<T>(values: Map<string, T>) {
  return {
    async clear() {
      values.clear();
    },
    async hydrate() {
      return Object.fromEntries(values.entries());
    },
    async read(key: string) {
      return values.get(key);
    },
    async remove(key: string) {
      values.delete(key);
    },
    async removeMany(keys: string[]) {
      keys.forEach((key) => values.delete(key));
    },
    async write(key: string, value: unknown) {
      values.set(key, value as T);
    },
    async writeMany(nextValues: Record<string, unknown>) {
      Object.entries(nextValues).forEach(([key, value]) => values.set(key, value as T));
    },
  };
}

function createPrivilegedMemoryFacade<T>(values: Map<string, T>): PrivilegedMemoryDomain<T> {
  return {
    clear: () => values.clear(),
    delete: (key) => {
      values.delete(key);
    },
    entries: () => values.entries(),
    get: (key) => values.get(key),
    has: (key) => values.has(key),
    prune: (shouldDelete) => {
      for (const [key, value] of values.entries()) {
        if (shouldDelete({ key, value })) {
          values.delete(key);
        }
      }
    },
    set: (key, value) => {
      values.set(key, value);
    },
  };
}

function createPrivilegedMemoryDomain<T>(domain: string): PrivilegedMemoryDomain<T> {
  const values = (domainValues.get(domain) ?? new Map<string, unknown>()) as Map<string, T>;
  domainValues.set(domain, values as Map<string, unknown>);

  if (!registeredDomains.has(domain)) {
    registeredDomains.add(domain);
    stateManager.registerDomain(domain, {
      adapter: createPrivilegedMemoryAdapter(values),
      description: `Privileged runtime authority state for ${domain}`,
    });
  }

  return createPrivilegedMemoryFacade(values);
}

export function createPrivilegedCapabilityStore<T>(
  options: PrivilegedCapabilityStoreOptions
): PrivilegedMemoryDomain<T> {
  assertPrivilegedCapabilityPolicy(options);
  return createPrivilegedMemoryDomain<T>(options.domain);
}

/**
 * @deprecated Use createPrivilegedCapabilityStore with a policy-state id.
 */
export function createPrivilegedSyncMemoryDomain<T>(domain: string): PrivilegedMemoryDomain<T> {
  return createPrivilegedMemoryDomain<T>(domain);
}
