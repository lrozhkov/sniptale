import { startDiagnostics } from '../../../diagnostics/public/session';
import { videoManagerSession } from './session';
import {
  CaptureMode,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { supportsAnnotations } from '../capture-source';
import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'BackgroundVideoManagerDiagnostics' });

interface AttemptDiagnosticsParams {
  captureMode: CaptureMode;
  settings: VideoRecordingSettings;
  viewport?: {
    width: number;
    height: number;
  };
  tabId?: number;
}

export async function attemptDiagnosticsStart(params: AttemptDiagnosticsParams): Promise<void> {
  const { captureMode, settings, viewport, tabId } = params;
  const diagnosticsAllowed = captureMode === CaptureMode.VIEWPORT_EMULATION;
  if (
    !settings.diagnosticsEnabled ||
    !diagnosticsAllowed ||
    !viewport ||
    typeof tabId !== 'number' ||
    !supportsAnnotations(captureMode)
  ) {
    if (settings.diagnosticsEnabled && !diagnosticsAllowed) {
      logger.log('Diagnostics skipped outside VIEWPORT_EMULATION to avoid CDP debugger banner');
    }
    return;
  }

  try {
    logger.log('Starting diagnostics collection');
    await startDiagnostics(videoManagerSession.currentRecordingId!, tabId, {
      width: viewport.width,
      height: viewport.height,
    });
    logger.log('Diagnostics started');
  } catch (error) {
    logger.error('Failed to start diagnostics (continuing without it)', error);
  }
}
