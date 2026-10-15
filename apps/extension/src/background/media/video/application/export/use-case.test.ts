import * as projectFollow from '../../../../../features/video/composition/motion/project-follow';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { cancelProjectExportUseCase, startProjectExportUseCase } from './use-case';
import { reserveMediaErasureExclusion } from '../../../../mutation-exclusion/media-activity';
import { createVideoProjectFromRecording } from '../../../../../features/video/project/factories/creation';
import { createVideoProjectMotionRegion } from '../../../../../features/video/project/motion';
import { normalizeVideoProjectCursorSkin } from '../../../../../features/video/project/cursor';
import {
  VideoCursorCaptureMode,
  VideoMotionFocusMode,
} from '../../../../../features/video/project/types';
import { ProjectCameraConflictError } from '../../../../../features/video/composition/motion/project-follow';
import {
  createProjectExportInputReference as createInputReference,
  createProjectExportPorts as createPorts,
  createProjectExportSettings as createSettings,
  PROJECT_EXPORT_OWNER as owner,
} from './use-case.test-support';

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  vi.clearAllMocks();
});

it('refuses a conflicting camera before offscreen, capabilities, or ledger writes', async () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'camera',
    filename: 'camera.webm',
    width: 1280,
    height: 720,
    duration: 3,
    mimeType: 'video/webm',
    size: 10,
    cursorTrack: {
      captureMode: VideoCursorCaptureMode.EMBEDDED_FALLBACK,
      skin: normalizeVideoProjectCursorSkin(undefined),
      samples: [0, 3].map((time) => ({
        id: `point-${time}`,
        time,
        x: 730,
        y: 360,
        visible: true,
        recordingPoint: { x: 0.57, y: 0.5 },
        captureSegment: 0,
      })),
    },
  });
  const region = {
    ...createVideoProjectMotionRegion(project, 0),
    duration: 3,
    focusMode: VideoMotionFocusMode.CURSOR,
    scale: 4,
    zoomInDuration: 0.01,
    zoomOutDuration: 0,
  };
  project.motionRegions = [region];
  vi.spyOn(projectFollow, 'resolveProjectCameraConflicts').mockReturnValueOnce([
    { regionId: region.id, interval: { start: 0, end: 3 }, time: 0, reason: 'dynamics' },
  ]);
  const before = structuredClone(project);
  const ports = createPorts();
  vi.mocked(ports.loadProjectExportInput).mockResolvedValue(project);
  const result = await startProjectExportUseCase(
    { input: createInputReference(), jobId: 'job-1', settings: createSettings() },
    owner,
    ports
  ).catch((error: unknown) => error);
  expect(result).toBeInstanceOf(ProjectCameraConflictError);
  expect(result).toMatchObject({
    conflicts: [{ regionId: region.id, reason: 'dynamics', interval: { start: 0, end: 3 } }],
  });
  expect(ports.ensureOffscreenDocument).not.toHaveBeenCalled();
  expect(ports.issueProjectExportCancelCapability).not.toHaveBeenCalled();
  expect(ports.reserveProjectExportJobLedgerEntry).not.toHaveBeenCalled();
  expect(ports.sendRuntimeMessage).not.toHaveBeenCalled();
  expect(ports.deleteProjectExportInput).toHaveBeenCalledWith('job-1');
  expect(project).toEqual(before);
});

it('reserves the ledger and sends an offscreen start command', async () => {
  const ports = createPorts();
  const settings = createSettings();

  await expect(
    startProjectExportUseCase(
      { input: createInputReference(), jobId: 'job-1', settings },
      owner,
      ports
    )
  ).resolves.toEqual({
    success: true,
    capabilityToken: 'cancel-token',
    jobId: 'job-1',
    ownerDocumentId: 'document-1',
  });

  expect(ports.reserveProjectExportJobLedgerEntry).toHaveBeenCalledWith({
    jobId: 'job-1',
    ownerDocumentId: 'document-1',
    ownerSenderUrl: owner.senderUrl,
    projectId: 'project-1',
  });
  expect(ports.sendRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
      capabilityToken: 'offscreen',
      input: createInputReference(),
      jobId: 'job-1',
      settings,
    })
  );
});

it('rejects export start before side effects while local data erasure owns media lifecycle', async () => {
  const ports = createPorts();
  let releaseErasure!: () => void;
  const erasureGate = new Promise<void>((resolve) => {
    releaseErasure = resolve;
  });
  const exclusion = reserveMediaErasureExclusion();
  const erasure = erasureGate.finally(() => exclusion.release());

  await expect(
    startProjectExportUseCase(
      {
        input: createInputReference('job-blocked'),
        jobId: 'job-blocked',
        settings: createSettings(),
      },
      owner,
      ports
    )
  ).rejects.toThrow('Local data erasure is in progress');
  expect(ports.ensureOffscreenDocument).not.toHaveBeenCalled();
  expect(ports.reserveProjectExportJobLedgerEntry).not.toHaveBeenCalled();
  expect(ports.sendRuntimeMessage).not.toHaveBeenCalled();

  releaseErasure();
  await erasure;
});

it('requests cancellation and rejects failed offscreen cancel acknowledgements', async () => {
  const ports = createPorts();
  vi.mocked(ports.sendRuntimeMessage).mockResolvedValueOnce({
    error: 'cancel rejected',
    success: false,
  });

  await expect(cancelProjectExportUseCase({ jobId: 'job-4' }, ports)).rejects.toThrow(
    'cancel rejected'
  );

  expect(ports.requestProjectExportJobCancel).toHaveBeenCalledWith('job-4');
  expect(ports.sendRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT,
      jobId: 'job-4',
    })
  );
});
