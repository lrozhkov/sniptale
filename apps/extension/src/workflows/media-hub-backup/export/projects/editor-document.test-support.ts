import { type EditorDocument } from '../../../../features/editor/document/types';

export function createEditorDocument(): EditorDocument {
  return {
    canvasHeight: 1,
    canvasJson: '{"version":"7.2.0","objects":[]}',
    canvasWidth: 1,
    frame: {
      backgroundColor: '#fff',
      backgroundGradientAngle: 90,
      backgroundGradientFrom: '#fff',
      backgroundGradientTo: '#000',
      backgroundImageData: null,
      backgroundImageFit: 'cover',
      backgroundMode: 'color',
      browserMode: false,
      browserTitle: '',
      browserUrl: '',
      layoutMode: 'fit-image',
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,
      paddingTop: 0,
    },
    sourceDisplayHeight: 1,
    sourceDisplayWidth: 1,
    sourceHeight: 1,
    sourceImageData: 'data:image/png;base64,source',
    sourceLeft: 0,
    sourceName: null,
    sourceTop: 0,
    sourceWidth: 1,
    version: 1,
  };
}
