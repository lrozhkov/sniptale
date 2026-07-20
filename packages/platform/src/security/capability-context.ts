export type CapabilityScope =
  | 'debugger:attach'
  | 'content:privileged-action'
  | 'export:har'
  | 'export:har:start'
  | 'export:video-project:cancel'
  | 'export:video-project:start'
  | 'gallery:image-update'
  | 'ipc:popup-export-tab-route'
  | 'llm:content-ai-pick'
  | 'llm:scenario-editor'
  | 'offscreen:command'
  | 'offscreen:runtime';

export type CapabilityContext = {
  expiresAtEpochMs: number;
  origin: string | null;
  scopes: readonly CapabilityScope[];
  tabId: number | null;
  token: string;
};

export function resolveCapabilityOrigin(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.origin === 'null'
      ? `${parsedUrl.protocol}//${parsedUrl.host}`
      : parsedUrl.origin;
  } catch {
    return null;
  }
}

export function createCapabilityContext(args: {
  expiresAtEpochMs: number;
  origin?: string | null | undefined;
  scopes: readonly CapabilityScope[];
  tabId?: number | null | undefined;
  token: string;
}): CapabilityContext {
  return {
    expiresAtEpochMs: args.expiresAtEpochMs,
    origin: args.origin ?? null,
    scopes: [...args.scopes],
    tabId: args.tabId ?? null,
    token: args.token,
  };
}

export function isCapabilityContextAuthorized(
  context: CapabilityContext,
  expected: {
    origin?: string | null | undefined;
    scope: CapabilityScope;
    tabId?: number | null | undefined;
    token: string;
    nowEpochMs?: number | undefined;
  }
): boolean {
  if (context.token !== expected.token || !context.scopes.includes(expected.scope)) {
    return false;
  }

  if (context.expiresAtEpochMs <= (expected.nowEpochMs ?? Date.now())) {
    return false;
  }

  if (expected.tabId !== undefined && context.tabId !== expected.tabId) {
    return false;
  }

  if (expected.origin !== undefined && context.origin !== expected.origin) {
    return false;
  }

  return true;
}
