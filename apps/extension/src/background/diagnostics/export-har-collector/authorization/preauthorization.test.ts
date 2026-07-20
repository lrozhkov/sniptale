import { afterEach, expect, it, vi } from 'vitest';

import {
  getPreauthorizedHarStartRouteMessage,
  hasPreauthorizedHarStartRouteMessage,
  hasPreauthorizedHarStopRouteMessage,
  markPreauthorizedHarStartRouteMessage,
  markPreauthorizedHarStopRouteMessage,
} from './preauthorization';
import {
  consumeExportHarStartCapability,
  issueExportHarStartCapability,
} from '../start-capability';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('tracks HAR start and stop preauthorization per message object', () => {
  const startMessage = {};
  const stopMessage = {};
  const otherMessage = {};
  vi.stubGlobal('crypto', { randomUUID: () => 'har-token-1' });
  const token = issueExportHarStartCapability({
    rawDiagnosticsEnabled: true,
    senderUrl: 'https://example.test/page',
    sessionId: 'session-1',
    tabId: 7,
  });
  const preauthorization = consumeExportHarStartCapability({
    capabilityToken: token,
    senderUrl: 'https://example.test/page',
    sessionId: 'session-1',
    tabId: 7,
  });

  markPreauthorizedHarStartRouteMessage(startMessage, preauthorization);
  markPreauthorizedHarStopRouteMessage(stopMessage);

  expect(hasPreauthorizedHarStartRouteMessage(startMessage)).toBe(true);
  expect(getPreauthorizedHarStartRouteMessage(startMessage)).toBe(preauthorization);
  expect(hasPreauthorizedHarStartRouteMessage(otherMessage)).toBe(false);
  expect(getPreauthorizedHarStartRouteMessage(otherMessage)).toBeUndefined();
  expect(hasPreauthorizedHarStopRouteMessage(stopMessage)).toBe(true);
  expect(hasPreauthorizedHarStopRouteMessage(otherMessage)).toBe(false);
});
