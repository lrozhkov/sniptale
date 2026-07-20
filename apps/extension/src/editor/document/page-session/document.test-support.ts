import type { EditorDocument } from '../../../features/editor/document/types';

export function createEditorDocumentFixture(): EditorDocument {
  return {
    version: 1,
    sourceImageData: 'data:image/png;base64,source',
    sourceName: 'capture.png',
    sourceWidth: 100,
    sourceHeight: 80,
    canvasWidth: 100,
    canvasHeight: 80,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: 100,
    sourceDisplayHeight: 80,
    frame: {
      browserMode: false,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      backgroundMode: 'color',
      backgroundColor: '#ffffff',
      backgroundGradientFrom: '#ffffff',
      backgroundGradientTo: '#000000',
      backgroundGradientAngle: 90,
      backgroundImageData: null,
      backgroundImageFit: 'cover',
      layoutMode: 'fit-image',
      browserTitle: '',
      browserUrl: '',
    },
    canvasJson: '{"objects":[]}',
  };
}
