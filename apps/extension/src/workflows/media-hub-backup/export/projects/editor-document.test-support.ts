import type { PersistedEditorDocumentV3 } from '../../../../composition/persistence/document-assets';

export function createEditorDocument(): PersistedEditorDocumentV3 {
  return {
    canvasHeight: 1,
    canvasJson: '{"version":"7.2.0","objects":[]}',
    canvasWidth: 1,
    frame: {
      backgroundBlurAmount: 0,
      backgroundColor: '#fff',
      backgroundGradientAngle: 90,
      backgroundGradientFrom: '#fff',
      backgroundGradientTo: '#000',
      backgroundImage: null,
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
    sourceImage: { assetId: 'editor-source-1' },
    sourceLeft: 0,
    sourceName: null,
    sourceTop: 0,
    sourceWidth: 1,
    assets: [{ assetId: 'editor-source-1', role: 'source-image' }],
    version: 3,
  };
}
