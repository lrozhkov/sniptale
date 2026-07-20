import type { EditorDocument } from '../../../../features/editor/document/types';

export function createMockDocument() {
  return {
    version: 1 as const,
    sourceImageData: 'data:image/png;base64,abc',
    sourceName: 'source.png',
    sourceWidth: 10,
    sourceHeight: 20,
    canvasWidth: 10,
    canvasHeight: 20,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: 10,
    sourceDisplayHeight: 20,
    frame: {
      browserMode: false,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      backgroundMode: 'color' as const,
      backgroundColor: '#fff',
      backgroundGradientFrom: '#fff',
      backgroundGradientTo: '#000',
      backgroundGradientAngle: 0,
      backgroundImageData: null,
      backgroundImageFit: 'cover' as const,
      layoutMode: 'expand-canvas' as const,
      browserTitle: '',
      browserUrl: '',
    },
    canvasJson: '{}',
  } satisfies EditorDocument;
}
