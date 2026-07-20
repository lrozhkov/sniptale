import type {
  AiPickSourceAdapter,
  AiPickSourceResolver,
} from '../../../content/overlay/ai/pick/runtime/mode.types';
import type { ScenarioAutoClickCaptureTransport } from '../../../content/overlay/scenario/auto-click-capture/shared';
import type { ScenarioAutoClickListenerRegistry } from '../../../content/overlay/scenario/auto-click-capture/types';
import type { ScenarioCaptureSourceAdapter } from '../../../content/overlay/scenario/capture/source';
import type { ScreenshotCaptureAdapter } from '../../../content/overlay/screenshot/types';
import type { PopupSendResponse } from '../../../content/parser/popup-export/helpers';
import type { PageSnapshotSource } from '../../../content/parser/page-snapshot/source';
import type {
  ViewerPopupExportMessage,
  ViewerPreparationCommand,
} from '../../../workflows/page-preparation';
import type { FrameData } from '../../../features/highlighter/contracts';

export type PreparationAiPickSourceAdapter = AiPickSourceAdapter;
export type PreparationFrameSource = {
  getFrames: () => FrameData[];
};
export type PreparationPopupSendResponse = PopupSendResponse;
export type PreparationPageSnapshotSource = PageSnapshotSource;

export type PreparationPortConnector = (
  onCommand: (command: ViewerPreparationCommand) => void,
  onPopupExportRequest?: (
    request: ViewerPopupExportMessage,
    sendResponse: PreparationPopupSendResponse
  ) => void
) => () => void;

export interface PreparationHostPorts {
  acceptsElement: (element: HTMLElement) => boolean;
  connectPort: PreparationPortConnector;
  createCaptureAdapter: (frameSource: PreparationFrameSource) => ScreenshotCaptureAdapter;
  createScenarioCaptureSourceAdapter: () => ScenarioCaptureSourceAdapter;
  createScenarioAutoClickCaptureTransport: (
    captureAdapter: ScreenshotCaptureAdapter
  ) => ScenarioAutoClickCaptureTransport;
  createScenarioAutoClickListenerRegistry: () => ScenarioAutoClickListenerRegistry;
  resolveAiPickSource: AiPickSourceResolver;
  onPopupExportRequest: (
    request: ViewerPopupExportMessage,
    sendResponse: PreparationPopupSendResponse
  ) => void;
}

export interface PreparationSurfaceProps {
  onViewportChange?: (viewport: { width: number; height: number } | null) => void;
  ports: PreparationHostPorts;
}

export type { ScenarioAutoClickCaptureTransport, ScreenshotCaptureAdapter };
