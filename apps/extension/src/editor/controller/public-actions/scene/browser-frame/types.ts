import type { Canvas, FabricObject } from 'fabric';
import type { BrowserFrameState } from '../../../../../features/editor/document/types';

import type { SourceState } from '../../../../document/model/source-state';
import type { EditorSceneStoreBridge, RelayoutOptions } from '../helpers';

export type BrowserFrameActionOptions = {
  canvas: Canvas | null;
  canvasDocumentSize: { width: number; height: number };
  source: SourceState | null;
  store: Pick<EditorSceneStoreBridge, 'getBrowserFrame' | 'getFrame' | 'setBrowserFrame'>;
  relayoutScene: (browserFrame: BrowserFrameState, relayoutOptions?: RelayoutOptions) => void;
  prepareObject?: (object: FabricObject) => void;
  nextLabelIndex?: (type: 'browser-frame') => number;
  ensureBrowserFrameOnTop: () => void;
  commitHistory: () => void;
  syncRuntimeState: () => void;
};
