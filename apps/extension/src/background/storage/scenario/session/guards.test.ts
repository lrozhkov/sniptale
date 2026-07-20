import { expect, it } from 'vitest';

import {
  parseStoredPendingScenarioCapture,
  parseStoredScenarioSessionState,
  parseStoredScenarioSurfaceState,
} from './guards';
import { createStoredPendingScenarioCapture, createStoredScenarioTabState } from './test-support';

it('parses a valid persisted pending capture with optional metadata', () => {
  const parsed = parseStoredPendingScenarioCapture({
    ...createStoredPendingScenarioCapture(),
    target: {
      selector: '#submit',
      iframeSelector: null,
      tagName: 'button',
      role: 'button',
      text: 'Submit',
      ariaLabel: null,
      title: null,
      rect: { x: 40, y: 50, width: 120, height: 32 },
    },
    interactionPoint: { x: 44, y: 58 },
    cursorPoint: { x: 45, y: 59 },
    captureMetadata: {
      trigger: 'pointer-up',
      pointerRange: {
        start: { x: 40, y: 54 },
        end: { x: 44, y: 58 },
        minX: 40,
        minY: 54,
        maxX: 44,
        maxY: 58,
        distance: 6,
        durationMs: 180,
      },
      scroll: {
        startX: 10,
        startY: 20,
        endX: 10,
        endY: 80,
        deltaX: 0,
        deltaY: 60,
      },
    },
  });

  expect(parsed).toEqual(
    expect.objectContaining({
      pendingAssetId: 'pending-asset-1',
      target: expect.objectContaining({ selector: '#submit' }),
      interactionPoint: { x: 44, y: 58 },
      cursorPoint: { x: 45, y: 59 },
      captureMetadata: expect.objectContaining({ trigger: 'pointer-up' }),
    })
  );
});

it('drops persisted pending captures with malformed optional point or target payloads', () => {
  expect(
    parseStoredPendingScenarioCapture({
      ...createStoredPendingScenarioCapture(),
      target: 5,
    })
  ).toBeNull();

  expect(
    parseStoredPendingScenarioCapture({
      ...createStoredPendingScenarioCapture(),
      interactionPoint: { x: 'bad', y: 10 },
    })
  ).toBeNull();
});

it('drops persisted pending captures with malformed capture metadata', () => {
  expect(
    parseStoredPendingScenarioCapture({
      ...createStoredPendingScenarioCapture(),
      captureMetadata: 'invalid',
    })
  ).toBeNull();
});

it('omits capture metadata when persisted payloads do not carry it', () => {
  const parsed = parseStoredPendingScenarioCapture({
    ...createStoredPendingScenarioCapture(),
    captureMetadata: undefined,
  });

  expect(parsed).toEqual(
    expect.objectContaining({
      pendingAssetId: 'pending-asset-1',
    })
  );
  expect(parsed && 'captureMetadata' in parsed).toBe(false);
});

it('keeps null optionals and normalizes malformed gallery and text fields', () => {
  expect(
    parseStoredPendingScenarioCapture({
      ...createStoredPendingScenarioCapture(),
      galleryAssetId: 12,
      target: undefined,
      interactionPoint: undefined,
      cursorPoint: null,
      title: 7,
      body: false,
    })
  ).toEqual(
    expect.objectContaining({
      galleryAssetId: null,
      target: null,
      interactionPoint: null,
      cursorPoint: null,
      title: '',
      body: '',
    })
  );
});

it('parses stored session and surface records through the dedicated guards', () => {
  const storedState = createStoredScenarioTabState({
    captureMode: 'manual',
    projectId: 'project-1',
    projectName: 'Project 1',
  });

  expect(parseStoredScenarioSessionState(storedState.session)).toEqual(storedState.session);
  expect(parseStoredScenarioSurfaceState(storedState.surface)).toEqual(storedState.surface);
});

it('drops malformed stored session and surface records', () => {
  expect(parseStoredScenarioSessionState({ enabled: 'yes' })).toBeNull();
  expect(parseStoredScenarioSurfaceState({ screenshotMode: 'manual' })).toBeNull();
});
