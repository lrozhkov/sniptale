import { PRODUCT_BRAND_NAME } from '@sniptale/ui/branding';
import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import type { CapabilityContext } from '@sniptale/platform/security/capability-context';
import type { RequestWillBeSentEvent } from './events';
import {
  buildHarHeaders,
  buildHarQueryString,
  buildHarUrl,
  type HarHeader,
  type HarQueryParam,
  type HarSanitizationMode,
} from './sanitization';

type HarCookie = { name: string; value: string };

type HarEntry = {
  _requestId: string;
  _resourceType?: string;
  _error?: string;
  pageref: string;
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    cookies: HarCookie[];
    headers: HarHeader[];
    queryString: HarQueryParam[];
    headersSize: number;
    bodySize: number;
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    cookies: HarCookie[];
    headers: HarHeader[];
    content: {
      size: number;
      mimeType: string;
    };
    redirectURL: string;
    headersSize: number;
    bodySize: number;
  };
  cache: Record<string, never>;
  timings: {
    blocked: number;
    dns: number;
    connect: number;
    send: number;
    wait: number;
    receive: number;
    ssl: number;
  };
};

type ExportHarPayload = {
  log: {
    version: string;
    creator: {
      name: string;
      version: string;
    };
    browser: {
      name: string;
      version: string;
    };
    pages: Array<{
      id: string;
      startedDateTime: string;
      title: string;
      pageTimings: {
        onContentLoad: number;
        onLoad: number;
      };
    }>;
    entries: HarEntry[];
  };
};

export type ExportHarSession = {
  capabilityContext: CapabilityContext;
  capabilityToken: string;
  expiresAtEpochMs: number;
  sessionId: string;
  tabId: number;
  pageId: string;
  pageUrl: string;
  rawDiagnosticsEnabled: boolean;
  browserName: string;
  browserVersion: string;
  startedAtIso: string;
  pendingEntries: Map<string, HarEntry>;
  completedEntries: HarEntry[];
};

export type ExportHarCaptureResult = {
  har: ExportHarPayload;
  rawDiagnosticsEnabled: boolean;
};

export type ExportHarStartResult = {
  capabilityToken: string;
  expiresAtEpochMs: number;
};

type BrowserVersionMetadata = {
  product?: string;
  userAgent?: string;
};

export function sanitizeHeaders(headers: Record<string, string> | undefined): HarHeader[] {
  return buildHarHeaders(headers, 'sanitized');
}

export function buildSessionHarHeaders(
  session: ExportHarSession,
  headers: Record<string, string> | undefined
): HarHeader[] {
  return buildHarHeaders(headers, getHarSanitizationMode(session));
}

function getHarSanitizationMode(session: ExportHarSession): HarSanitizationMode {
  return session.rawDiagnosticsEnabled ? 'raw' : 'sanitized';
}

export function createPendingHarEntry(
  session: ExportHarSession,
  params: RequestWillBeSentEvent
): HarEntry {
  const mode = getHarSanitizationMode(session);

  return {
    _requestId: params.requestId,
    ...(params.type === undefined ? {} : { _resourceType: params.type }),
    pageref: session.pageId,
    startedDateTime: new Date().toISOString(),
    time: 0,
    request: {
      method: params.request.method,
      url: buildHarUrl(params.request.url, mode),
      httpVersion: 'HTTP/1.1',
      cookies: [],
      headers: buildHarHeaders(params.request.headers, mode),
      queryString: buildHarQueryString(params.request.url, mode),
      headersSize: -1,
      bodySize: -1,
    },
    response: {
      status: 0,
      statusText: '',
      httpVersion: '',
      cookies: [],
      headers: [],
      content: {
        size: -1,
        mimeType: '',
      },
      redirectURL: '',
      headersSize: -1,
      bodySize: -1,
    },
    cache: {},
    timings: {
      blocked: -1,
      dns: -1,
      connect: -1,
      send: 0,
      wait: 0,
      receive: 0,
      ssl: -1,
    },
  };
}

export function finalizeHarEntry(
  session: ExportHarSession,
  requestId: string,
  error?: string,
  size = -1
): void {
  const entry = session.pendingEntries.get(requestId);
  if (!entry) {
    return;
  }

  entry.time = Math.max(0, Date.now() - Date.parse(entry.startedDateTime));
  entry.response.content.size = size;
  if (error) {
    entry._error = error;
  }

  session.pendingEntries.delete(requestId);
  session.completedEntries.push(entry);
}

export function buildHarPayload(session: ExportHarSession): ExportHarPayload {
  const entries = [...session.completedEntries, ...session.pendingEntries.values()];
  const mode = getHarSanitizationMode(session);

  return {
    log: {
      version: '1.2',
      creator: {
        name: PRODUCT_BRAND_NAME,
        version: runtimeInfo.getManifest().version,
      },
      browser: {
        name: session.browserName,
        version: session.browserVersion,
      },
      pages: [
        {
          id: session.pageId,
          startedDateTime: session.startedAtIso,
          title: buildHarUrl(session.pageUrl, mode),
          pageTimings: {
            onContentLoad: -1,
            onLoad: -1,
          },
        },
      ],
      entries,
    },
  };
}

export function resolveHarBrowserMetadata(params: BrowserVersionMetadata | null | undefined): {
  name: string;
  version: string;
} {
  const product = params?.product?.trim();
  if (product) {
    const slashIndex = product.indexOf('/');
    if (slashIndex > 0) {
      return {
        name: product.slice(0, slashIndex),
        version: product.slice(slashIndex + 1),
      };
    }

    return {
      name: product,
      version: '',
    };
  }

  if (params?.userAgent?.trim()) {
    return {
      name: params.userAgent,
      version: '',
    };
  }

  return {
    name: 'Chromium',
    version: '',
  };
}

export function isDebuggerConflictError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes('already attached') ||
      error.message.includes('Cannot attach') ||
      error.message.includes('DevTools') ||
      error.message.includes('Another client'))
  );
}
