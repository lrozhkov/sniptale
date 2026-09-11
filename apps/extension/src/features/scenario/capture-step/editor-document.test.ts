import { describe, expect, it } from 'vitest';
import {
  buildAutoScenarioCaptureOverlays,
  createScenarioCaptureEditorDocument,
} from './editor-document';

function createTargetDescriptor(
  rect: { height: number; width: number; x: number; y: number } | null,
  framePadding = { top: 0, left: 0, right: 0, bottom: 0 }
) {
  return {
    selector: '#submit',
    iframeSelector: null,
    tagName: 'button',
    role: 'button',
    text: 'Submit',
    ariaLabel: null,
    title: null,
    rect,
    framePadding,
  };
}

function verifiesFocusRectPriority() {
  const overlays = buildAutoScenarioCaptureOverlays({
    cursorPoint: { x: 18, y: 28 },
    interactionPoint: { x: 16, y: 24 },
    target: createTargetDescriptor(
      { x: 10, y: 20, width: 120, height: 40 },
      { top: 4, left: 6, right: 8, bottom: 10 }
    ),
  });

  expect(overlays.map((overlay) => overlay.kind)).toEqual(['focus-rect']);
  expect(overlays[0]).toEqual(
    expect.objectContaining({
      autoSource: 'capture-target',
      rect: { x: 4, y: 16, width: 134, height: 54 },
    })
  );
}

function verifiesClickRingFallback() {
  const overlays = buildAutoScenarioCaptureOverlays({
    cursorPoint: { x: 26, y: 36 },
    interactionPoint: { x: 25, y: 35 },
    target: createTargetDescriptor(null),
  });

  expect(overlays.map((overlay) => overlay.kind)).toEqual(['click-ring']);
  expect(overlays[0]).toEqual(
    expect.objectContaining({
      autoSource: 'capture-click',
      kind: 'click-ring',
      point: { x: 26, y: 36 },
    })
  );
}

it('preserves source dimensions and serializes editable capture annotations', () => {
  const document = createScenarioCaptureEditorDocument({
    dataUrl: 'data:image/png;base64,doc',
    sourceName: 'Capture',
    sourceHeight: 180,
    sourceWidth: 320,
    overlays: [
      {
        id: 'frame-1',
        kind: 'focus-rect',
        rect: { x: 10, y: 20, width: 120, height: 40 },
        autoSource: 'capture-target',
      },
    ],
  });
  expect(document).toEqual(
    expect.objectContaining({
      sourceName: 'Capture',
      sourceWidth: 320,
      sourceHeight: 180,
      canvasWidth: 320,
      canvasHeight: 180,
    })
  );
  expect(JSON.parse(document.canvasJson)).toEqual(
    expect.objectContaining({
      objects: expect.arrayContaining([
        expect.objectContaining({ sniptaleId: 'frame-1', sniptaleAutoSource: 'capture-target' }),
      ]),
    })
  );
});

describe('capture annotation defaults', () => {
  it('prefers target geometry over the pointer', verifiesFocusRectPriority);
  it('falls back to a click ring without target geometry', verifiesClickRingFallback);
  it('creates no annotation without geometry or pointer', () => {
    expect(
      buildAutoScenarioCaptureOverlays({ target: null, cursorPoint: null, interactionPoint: null })
    ).toEqual([]);
  });
});
