import { expect, it, vi } from 'vitest';

import { parseScenarioProject } from './guards/project/root/parse';

function createPersistedSteps() {
  return [
    createPersistedCaptureStep(),
    createPersistedNoteStep(),
    createPersistedSectionStep(),
    createPersistedDividerStep(),
    createPersistedBrokenCaptureStep(),
  ];
}

function createPersistedCaptureStep() {
  return {
    id: 'capture-1',
    kind: 'capture',
    assetId: 'asset-1',
    caption: 'Legacy caption',
    createdAt: 11,
    updatedAt: 12,
    captureSurface: 'visible',
    sourceKind: 'auto-click',
    page: {
      title: 'Page',
      url: 'https://example.com',
      viewport: { x: 0, y: 0, width: 1280, height: 720 },
      scrollX: 0,
      scrollY: 90,
      devicePixelRatio: 1,
    },
    captureMetadata: {
      pointerRange: {
        start: { x: 10, y: 12 },
        end: { x: 18, y: 24 },
        minX: 10,
        minY: 12,
        maxX: 18,
        maxY: 24,
        distance: 14,
        durationMs: 160,
      },
      scroll: {
        startX: 0,
        startY: 0,
        endX: 0,
        endY: 120,
        deltaX: 0,
        deltaY: 120,
      },
      trigger: 'pointer-up',
    },
  };
}

function createPersistedNoteStep() {
  return {
    id: 'note-1',
    kind: 'note',
    title: 'Heads up',
    subtitle: 'Legacy subtitle',
    createdAt: 13,
    updatedAt: 14,
    tone: 'unknown',
  };
}

function createPersistedSectionStep() {
  return {
    id: 'section-1',
    kind: 'section',
    title: 'Section',
    body: 'Caption',
    createdAt: 15,
    updatedAt: 16,
  };
}

function createPersistedDividerStep() {
  return {
    id: 'divider-1',
    kind: 'divider',
    createdAt: 17,
    updatedAt: 18,
  };
}

function createPersistedBrokenCaptureStep() {
  return {
    id: 'broken-capture',
    kind: 'capture',
    createdAt: 19,
    updatedAt: 20,
  };
}

function createPersistedTrash() {
  return [
    {
      deletedAt: 30,
      originalIndex: 1,
      step: {
        id: 'trashed-note',
        kind: 'note',
        title: 'Deleted',
        body: 'Can be restored',
        createdAt: 21,
        updatedAt: 22,
        tone: 'warning',
      },
    },
    {
      deletedAt: 'now',
      originalIndex: 2,
      step: {
        id: 'invalid-trash',
        kind: 'divider',
      },
    },
  ];
}

function createPersistedSuggestedEvents() {
  return [
    {
      id: 'event-1',
      kind: 'click',
      message: 'Clicked CTA',
      createdAt: 40,
      status: 'unknown',
      sourceStepId: 'capture-1',
      target: null,
      data: { ctrl: true, attempts: 2 },
    },
    {
      id: 'event-2',
      kind: 'invalid',
      message: 'Ignore',
      createdAt: 41,
      status: 'pending',
    },
  ];
}

function createPersistedProjectRecord() {
  return {
    id: 'project-1',
    name: 'Recorded flow',
    createdAt: 10,
    updatedAt: 20,
    steps: createPersistedSteps(),
    trash: createPersistedTrash(),
    suggestedEvents: createPersistedSuggestedEvents(),
  };
}

it('parses persisted projects with capture metadata and legacy step fields', () => {
  vi.spyOn(Date, 'now').mockReturnValue(500);

  const project = parseScenarioProject(createPersistedProjectRecord());

  expect(project).toEqual(
    expect.objectContaining({
      id: 'project-1',
      steps: expect.arrayContaining([
        expect.objectContaining({
          id: 'capture-1',
          body: 'Legacy caption',
          captureMetadata: expect.objectContaining({
            trigger: 'pointer-up',
          }),
        }),
        expect.objectContaining({
          id: 'note-1',
          tone: 'neutral',
          body: 'Legacy subtitle',
        }),
      ]),
    })
  );
});

it('parses trash and filters invalid suggested events', () => {
  const project = parseScenarioProject(createPersistedProjectRecord());

  expect(project).toEqual(
    expect.objectContaining({
      trash: [
        expect.objectContaining({
          deletedAt: 30,
          originalIndex: 1,
          step: expect.objectContaining({ id: 'trashed-note' }),
        }),
      ],
      suggestedEvents: [
        expect.objectContaining({
          id: 'event-1',
          status: 'pending',
          data: { ctrl: true, attempts: 2 },
        }),
      ],
    })
  );
});

it('rejects invalid project roots and keeps trash optional for legacy projects', () => {
  expect(parseScenarioProject(null)).toBeNull();
  expect(
    parseScenarioProject({
      id: 'project-1',
      name: 'Broken',
      createdAt: 1,
      updatedAt: 2,
      steps: [],
      trash: 'invalid',
      suggestedEvents: [],
    })
  ).toBeNull();
  expect(
    parseScenarioProject({
      id: 'project-2',
      name: 'Legacy',
      createdAt: 1,
      updatedAt: 2,
      steps: [],
      suggestedEvents: [],
    })
  ).toEqual(
    expect.objectContaining({
      id: 'project-2',
      trash: [],
      steps: [],
    })
  );
});
