import { vi } from 'vitest';

export type FakeLogger = {
  debug: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
};

export function createFakeLogger(): FakeLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

export type FakeRuntimeTransport = {
  sendMessage: ReturnType<typeof vi.fn>;
  reportProgress: ReturnType<typeof vi.fn>;
};

export function createFakeRuntimeTransport(): FakeRuntimeTransport {
  return {
    sendMessage: vi.fn(),
    reportProgress: vi.fn(),
  };
}

export function createModuleMockBag<const T extends readonly string[]>(
  names: T
): {
  [K in T[number]]: ReturnType<typeof vi.fn>;
} {
  return Object.fromEntries(names.map((name) => [name, vi.fn()])) as {
    [K in T[number]]: ReturnType<typeof vi.fn>;
  };
}

export function createSameOriginIframeDocument(html = '<body></body>') {
  const iframe = document.createElement('iframe');
  const doc = document.implementation.createHTMLDocument('iframe');
  const parsedDocument = new DOMParser().parseFromString(html, 'text/html');
  doc.body.replaceChildren(...parsedDocument.body.childNodes);

  Object.defineProperty(iframe, 'contentDocument', {
    configurable: true,
    value: doc,
  });
  Object.defineProperty(iframe, 'contentWindow', {
    configurable: true,
    value: { document: doc },
  });

  return {
    iframe,
    document: doc,
  };
}
