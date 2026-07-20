import { expect, it, vi } from 'vitest';

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { cancelProjectExportUseCase, startProjectExportUseCase } from './use-case';
import { getProjectExportCapabilitiesUseCase } from './capabilities';
import {
  createProjectExportInputReference,
  createProjectExportPorts,
  createProjectExportSettings,
  PROJECT_EXPORT_OWNER,
} from './use-case.test-support';

it('does not reconcile capabilities through offscreen while a start handoff is pending', async () => {
  const ports = createProjectExportPorts();
  const sendRuntimeMessage = vi.mocked(ports.sendRuntimeMessage);
  let acceptStart!: () => void;
  const startAccepted = new Promise<void>((resolve) => {
    acceptStart = resolve;
  });
  sendRuntimeMessage.mockImplementation(async (message) => {
    if (message.type === VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT) {
      await startAccepted;
    }
    return { success: true };
  });

  const start = startProjectExportUseCase(
    {
      input: createProjectExportInputReference('job-starting'),
      jobId: 'job-starting',
      settings: createProjectExportSettings(),
    },
    PROJECT_EXPORT_OWNER,
    ports
  );
  await vi.waitFor(() => {
    expect(sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT })
    );
  });

  const capability = getProjectExportCapabilitiesUseCase(
    { jobId: 'job-next', settings: createProjectExportSettings() },
    PROJECT_EXPORT_OWNER,
    ports
  );
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
  }
  expect(sendRuntimeMessage).toHaveBeenCalledTimes(1);

  acceptStart();
  await expect(start).resolves.toMatchObject({ success: true });
  await expect(capability).resolves.toMatchObject({ success: true });
});

it('does not cancel through offscreen before the pending start handoff is accepted', async () => {
  const ports = createProjectExportPorts();
  const sendRuntimeMessage = vi.mocked(ports.sendRuntimeMessage);
  let acceptStart!: () => void;
  const startAccepted = new Promise<void>((resolve) => {
    acceptStart = resolve;
  });
  sendRuntimeMessage.mockImplementation(async (message) => {
    if (message.type === VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT) {
      await startAccepted;
    }
    return { success: true };
  });

  const start = startProjectExportUseCase(
    {
      input: createProjectExportInputReference('job-cancel-pending'),
      jobId: 'job-cancel-pending',
      settings: createProjectExportSettings(),
    },
    PROJECT_EXPORT_OWNER,
    ports
  );
  await vi.waitFor(() => {
    expect(sendRuntimeMessage).toHaveBeenCalledTimes(1);
  });

  const cancel = cancelProjectExportUseCase({ jobId: 'job-cancel-pending' }, ports);
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
  }
  expect(ports.requestProjectExportJobCancel).not.toHaveBeenCalled();

  acceptStart();
  await expect(start).resolves.toMatchObject({ success: true });
  await expect(cancel).resolves.toMatchObject({ result: 'accepted', success: true });
  expect(ports.requestProjectExportJobCancel).toHaveBeenCalledWith('job-cancel-pending');
});
