import { describe, expect, it } from 'vitest';
import { getLifecycleMocks } from './lifecycle.test-support';
import { getRichShapeMocks } from './rich-shape.test-support';
import { getSceneMocks } from './scene.test-support';
import { getSelectionMocks } from './selection.test-support';

describe('controller instance delegation test support owners', () => {
  it('keeps lifecycle and scene mock ownership separated', () => {
    const lifecycleMocks = getLifecycleMocks();
    const sceneMocks = getSceneMocks();

    expect(lifecycleMocks.openImageForController).toBeTypeOf('function');
    expect(lifecycleMocks.mountEditorController).toBeTypeOf('function');
    expect(sceneMocks.applyBrowserFrameForController).toBeTypeOf('function');
    expect(sceneMocks.applyCropSelectionForController).toBeTypeOf('function');
  });

  it('keeps selection and rich shape public api mock ownership separated', () => {
    const richShapeMocks = getRichShapeMocks();
    const selectionMocks = getSelectionMocks();

    expect(selectionMocks.applyLayerEffectForController).toBeTypeOf('function');
    expect(selectionMocks.insertTechnicalDataForController).toBeTypeOf('function');
    expect(richShapeMocks.insertEditorControllerRichShape).toBeTypeOf('function');
  });
});
