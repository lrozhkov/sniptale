type GuardedGlobal = object;

const DENIED_ERROR_NAME = 'SNIPTALE_EFFECT_RUNTIME_API_DENIED';

export function installEffectRuntimeSandboxGuards(globalScope: GuardedGlobal = globalThis): void {
  for (const key of [
    'fetch',
    'XMLHttpRequest',
    'WebSocket',
    'EventSource',
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'caches',
  ]) {
    denyGlobalProperty(globalScope, key);
  }
  denyNestedProperty(globalScope, 'navigator', 'sendBeacon');
  denyNestedProperty(globalScope, 'navigator', 'clipboard');
  denyNestedProperty(globalScope, 'document', 'cookie');
}

function denyGlobalProperty(globalScope: GuardedGlobal, key: string): void {
  const scope = globalScope as Record<string, unknown>;
  try {
    Object.defineProperty(scope, key, deniedDescriptor(key));
  } catch {
    try {
      scope[key] = () => {
        throw createDeniedError(key);
      };
    } catch {
      // CSP remains the final network backstop for browser-owned non-configurable globals.
    }
  }
}

function denyNestedProperty(globalScope: GuardedGlobal, owner: string, key: string): void {
  const ownerValue = (globalScope as Record<string, unknown>)[owner];
  if (ownerValue === null || typeof ownerValue !== 'object') return;
  try {
    Object.defineProperty(ownerValue, key, deniedDescriptor(`${owner}.${key}`));
  } catch {
    // Browser-owned descriptors may be non-configurable; sandbox CSP remains authoritative.
  }
}

function deniedDescriptor(name: string): PropertyDescriptor {
  return {
    configurable: true,
    get() {
      throw createDeniedError(name);
    },
    set() {
      throw createDeniedError(name);
    },
  };
}

function createDeniedError(apiName: string): Error {
  const error = new Error(`${DENIED_ERROR_NAME}:${apiName}`);
  error.name = DENIED_ERROR_NAME;
  return error;
}
