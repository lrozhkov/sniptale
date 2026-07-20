import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  consumeLlmSessionToken,
  issueLlmSessionToken,
  resetLlmSessionTokensForTests,
} from './session-tokens';
import type { AiEgressAuthority } from '../../../features/ai/egress-authority';
import { assertPolicyStateDescriptor } from '../../routing-contracts/policy-state';

const CONTENT_HASH = 'sha256:1111111111111111111111111111111111111111111111111111111111111111';
const SCENARIO_HASH = 'sha256:2222222222222222222222222222222222222222222222222222222222222222';
const LLM_SESSION_POLICY_ID = 'llm-session-tokens';

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://extension-id/${path}`,
  },
}));

function createContentSender(args: {
  documentId?: string;
  frameId?: number;
  tabId: number;
  url?: string;
}): chrome.runtime.MessageSender {
  return {
    ...(args.documentId === undefined ? {} : { documentId: args.documentId }),
    ...(args.frameId === undefined ? {} : { frameId: args.frameId }),
    tab: { id: args.tabId } as chrome.tabs.Tab,
    ...(args.url === undefined ? {} : { url: args.url }),
  };
}

function createScenarioSender(url: string, documentId?: string): chrome.runtime.MessageSender {
  return {
    ...(documentId === undefined ? {} : { documentId }),
    url,
  };
}

function createContentAuthority(payloadHash = CONTENT_HASH): AiEgressAuthority {
  return {
    captureMode: 'selected_editable',
    contractVersion: 1,
    payloadHash,
    purpose: 'content-ai-pick',
    riskClass: 'safe_text',
  };
}

function createScenarioAuthority(payloadHash = SCENARIO_HASH): AiEgressAuthority {
  return {
    attachmentSummary: { count: 0, items: [], totalDataUrlLength: 0 },
    contractVersion: 1,
    payloadHash,
    purpose: 'scenario-editor',
    scenarioContractVersion: 3,
  };
}

function getLlmSessionTtlMs(): number {
  const ttlMs = assertPolicyStateDescriptor(LLM_SESSION_POLICY_ID).ttlMs;
  expect(ttlMs).toBe(2 * 60 * 1000);
  return ttlMs ?? 0;
}

beforeEach(() => {
  resetLlmSessionTokensForTests();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-02T10:00:00.000Z'));
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'token-1') });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetLlmSessionTokensForTests();
});

it('binds content AI tokens to tab, frame, and document and consumes them once', () => {
  const sender = createContentSender({ documentId: 'doc-1', frameId: 2, tabId: 7 });
  const token = issueLlmSessionToken({
    egressAuthority: createContentAuthority(),
    purpose: 'content-ai-pick',
    sender,
  });

  expect(token).toBe('token-1');
  expect(
    consumeLlmSessionToken({
      egressAuthority: createContentAuthority(),
      purpose: 'content-ai-pick',
      sender,
      token: 'token-1',
    })
  ).toBe(true);
  expect(
    consumeLlmSessionToken({
      egressAuthority: createContentAuthority(),
      purpose: 'content-ai-pick',
      sender,
      token: 'token-1',
    })
  ).toBe(false);
});

it('rejects content tokens from a different frame or purpose', () => {
  const sender = createContentSender({
    documentId: 'doc-1',
    frameId: 2,
    tabId: 7,
    url: 'https://example.test/page',
  });
  const token = issueLlmSessionToken({
    egressAuthority: createContentAuthority(),
    purpose: 'content-ai-pick',
    sender,
  });

  expect(
    consumeLlmSessionToken({
      egressAuthority: createScenarioAuthority(),
      purpose: 'scenario-editor',
      sender,
      token: token ?? '',
    })
  ).toBe(false);

  const secondToken = issueLlmSessionToken({
    egressAuthority: createContentAuthority(),
    purpose: 'content-ai-pick',
    sender,
  });
  expect(
    consumeLlmSessionToken({
      egressAuthority: createContentAuthority(),
      purpose: 'content-ai-pick',
      sender: createContentSender({
        documentId: 'doc-1',
        frameId: 2,
        tabId: 8,
        url: 'https://example.test/page',
      }),
      token: secondToken ?? '',
    })
  ).toBe(false);
});

