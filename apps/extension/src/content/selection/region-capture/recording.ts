import { REGION_CAPTURE_FILENAME_PREFIX } from '@sniptale/ui/branding';
import { createLogger } from '@sniptale/platform/observability/logger';
import { createContentRecordingSaveArtifacts } from '../recording-download/workflow';

const logger = createLogger({ namespace: 'ContentRegionCaptureRecording' });

const artifacts = createContentRecordingSaveArtifacts({
  filenamePrefix: REGION_CAPTURE_FILENAME_PREFIX,
  logger,
  loggerOptions: {
    chunkCountMessage: 'Chunks',
    cleanupMessage: 'Memory cleaned',
    method: 'log',
    preparedPayloadMessage: 'Prepared recording download payload',
  },
  stopMessageFailure: 'Failed to broadcast region-capture stop notification',
});

export const buildRegionCaptureFilename = artifacts.buildFilename;

/**
 * Persists Region Capture chunks through the background download/runtime transport seam.
 */
export const saveRegionCaptureRecording = artifacts.saveRecording;
