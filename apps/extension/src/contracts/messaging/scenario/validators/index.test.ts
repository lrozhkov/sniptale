import { expect, it } from 'vitest';

import {
  isScenarioCaptureMode,
  isScenarioCaptureMetadata,
  isScenarioCaptureSourceKind,
  isScenarioCaptureSurface,
  isScenarioFramePadding,
  isScenarioPageDescriptor,
  isScenarioPointerRange,
  isScenarioPoint,
  isScenarioRect,
  isScenarioRecorderSurfaceState,
  isScenarioRestoreSnapshot,
  isScenarioScrollMetadata,
  isScenarioSessionPayload,
  isScenarioSessionState,
  isScenarioStringDataRecord,
  isScenarioSuggestedEventKind,
  isScenarioTargetDescriptor,
} from './index';

function createValidSessionPayload() {
  return {
    session: {
      enabled: false,
      captureMode: 'manual',
      projectId: null,
      projectName: null,
      rememberProjectSelection: false,
      pendingProjectSelection: true,
      sidebarVisible: true,
    },
    projects: [
      { id: 'project-1', name: 'Project 1', createdAt: 1, updatedAt: 2 },
      { id: 'project-2', name: 'Project 2', createdAt: 3, updatedAt: 4, tags: ['alpha'] },
    ],
    recentSteps: [
      {
        id: 'step-1',
        position: 0,
        previewDataUrl: 'data:image/png;base64,1',
        title: 'Step 1',
      },
    ],
    trashedSteps: [
      {
        id: 'step-2',
        deletedAt: 20,
        kind: 'capture',
        originalIndex: 1,
        title: 'Step 2',
      },
    ],
  };
}

function createStepMetadata() {
  return {
    captureMetadata: {
      pointerRange: null,
      scroll: null,
      trigger: 'pointer-up',
    },
    captureSurface: 'visible',
    cursorPoint: null,
    interactionPoint: { x: 10, y: 20 },
    page: {
      title: 'Page',
      url: 'https://example.com',
      viewport: { x: 0, y: 0, width: 1280, height: 720 },
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    },
    sourceKind: 'manual',
    target: null,
  };
}

it('validates scenario enums and scalar geometry helpers', () => {
  expect(isScenarioCaptureMode('manual')).toBe(true);
  expect(isScenarioCaptureMode('invalid')).toBe(false);
  expect(isScenarioCaptureSurface('full')).toBe(true);
  expect(isScenarioCaptureSurface('crop')).toBe(false);
  expect(isScenarioCaptureSourceKind('auto-click')).toBe(true);
  expect(isScenarioCaptureSourceKind('keyboard')).toBe(false);
  expect(isScenarioSuggestedEventKind('scroll')).toBe(true);
  expect(isScenarioSuggestedEventKind('hover')).toBe(false);
  expect(isScenarioPoint({ x: 1, y: 2 })).toBe(true);
  expect(isScenarioPoint({ x: 1 })).toBe(false);
  expect(isScenarioRect({ x: 1, y: 2, width: 3, height: 4 })).toBe(true);
  expect(isScenarioRect({ x: 1, y: 2, width: 3 })).toBe(false);
  expect(isScenarioFramePadding({ top: 1, left: 2, right: 3, bottom: 4 })).toBe(true);
  expect(isScenarioFramePadding({ top: 1, left: 2, right: 3 })).toBe(false);
});

it('validates capture pointer ranges, scroll metadata, and capture metadata payloads', () => {
  const pointerRange = {
    start: { x: 10, y: 20 },
    end: { x: 18, y: 26 },
    minX: 10,
    minY: 20,
    maxX: 18,
    maxY: 26,
    distance: 12,
    durationMs: 320,
  };
  const scroll = {
    startX: 10,
    startY: 20,
    endX: 10,
    endY: 140,
    deltaX: 0,
    deltaY: 120,
  };

  expect(isScenarioPointerRange(pointerRange)).toBe(true);
  expect(isScenarioPointerRange({ ...pointerRange, durationMs: 'slow' })).toBe(false);
  expect(isScenarioScrollMetadata(scroll)).toBe(true);
  expect(isScenarioScrollMetadata({ ...scroll, deltaY: '120' })).toBe(false);
  expect(
    isScenarioCaptureMetadata({
      pointerRange,
      scroll,
      trigger: 'pointer-up',
    })
  ).toBe(true);
  expect(
    isScenarioCaptureMetadata({
      pointerRange: null,
      scroll: null,
      trigger: 'keyboard-enter',
    })
  ).toBe(true);
  expect(
    isScenarioCaptureMetadata({
      pointerRange,
      scroll,
      trigger: 'hover',
    })
  ).toBe(false);
});

