import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { SUPPORTED_LOCALES, type AppLocale } from '@sniptale/platform/i18n/config';
import { CATALOG_PROFILES, type CatalogProfile } from './catalog-profiles';
import { parseCatalogMessages } from './catalog-store';

export const CATALOG_PORT_NAME = 'sniptale:i18n-catalog:v1';
export const MAX_CATALOG_BYTES = 4 * 1024 * 1024;
const CATALOG_TIMEOUT_MS = 10_000;

type CatalogRequest = { locale: AppLocale; profile: CatalogProfile };
type CatalogTransportOptions = {
  getURL(path: string): string;
  connect(info: { name: string }): chrome.runtime.Port;
  fetch(input: string, init?: RequestInit): Promise<Response>;
  isExtensionContext(): boolean;
  timeoutMs?: number;
};

/** Accept only registered locales and profiles, never caller-selected paths. */
export function parseCatalogRequest(value: unknown): CatalogRequest | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.keys(value).length !== 2 || !('locale' in value) || !('profile' in value)) return null;
  const locale = SUPPORTED_LOCALES.find((supported) => supported === value.locale);
  const profile = CATALOG_PROFILES.find((supported) => supported === value.profile);
  return locale && profile ? { locale, profile } : null;
}

function parseCatalogReply(raw: unknown, request: CatalogRequest): unknown {
  if (
    raw === null ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    Object.keys(raw).length !== 3 ||
    !('locale' in raw) ||
    !('profile' in raw) ||
    !('messages' in raw) ||
    raw.locale !== request.locale ||
    raw.profile !== request.profile
  ) {
    throw new Error('Invalid translation catalog reply');
  }
  return parseBoundedCatalogMessages(raw.messages);
}

/** Apply the same bounded data contract to packaged files and Port replies. */
export function parseBoundedCatalogMessages(
  value: unknown
): ReturnType<typeof parseCatalogMessages> {
  const messages = parseCatalogMessages(value);
  if (new TextEncoder().encode(JSON.stringify(messages)).byteLength > MAX_CATALOG_BYTES) {
    throw new Error('Translation catalog exceeds its size limit');
  }
  return messages;
}

async function readCatalogResponse(response: Response): Promise<unknown> {
  if (!response.ok || !response.body) throw new Error('Translation catalog is unavailable');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_CATALOG_BYTES) throw new Error('Translation catalog exceeds its size limit');
      chunks.push(next.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  return parseBoundedCatalogMessages(value);
}

/** Load local catalog data during startup preparation without deferring feature code. */
export function createCatalogTransport(options: CatalogTransportOptions) {
  const timeoutMs = options.timeoutMs ?? CATALOG_TIMEOUT_MS;

  async function loadPackaged(request: CatalogRequest): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await readCatalogResponse(
        await options.fetch(options.getURL(`i18n/${request.profile}/${request.locale}.json`), {
          signal: controller.signal,
        })
      );
    } finally {
      clearTimeout(timer);
    }
  }

  function loadThroughPort(request: CatalogRequest): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const port = options.connect({ name: CATALOG_PORT_NAME });
      let settled = false;
      const finish = (error: Error | null, messages?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        port.onMessage.removeListener(onMessage);
        port.onDisconnect.removeListener(onDisconnect);
        try {
          port.disconnect();
        } catch {
          /* The peer can disconnect first. */
        }
        if (error) reject(error);
        else resolve(messages);
      };
      const onMessage = (raw: unknown) => {
        try {
          finish(null, parseCatalogReply(raw, request));
        } catch {
          finish(new Error('Invalid translation catalog reply'));
        }
      };
      const onDisconnect = () => finish(new Error('Translation catalog connection closed'));
      const timer = setTimeout(
        () => finish(new Error('Translation catalog request timed out')),
        timeoutMs
      );
      port.onMessage.addListener(onMessage);
      port.onDisconnect.addListener(onDisconnect);
      try {
        port.postMessage(request);
      } catch {
        finish(new Error('Translation catalog request failed'));
      }
    });
  }

  return {
    load(locale: AppLocale, profile: CatalogProfile): Promise<unknown> {
      const request = parseCatalogRequest({ locale, profile });
      if (!request) return Promise.reject(new Error('Invalid translation catalog request'));
      return options.isExtensionContext() ? loadPackaged(request) : loadThroughPort(request);
    },
  };
}

/** Read packaged data directly in extension contexts and through the broker in content. */
export function loadCatalogMessages(locale: AppLocale, profile: CatalogProfile): Promise<unknown> {
  return createCatalogTransport({
    getURL: (path) => browserRuntime.getURL(path),
    connect: (info) => browserRuntime.connect(info),
    fetch: (input, init) => fetch(input, init),
    isExtensionContext: () => {
      const extension = new URL(browserRuntime.getURL(''));
      return (
        typeof location !== 'undefined' &&
        location.protocol === extension.protocol &&
        location.host === extension.host
      );
    },
  }).load(locale, profile);
}
