import { expect, it } from 'vitest';
import { createCanvasInsertIntent, isCanvasPointInsertIntent } from './insert-intents';

it('keeps canvas insert intent semantics independent from editor-specific targets', () => {
  const scenarioTextIntent = createCanvasInsertIntent({
    kind: 'text',
    placement: 'canvas-point',
    target: 'scenario-text',
  });
  const videoImportIntent = createCanvasInsertIntent({
    kind: 'video',
    placement: 'file',
    target: 'video-track-import',
  });

  expect(isCanvasPointInsertIntent(scenarioTextIntent)).toBe(true);
  expect(isCanvasPointInsertIntent(videoImportIntent)).toBe(false);
});