it('validates page and target descriptors with nullable optional fields', () => {
  expect(
    isScenarioPageDescriptor({
      title: 'Page',
      url: 'https://example.com',
      viewport: { x: 0, y: 0, width: 1280, height: 720 },
      scrollX: 0,
      scrollY: 10,
      devicePixelRatio: 1,
    })
  ).toBe(true);
  expect(
    isScenarioTargetDescriptor({
      selector: '#submit',
      iframeSelector: null,
      tagName: 'button',
      role: 'button',
      text: 'Submit',
      ariaLabel: null,
      title: null,
      rect: { x: 1, y: 2, width: 3, height: 4 },
      framePadding: { top: 3, left: 3, right: 3, bottom: 3 },
    })
  ).toBe(true);
  expect(isScenarioPageDescriptor({ viewport: null })).toBe(false);
  expect(isScenarioTargetDescriptor({ rect: { x: 1 } })).toBe(false);
});

it('validates session state and suggested-event data records', () => {
  expect(
    isScenarioSessionState({
      enabled: true,
      captureMode: 'by-click',
      projectId: 'project-1',
      projectName: 'Project 1',
      rememberProjectSelection: true,
      pendingProjectSelection: false,
      sidebarVisible: true,
    })
  ).toBe(true);
  expect(
    isScenarioStringDataRecord({
      ctrl: true,
      attempts: 2,
      label: 'Shortcut',
      value: null,
    })
  ).toBe(true);
  expect(isScenarioSessionState({ enabled: 'yes' })).toBe(false);
  expect(isScenarioStringDataRecord({ nested: { invalid: true } })).toBe(false);
});

it('validates session payloads with recent steps', () => {
  expect(isScenarioSessionPayload(createValidSessionPayload())).toBe(true);
  expect(isScenarioSessionPayload({ session: { enabled: 'yes' } })).toBe(false);
  expect(
    isScenarioSessionPayload({
      recentSteps: [{ id: 'step-1', previewDataUrl: 10, title: 'Step 1' }],
    })
  ).toBe(false);
  expect(
    isScenarioSessionPayload({
      trashedSteps: [{ id: 'step-2', deletedAt: 'now', kind: 'capture', originalIndex: 1 }],
    })
  ).toBe(false);
  expect(
    isScenarioSessionPayload({
      projects: [{ id: 'project-1', name: 'Project 1', createdAt: 1, updatedAt: 2, tags: [1] }],
    })
  ).toBe(false);
});

it('validates recorder surface, restore snapshots, and recent step metadata', () => {
  const surface = {
    screenshotMode: true,
    toolbarVisible: false,
    captureAction: 'scenario',
  };
  const payload = createValidSessionPayload();
  const recentStep = { ...payload.recentSteps[0], metadata: createStepMetadata() };

  expect(isScenarioRecorderSurfaceState(surface)).toBe(true);
  expect(isScenarioRecorderSurfaceState({ ...surface, captureAction: 'invalid' })).toBe(false);
  expect(
    isScenarioRestoreSnapshot({
      session: payload.session,
      surface,
      projectRevision: 4,
    })
  ).toBe(true);
  expect(
    isScenarioSessionPayload({
      ...payload,
      recentSteps: [recentStep],
      snapshot: { session: payload.session, surface, projectRevision: 4 },
      surface,
    })
  ).toBe(true);
  expect(
    isScenarioSessionPayload({
      ...payload,
      recentSteps: [
        { ...recentStep, metadata: { ...createStepMetadata(), sourceKind: 'keyboard' } },
      ],
    })
  ).toBe(false);
});
