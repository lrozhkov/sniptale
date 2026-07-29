import { beforeEach, expect, it, vi } from 'vitest';

import {
  authorizeScreenshotSurfaceMutation,
  beginScreenshotSurfaceSession,
  bindScreenshotSurfaceSession,
  claimScreenshotModeDisable,
  claimScreenshotSurfaceApply,
  claimScreenshotSurfaceRelease,
  endScreenshotSurfaceSession,
  getScreenshotSurfaceCapabilityForDocument,
  getScreenshotSurfaceSession,
  markScreenshotSurfaceApplied,
  nextScreenshotSurfaceGeneration,
  renewScreenshotSurfaceCapability,
  resetScreenshotSurfaceSessionsForTests,
} from './screenshot-session';

beforeEach(() => {
  let token = 0;
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `surface-token-${++token}`) });
  resetScreenshotSurfaceSessionsForTests();
});

it('creates one stable session per tab and advances its generation', () => {
  const first = beginScreenshotSurfaceSession(7);
  const duplicate = beginScreenshotSurfaceSession(7);
  const next = nextScreenshotSurfaceGeneration(7);

  expect(duplicate).toBe(first);
  expect(next).toMatchObject({ generation: 1, sessionId: first.sessionId });
  expect(getScreenshotSurfaceSession(7)).toBe(first);
});

it('binds the capability to the first authorized document', () => {
  const session = beginScreenshotSurfaceSession(7);

  expect(
    authorizeScreenshotSurfaceMutation({
      capabilityToken: session.capabilityToken,
      documentId: null,
      tabId: 7,
    })
  ).toBe(false);
  expect(
    authorizeScreenshotSurfaceMutation({
      capabilityToken: 'wrong-token',
      documentId: 'document-1',
      tabId: 7,
    })
  ).toBe(false);
  expect(
    authorizeScreenshotSurfaceMutation({
      capabilityToken: session.capabilityToken,
      documentId: 'document-1',
      tabId: 7,
    })
  ).toBe(true);
  expect(
    authorizeScreenshotSurfaceMutation({
      capabilityToken: session.capabilityToken,
      documentId: 'document-2',
      tabId: 7,
    })
  ).toBe(false);
});

it('does not bind or disclose the capability during a read-only lookup', () => {
  const session = beginScreenshotSurfaceSession(7);

  expect(
    getScreenshotSurfaceCapabilityForDocument({ documentId: 'document-1', tabId: 7 })
  ).toBeNull();
  expect(getScreenshotSurfaceSession(7)).toMatchObject({ documentId: null });

  expect(bindScreenshotSurfaceSession({ documentId: 'document-1', tabId: 7 })).toBe(session);
  expect(getScreenshotSurfaceCapabilityForDocument({ documentId: 'document-1', tabId: 7 })).toBe(
    session.capabilityToken
  );
  expect(
    getScreenshotSurfaceCapabilityForDocument({ documentId: 'document-2', tabId: 7 })
  ).toBeNull();
  expect(
    getScreenshotSurfaceCapabilityForDocument({ documentId: 'document-1', tabId: 8 })
  ).toBeNull();
  expect(bindScreenshotSurfaceSession({ documentId: 'document-2', tabId: 7 })).toBeNull();
});

it('rejects a delayed apply after a newer operation has already been claimed', () => {
  const session = beginScreenshotSurfaceSession(7);
  const mutation = {
    capabilityToken: session.capabilityToken,
    documentId: 'document-1',
    tabId: 7,
  };

  expect(claimScreenshotSurfaceApply({ ...mutation, operationGeneration: 2 })).toMatchObject({
    generation: 2,
    lastOperationGeneration: 2,
  });
  expect(claimScreenshotSurfaceApply({ ...mutation, operationGeneration: 1 })).toBeNull();
});

it('releases only the exact active lease and rejects an older delayed release', () => {
  const session = beginScreenshotSurfaceSession(7);
  const mutation = {
    capabilityToken: session.capabilityToken,
    documentId: 'document-1',
    tabId: 7,
  };

  expect(claimScreenshotSurfaceApply({ ...mutation, operationGeneration: 1 })).not.toBeNull();
  markScreenshotSurfaceApplied(7, 1);
  expect(
    claimScreenshotSurfaceRelease({
      ...mutation,
      leaseGeneration: 0,
      operationGeneration: 2,
    })
  ).toBeNull();
  expect(
    claimScreenshotSurfaceRelease({
      ...mutation,
      leaseGeneration: 1,
      operationGeneration: 2,
    })
  ).toMatchObject({ activeLeaseGeneration: 1, lastOperationGeneration: 2 });
});

it('claims screenshot disable only for the active document, generation, and exact lease', () => {
  const session = beginScreenshotSurfaceSession(7);
  const mutation = {
    capabilityToken: session.capabilityToken,
    documentId: 'document-1',
    tabId: 7,
  };
  expect(claimScreenshotSurfaceApply({ ...mutation, operationGeneration: 1 })).not.toBeNull();
  markScreenshotSurfaceApplied(7, 1);

  expect(
    claimScreenshotModeDisable({
      ...mutation,
      leaseGeneration: null,
      operationGeneration: 2,
    })
  ).toBeNull();
  expect(
    claimScreenshotModeDisable({
      ...mutation,
      leaseGeneration: 1,
      operationGeneration: 1,
    })
  ).toBeNull();
  expect(
    claimScreenshotModeDisable({
      ...mutation,
      leaseGeneration: 1,
      operationGeneration: 2,
    })
  ).toMatchObject({ activeLeaseGeneration: 1, lastOperationGeneration: 2 });
});

it('renews document authorization without replacing the logical screenshot session', () => {
  const original = beginScreenshotSurfaceSession(7);
  const sessionId = original.sessionId;
  const originalToken = original.capabilityToken;
  nextScreenshotSurfaceGeneration(7);
  markScreenshotSurfaceApplied(7, 1);

  const renewed = renewScreenshotSurfaceCapability({ documentId: 'document-2', tabId: 7 });

  expect(renewed).toMatchObject({
    activeLeaseGeneration: 1,
    documentId: 'document-2',
    generation: 1,
    lastOperationGeneration: 1,
    sessionId,
  });
  expect(renewed.capabilityToken).not.toBe(originalToken);
});

it('ends and resets screenshot surface sessions', () => {
  beginScreenshotSurfaceSession(7);
  beginScreenshotSurfaceSession(8);
  endScreenshotSurfaceSession(7);

  expect(getScreenshotSurfaceSession(7)).toBeNull();
  expect(getScreenshotSurfaceSession(8)).not.toBeNull();

  resetScreenshotSurfaceSessionsForTests();
  expect(getScreenshotSurfaceSession(8)).toBeNull();
});
