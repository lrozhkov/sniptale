import { describe, expect, it } from 'vitest';
import { createDefaultRichShapeObject } from '../../../features/editor/document/rich-shape';
import type { EditorDocument } from '../../../features/editor/document/types';
import { prepareAppliedDocument } from './';

function createDocument(richShapes: NonNullable<EditorDocument['richShapes']>): EditorDocument {
  return {
    version: 1,
    sourceImageData: 'data:image/png;base64,abc',
    sourceName: null,
    sourceWidth: 500,
    sourceHeight: 300,
    canvasWidth: 1400,
    canvasHeight: 900,
    sourceLeft: 30,
    sourceTop: 20,
    sourceDisplayWidth: 500,
    sourceDisplayHeight: 300,
    frame: {
      browserMode: false,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      backgroundMode: 'color',
      backgroundColor: '#fff',
      backgroundGradientFrom: '#fff',
      backgroundGradientTo: '#000',
      backgroundGradientAngle: 0,
      backgroundImageData: null,
      backgroundImageFit: 'cover',
      layoutMode: 'fit-image',
      browserTitle: '',
      browserUrl: '',
    },
    canvasJson: '{}',
    richShapes,
  };
}

function createRichShapeWithoutSource() {
  const shape = createDefaultRichShapeObject({
    id: 'future-shape',
    shapeFamily: 'custom',
    shapeKind: 'future-kind',
  });
  const { source: _source, ...shapeWithoutSource } = shape;

  return shapeWithoutSource;
}

describe('editor document rich shape read path', () => {
  it('normalizes additive rich shape state without Fabric-specific ownership', () => {
    const prepared = prepareAppliedDocument(createDocument([createRichShapeWithoutSource()]));

    expect(prepared.normalizedDocument.richShapes).toEqual([
      expect.objectContaining({
        id: 'future-shape',
        objectType: 'rich-shape',
        shapeFamily: 'custom',
        shapeKind: 'future-kind',
        source: expect.objectContaining({ type: 'built-in' }),
      }),
    ]);
  });
});