it('requires scenario editor tokens to match extension origin and path', () => {
  const sender = createScenarioSender(
    'chrome-extension://extension-id/apps/extension/src/scenario-editor/index.html',
    'scenario-doc-1'
  );
  const token = issueLlmSessionToken({
    egressAuthority: createScenarioAuthority(),
    purpose: 'scenario-editor',
    sender,
  });

  expect(
    consumeLlmSessionToken({
      egressAuthority: createScenarioAuthority(),
      purpose: 'scenario-editor',
      sender,
      token: token ?? '',
    })
  ).toBe(true);
  expect(
    issueLlmSessionToken({
      egressAuthority: createScenarioAuthority(),
      purpose: 'scenario-editor',
      sender: createScenarioSender(
        'https://example.test/src/scenario-editor/index.html',
        'scenario-doc-1'
      ),
    })
  ).toBeNull();
  expect(
    issueLlmSessionToken({
      egressAuthority: createScenarioAuthority(),
      purpose: 'scenario-editor',
      sender: createScenarioSender(
        'chrome-extension://extension-id/apps/extension/src/settings/index.html',
        'scenario-doc-1'
      ),
    })
  ).toBeNull();
});

it('binds scenario editor tokens to the sender document id', () => {
  const url = 'chrome-extension://extension-id/apps/extension/src/scenario-editor/index.html';
  const sender = createScenarioSender(url, 'scenario-doc-1');
  const token = issueLlmSessionToken({
    egressAuthority: createScenarioAuthority(),
    purpose: 'scenario-editor',
    sender,
  });

  expect(
    consumeLlmSessionToken({
      egressAuthority: createScenarioAuthority(),
      purpose: 'scenario-editor',
      sender: createScenarioSender(url, 'scenario-doc-2'),
      token: token ?? '',
    })
  ).toBe(false);
});

it('rejects scenario editor session issuance when document id is missing', () => {
  expect(
    issueLlmSessionToken({
      egressAuthority: createScenarioAuthority(),
      purpose: 'scenario-editor',
      sender: createScenarioSender(
        'chrome-extension://extension-id/apps/extension/src/scenario-editor/index.html'
      ),
    })
  ).toBeNull();
});

it('expires unused tokens', () => {
  const sender = createContentSender({ documentId: 'doc-1', frameId: 0, tabId: 1 });
  const token = issueLlmSessionToken({
    egressAuthority: createContentAuthority(),
    purpose: 'content-ai-pick',
    sender,
  });

  vi.advanceTimersByTime(getLlmSessionTtlMs() + 1);

  expect(
    consumeLlmSessionToken({
      egressAuthority: createContentAuthority(),
      purpose: 'content-ai-pick',
      sender,
      token: token ?? '',
    })
  ).toBe(false);
});

it('prunes expired tokens while preserving fresh session tokens', () => {
  const randomUUID = vi
    .fn()
    .mockReturnValueOnce('expired-token')
    .mockReturnValueOnce('fresh-token');
  vi.stubGlobal('crypto', { randomUUID });
  const sender = createContentSender({ documentId: 'doc-1', frameId: 0, tabId: 1 });
  const expiredToken = issueLlmSessionToken({
    egressAuthority: createContentAuthority(),
    purpose: 'content-ai-pick',
    sender,
  });

  vi.advanceTimersByTime(getLlmSessionTtlMs() + 1);
  const freshToken = issueLlmSessionToken({
    egressAuthority: createContentAuthority(),
    purpose: 'content-ai-pick',
    sender,
  });

  expect(
    consumeLlmSessionToken({
      egressAuthority: createContentAuthority(),
      purpose: 'content-ai-pick',
      sender,
      token: expiredToken ?? '',
    })
  ).toBe(false);
  expect(
    consumeLlmSessionToken({
      egressAuthority: createContentAuthority(),
      purpose: 'content-ai-pick',
      sender,
      token: freshToken ?? '',
    })
  ).toBe(true);
});

it('rejects content tokens when the payload-bound authority changes', () => {
  const sender = createContentSender({ documentId: 'doc-1', frameId: 0, tabId: 1 });
  const token = issueLlmSessionToken({
    egressAuthority: createContentAuthority('payload-a'),
    purpose: 'content-ai-pick',
    sender,
  });

  expect(
    consumeLlmSessionToken({
      egressAuthority: createContentAuthority('payload-b'),
      purpose: 'content-ai-pick',
      sender,
      token: token ?? '',
    })
  ).toBe(false);
});
