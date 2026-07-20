import { afterEach, expect, it, vi } from 'vitest';

import {
  CaptureMessageType,
  MessageType,
} from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  authorizeRegisteredIPCMessage,
  authorizeRegisteredProjectExportRuntimeMessage,
} from './policy-registry';
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

const POPUP_URL = 'chrome-extension://test/apps/extension/src/popup/index.html';

afterEach(() => {
  resetIncidentCapabilityKillSwitchForTests();
});

function sender(props: { url?: string }): chrome.runtime.MessageSender {
  return props.url === undefined ? {} : { url: props.url };
}

it('fails closed before sync policy dispatch when an incident disables a capability family', () => {
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

  setIncidentCapabilityFamilyDisabled('privileged-tab-route:video-control', false);

  expect(
    authorizeRegisteredIPCMessage({
      family: 'video-control',
      kind: 'privileged-tab-route',
      resolvedTabId: 7,
      sender: sender({ url: POPUP_URL }),
    })
  ).toEqual({ authorized: true });
});

it('fails closed before background-owned capability issuance when incident policy disables it', () => {
  setIncidentCapabilityFamilyDisabled('background-owned', true);

  expect(
    authorizeRegisteredIPCMessage({
      kind: 'background-owned',
      message: {
        actionType: CaptureMessageType.CAPTURE_VISIBLE,
        requestId: 'request-1',
        source: { kind: 'trusted-content-event-proof', proofToken: 'proof-1' },
        type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
      },
      sender: {},
    })
  ).toEqual({
    authorized: false,
    reason: 'Incident policy disabled capability family: background-owned',
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

  setIncidentCapabilityFamilyDisabled('project-export-runtime', false);

  await expect(
    authorizeRegisteredProjectExportRuntimeMessage({
      kind: 'project-export-runtime',
      message: { type: VideoMessageType.GET_RECORDING_STATE },
      sender: {},
    })
  ).resolves.toEqual({ authorized: true });
});
