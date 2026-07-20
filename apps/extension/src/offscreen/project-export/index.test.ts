import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  cancelProjectExportMock,
  getProjectExportCapabilitiesMock,
  reconcileProjectExportJobsMock,
  startProjectExportMock,
} = vi.hoisted(() => ({
  cancelProjectExportMock: vi.fn(),
  getProjectExportCapabilitiesMock: vi.fn(),
  reconcileProjectExportJobsMock: vi.fn(),
  startProjectExportMock: vi.fn(),
}));

vi.mock('./service', () => ({
  createProjectExportService: () => ({
    cancelProjectExport: cancelProjectExportMock,
    reconcileProjectExportJobs: reconcileProjectExportJobsMock,
    startProjectExport: startProjectExportMock,
  }),
}));

vi.mock('./capabilities', () => ({
  getProjectExportCapabilities: getProjectExportCapabilitiesMock,
}));

import {
  cancelProjectExport,
  getProjectExportCapabilities,
  reconcileProjectExportJobs,
  startProjectExport,
} from './index';

describe('project-export-root-facade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startProjectExportMock.mockResolvedValue(undefined);
    cancelProjectExportMock.mockResolvedValue(undefined);
    reconcileProjectExportJobsMock.mockResolvedValue(undefined);
    getProjectExportCapabilitiesMock.mockResolvedValue({
      formats: [{ format: 'mp4', available: true }],
      mp4Codecs: [{ codec: 'AVC', available: true }],
      defaultMp4VideoCodec: 'AVC',
    });
  });

  it('delegates project export commands through the lazy service owner', async () => {
    const project = { id: 'project-1' } as never;
    const settings = { format: 'webm' } as never;

    await startProjectExport('job-1', project, settings);
    await cancelProjectExport('job-1');
    await getProjectExportCapabilities(settings);
    await reconcileProjectExportJobs();

    expect(startProjectExportMock).toHaveBeenCalledWith('job-1', project, settings);
    expect(cancelProjectExportMock).toHaveBeenCalledWith('job-1');
    expect(getProjectExportCapabilitiesMock).toHaveBeenCalledWith(settings);
    expect(reconcileProjectExportJobsMock).toHaveBeenCalledOnce();
  });
});
