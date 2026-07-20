import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import {
  authorizeMissingPolicyForTests,
  authorizeRegisteredProjectExportRuntimeMessage,
  authorizeRegisteredIPCMessage,
  authorizationPolicyRegistry,
  getAuthorizationPolicyEntry,
  getProjectExportAuthorizationPolicyEntry,
} from './policy-registry';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { authorizeProjectExportRuntimeMessage } from '../../../media/video/runtime/authorization/project-export';
import {
  resetIncidentCapabilityKillSwitchForTests,
  setIncidentCapabilityFamilyDisabled,
} from './incident-capability-kill-switch';

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
}));

const CONTENT_URL = 'https://example.test/page';
const POPUP_URL = 'chrome-extension://test/apps/extension/src/popup/index.html';
const SETTINGS_URL = 'chrome-extension://test/apps/extension/src/settings/index.html';

afterEach(() => {
  resetIncidentCapabilityKillSwitchForTests();
});

function sender(props: {
  documentId?: string;
  frameId?: number;
  tabId?: number;
  url?: string;
}): chrome.runtime.MessageSender {
  return {
    ...(props.documentId === undefined ? {} : { documentId: props.documentId }),
    ...(props.frameId === undefined ? {} : { frameId: props.frameId }),
    ...(props.tabId === undefined ? {} : { tab: { id: props.tabId } as chrome.tabs.Tab }),
    ...(props.url === undefined ? {} : { url: props.url }),
  };
}

it('keeps privileged runtime authorization policies discoverable from one registry', () => {
  expect(authorizationPolicyRegistry.map((entry) => entry.key).sort()).toEqual([
    'background-owned',
    'offscreen-runtime',
    'popup-export-tab-route',
    'privileged-tab-route:capture',
    'privileged-tab-route:page-style',
    'privileged-tab-route:scenario',
    'privileged-tab-route:tab-mode',
    'privileged-tab-route:video-control',
    'project-export-runtime',
    'video-control-camera-recorder-route',
    'video-control-no-tab-route',
    'video-control-owner-no-tab-route',
  ]);
});

it('anchors authorization policies to existing owner modules', () => {
  for (const entry of authorizationPolicyRegistry) {
    expect(entry.policyOwnerModule, entry.key).toMatch(/^apps\/extension\/src\/background\//);
    expect(existsSync(join(process.cwd(), entry.policyOwnerModule)), entry.key).toBe(true);
    if (entry.capabilityOwnerModule) {
      expect(entry.capabilityOwnerModule, entry.key).toMatch(/^apps\/extension\/src\/background\//);
      expect(existsSync(join(process.cwd(), entry.capabilityOwnerModule)), entry.key).toBe(true);
    }
  }
});

it('records truthful popup and offscreen policy owners', () => {
  expect(authorizationPolicyRegistry).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        capabilityOwnerModule: 'apps/extension/src/background/media/video/runtime/sender-policy.ts',
        key: 'offscreen-runtime',
        policyOwnerModule: 'apps/extension/src/background/media/video/runtime/sender-policy.ts',
      }),
      expect.objectContaining({
        capabilityOwnerModule:
          'apps/extension/src/background/runtime/routing/capabilities/popup-tab/route-capabilities.ts',
        key: 'popup-export-tab-route',
        policyOwnerModule:
          'apps/extension/src/background/runtime/routing/capabilities/popup-tab/route-capabilities.ts',
      }),
    ])
  );
});

it('records the project export async authorization policy owner', () => {
  expect(authorizationPolicyRegistry).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        authorizationMode: 'async',
        authorize: authorizeProjectExportRuntimeMessage,
        capabilityOwnerModule:
          'apps/extension/src/background/media/video/runtime/export-capabilities.ts',
        key: 'project-export-runtime',
        policyOwnerModule:
          'apps/extension/src/background/media/video/runtime/authorization/project-export.ts',
      }),
    ])
  );
});

it('resolves privileged tab policy entries by route family', () => {
  expect(
    getAuthorizationPolicyEntry({
      family: 'capture',
      kind: 'privileged-tab-route',
      message: undefined,
      resolvedTabId: 1,
      sender: undefined,
    })
  ).toEqual(
    expect.objectContaining({
      key: 'privileged-tab-route:capture',
      policyOwnerModule:
        'apps/extension/src/background/runtime/routing/authorization/privileged-tab.ts',
    })
  );
  expect(
    getAuthorizationPolicyEntry({
      family: 'video-control',
      kind: 'privileged-tab-route',
      message: undefined,
      resolvedTabId: 1,
      sender: undefined,
    })
  ).toEqual(expect.objectContaining({ key: 'privileged-tab-route:video-control' }));
});

