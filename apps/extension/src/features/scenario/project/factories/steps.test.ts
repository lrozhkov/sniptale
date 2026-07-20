import { beforeEach, expect, it, vi } from 'vitest';

import {
  createScenarioCaptureStep,
  createScenarioDividerStep,
  createScenarioNoteStep,
  createScenarioSectionStep,
} from './steps/index';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(500);
  vi.spyOn(crypto, 'randomUUID').mockImplementation(
    (() => {
      let index = 0;
      return () => `00000000-0000-4000-8000-${String(++index).padStart(12, '0')}`;
    })()
  );
});

it('creates capture and text steps with the expected canonical defaults', () => {
  expect(createScenarioCaptureStep({ assetId: 'asset-1' })).toEqual(
    expect.objectContaining({
      id: '00000000-0000-4000-8000-000000000001',
      kind: 'capture',
      assetId: 'asset-1',
      captureSurface: 'visible',
      sourceKind: 'manual',
      overlays: [],
      imageTransform: { scale: 1, x: 0, y: 0 },
      viewportTransform: { x: 0, y: 0, width: 720, height: 420 },
    })
  );

  expect(createScenarioSectionStep({ title: 'Section' })).toEqual(
    expect.objectContaining({
      kind: 'section',
      title: 'Section',
      body: '',
    })
  );

  expect(createScenarioNoteStep({ title: 'Note', tone: 'warning' })).toEqual(
    expect.objectContaining({
      kind: 'note',
      title: 'Note',
      tone: 'warning',
    })
  );

  expect(createScenarioDividerStep()).toEqual(
    expect.objectContaining({
      kind: 'divider',
      title: '',
      body: '',
    })
  );
});
