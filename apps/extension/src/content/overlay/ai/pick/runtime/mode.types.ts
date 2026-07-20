import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import type { AiPickDomState } from './dom-state';
import type { AiPickOverlayController } from './overlay';
import type {
  deactivateOtherContentModes,
  setContentModeEnabled,
} from '../../../../application/mode-session';
import type { parsePageSnapshotAfterIframePreflight } from '../../../../parser/dom-tree-parser/snapshot';
import type { AiPickEnableOptions, AiPickSourceAdapter } from './source.types';

export type AiPickSelectionCallback = (tree: ParsedDOMTree, selectedIds: Set<string>) => void;

type AiPickPointerHandler = (event: MouseEvent, iframe?: HTMLIFrameElement) => void;

export type AiPickListenerHandlers = {
  handleClick: AiPickPointerHandler;
  handleKeyDown: (event: KeyboardEvent) => void;
  handleMouseLeave: () => void;
  handleMouseMove: AiPickPointerHandler;
  handlePointerDown: AiPickPointerHandler;
};

export type {
  AiPickEnableOptions,
  AiPickSourceAdapter,
  AiPickSourceResolver,
} from './source.types';

export interface AiPickModeControllerDeps {
  deactivateOtherModes?: typeof deactivateOtherContentModes;
  overlayController: Pick<
    AiPickOverlayController,
    | 'createHoverOverlay'
    | 'createOverlayContainer'
    | 'hideHoverOverlay'
    | 'removeOverlayContainer'
    | 'showHoverOverlay'
  >;
  parseDomTree?: typeof parsePageSnapshotAfterIframePreflight;
  setContentModeEnabled?: typeof setContentModeEnabled;
}

export type AiPickModeState = {
  domState: AiPickDomState;
  enableSequence: number;
  isEnabled: boolean;
  onContentSelect: AiPickSelectionCallback | null;
  parsedTree: ParsedDOMTree | null;
  pendingEnable: Promise<void> | null;
  source: AiPickSourceAdapter | null;
};

export interface AiPickModeController {
  disable: () => void;
  enable: (
    onContentSelect: AiPickSelectionCallback,
    options?: AiPickEnableOptions
  ) => Promise<void>;
  isEnabled: () => boolean;
  refreshSnapshot: () => Promise<void>;
}
