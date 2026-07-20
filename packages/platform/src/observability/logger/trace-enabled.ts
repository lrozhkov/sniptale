import { readLocalStorageItem } from '../../browser/local-storage';

const TRACE_NAMESPACE_STORAGE_KEY = 'sniptale:trace:namespaces';

declare global {
  var __SNIPTALE_TRACE_NAMESPACES__: string | string[] | undefined;
}

function parseTraceNamespaces(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry) => entry.length > 0);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  return [];
}

function readTraceNamespacesFromStorage(): string[] {
  try {
    return parseTraceNamespaces(readLocalStorageItem(TRACE_NAMESPACE_STORAGE_KEY) ?? undefined);
  } catch {
    return [];
  }
}

function matchesTraceNamespace(pattern: string, namespace: string): boolean {
  return pattern === '*' || namespace === pattern || namespace.startsWith(`${pattern}:`);
}

export function isTraceEnabled(namespace: string): boolean {
  const explicitNamespaces = parseTraceNamespaces(globalThis.__SNIPTALE_TRACE_NAMESPACES__);
  const storageNamespaces = explicitNamespaces.length > 0 ? [] : readTraceNamespacesFromStorage();
  const activeNamespaces = explicitNamespaces.length > 0 ? explicitNamespaces : storageNamespaces;

  return activeNamespaces.some((pattern) => matchesTraceNamespace(pattern, namespace));
}
