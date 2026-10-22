import type { ContentSizeTooltipDom } from '@sniptale/ui/content-size-tooltip/dom';
import type { RuntimeMessagingTransport } from '../../../platform/runtime-messaging';
import type { ShowRegionSelectorMessage } from '../../../contracts/video/types/messages';
import type { ViewportInfo } from '@sniptale/runtime-contracts/video/types/types';

export type RegionSelectorTooltipDom = ContentSizeTooltipDom & {
  dispose(): void;
  dismissMenu(): void;
};

type RegionSelectorRequestBinding = Pick<
  ShowRegionSelectorMessage,
  'regionSelectionCapabilityToken' | 'regionSelectionRequestGeneration' | 'regionSelectionRequestId'
>;

export type RegionSelectorBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type RegionSelectorState = {
  aspectRatioState: { maintainAspectRatio: boolean; aspectRatio: number | null };
  activeRequestBinding: RegionSelectorRequestBinding | null;
  currentRegion: RegionSelectorBounds;
  dragStart: { x: number; y: number };
  initialRegion: RegionSelectorBounds;
  isDragging: boolean;
  isResizing: boolean;
  keyDownHandler: ((event: KeyboardEvent) => void) | null;
  recordingOverlayContainer: HTMLDivElement | null;
  regionSelectorContainer: HTMLDivElement | null;
  regionSelectorTooltip: RegionSelectorTooltipDom | null;
  resizeCorner: string;
  selectedRegion: RegionSelectorBounds | null;
};

export type RegionSelectorControllerDeps = {
  appendToContentOverlayRoot?: <T extends Node>(node: T) => T;
  applyIsolatedContentRootStyle?: (element: HTMLElement, styleText: string) => void;
  sendRuntimeMessage?: RuntimeMessagingTransport['sendRuntimeMessage'];
  getViewportInfo?: () => ViewportInfo;
};

export type RegionSelectorController = {
  isRegionSelectorActive: (binding: RegionSelectorRequestBinding) => boolean;
  clearSelectedRegion: () => void;
  dispose: () => void;
  getSelectedRegion: () => RegionSelectorBounds | null;
  hideRecordingOverlay: () => void;
  hideRegionSelector: (requestId?: string) => void;
  showRecordingOverlay: (region: RegionSelectorBounds) => void;
  showRegionSelector: (binding: RegionSelectorRequestBinding) => void;
};

export function createDefaultRegionSelectorState(): RegionSelectorState {
  return {
    aspectRatioState: { maintainAspectRatio: false, aspectRatio: null },
    activeRequestBinding: null,
    currentRegion: { x: 100, y: 100, width: 640, height: 480 },
    dragStart: { x: 0, y: 0 },
    initialRegion: { x: 0, y: 0, width: 0, height: 0 },
    isDragging: false,
    isResizing: false,
    keyDownHandler: null,
    recordingOverlayContainer: null,
    regionSelectorContainer: null,
    regionSelectorTooltip: null,
    resizeCorner: '',
    selectedRegion: null,
  };
}