it('resolves the project export policy entry separately from sync IPC policies', () => {
  expect(getProjectExportAuthorizationPolicyEntry()).toEqual(
    expect.objectContaining({
      authorizationMode: 'async',
      key: 'project-export-runtime',
      policyOwnerModule:
        'apps/extension/src/background/media/video/runtime/authorization/project-export.ts',
    })
  );
});

it('authorizes background-owned requests through the resolved registry entry', () => {
  const message = {
    operation: 'save-global-prompt',
    prompt: 'Prompt',
    type: MessageType.AI_SETTINGS_MUTATION,
  };

  expect(
    authorizeRegisteredIPCMessage({
      kind: 'background-owned',
      message,
      sender: sender({ url: SETTINGS_URL }),
    })
  ).toEqual({ authorized: true });
});

it('authorizes privileged tab requests through the resolved registry entry', () => {
  expect(
    authorizeRegisteredIPCMessage({
      family: 'tab-mode',
      kind: 'privileged-tab-route',
      resolvedTabId: 7,
      sender: sender({ documentId: 'doc-7', frameId: 0, tabId: 7, url: CONTENT_URL }),
    })
  ).toEqual({ authorized: true });
  expect(
    authorizeRegisteredIPCMessage({
      family: 'video-control',
      kind: 'privileged-tab-route',
      resolvedTabId: 7,
      sender: sender({ documentId: 'doc-7', frameId: 0, tabId: 7, url: CONTENT_URL }),
    })
  ).toEqual({ authorized: false, reason: 'Unauthorized video-control route sender' });
  expect(
    authorizeRegisteredIPCMessage({
      family: 'video-control',
      kind: 'privileged-tab-route',
      resolvedTabId: 7,
      sender: sender({ url: POPUP_URL }),
    })
  ).toEqual({ authorized: true });
});

it('authorizes offscreen runtime requests through the resolved registry entry', () => {
  expect(
    authorizeRegisteredIPCMessage({
      kind: 'offscreen-runtime',
      message: { type: VideoMessageType.GET_RECORDING_STATE },
      sender: {},
    })
  ).toEqual({ authorized: true });
  expect(
    authorizeRegisteredIPCMessage({
      kind: 'offscreen-runtime',
      message: {
        duration: 1,
        recordingId: 'recording-1',
        type: VideoMessageType.RECORDING_DURATION_UPDATED,
      },
      sender: sender({ tabId: 7, url: CONTENT_URL }),
    })
  ).toEqual({ authorized: false, reason: 'Unauthorized offscreen sender' });
});

it('authorizes popup export tab-route requests through the resolved registry entry', () => {
  expect(
    authorizeRegisteredIPCMessage({
      kind: 'popup-export-tab-route',
      message: { type: MessageType.ENABLE_SCREENSHOT_MODE },
      senderUrl: POPUP_URL,
    })
  ).toEqual({ authorized: true });
  expect(
    authorizeRegisteredIPCMessage({
      kind: 'popup-export-tab-route',
      message: { tabId: 7, type: MessageType.EXPORT_POPUP_PREVIEW },
      senderUrl: POPUP_URL,
    })
  ).toEqual({ authorized: false, reason: 'Invalid tab route capability' });
});

it('authorizes project export requests through the resolved async registry entry', async () => {
  await expect(
    authorizeRegisteredProjectExportRuntimeMessage({
      kind: 'project-export-runtime',
      message: { type: VideoMessageType.GET_RECORDING_STATE },
      sender: {},
    })
  ).resolves.toEqual({ authorized: true });
});

it('fails closed before sync policy dispatch when incident policy disables the family', () => {
  setIncidentCapabilityFamilyDisabled('privileged-tab-route:video-control', true);

  expect(
    authorizeRegisteredIPCMessage({
      family: 'video-control',
      kind: 'privileged-tab-route',
      resolvedTabId: 7,
      sender: sender({ url: POPUP_URL }),
    })
  ).toEqual({
    authorized: false,
    reason: 'Incident policy disabled capability family: privileged-tab-route:video-control',
  });
});

it('fails closed before async policy dispatch when incident policy disables project export', async () => {
  setIncidentCapabilityFamilyDisabled('project-export-runtime', true);

  await expect(
    authorizeRegisteredProjectExportRuntimeMessage({
      kind: 'project-export-runtime',
      message: { type: VideoMessageType.GET_RECORDING_STATE },
      sender: {},
    })
  ).resolves.toEqual({
    authorized: false,
    reason: 'Incident policy disabled capability family: project-export-runtime',
  });
});

it('fails closed when registry dispatch has no matching policy', () => {
  expect(authorizeMissingPolicyForTests()).toEqual({
    authorized: false,
    reason: 'Missing IPC authorization policy',
  });
});
