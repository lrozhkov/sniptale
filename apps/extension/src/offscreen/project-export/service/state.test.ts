import { describe, expect, it } from 'vitest';

import { vi } from 'vitest';

// State-machine proof: duplicate/replay registration is rejected while a job is active.
vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import {
  createExportJobState,
  createProjectExportServiceState,
  releaseProjectExportJobRegistration,
  registerProjectExportJob,
} from './state';

describe('project-export state helpers', () => {
  it('creates a fresh service state container', () => {
    const state = createProjectExportServiceState();

    expect(state.activeJobs.size).toBe(0);
    expect(state.activeJobId).toBeNull();
  });

  it('creates default job state and serializes registrations', () => {
    const state = createProjectExportServiceState();
    const jobState = registerProjectExportJob(state, 'job-1');
    const created = createExportJobState('job-2');

    expect(jobState?.jobId).toBe('job-1');
    expect(jobState?.cancelled).toBe(false);
    expect(created).toMatchObject({
      assetUrls: [],
      cancelled: false,
      cleanupNode: null,
      exportAbortController: null,
      exportAudioSettings: null,
      exportStream: null,
      jobId: 'job-2',
    });

    expect(registerProjectExportJob(state, 'job-1')).toBeNull();
    expect(() => registerProjectExportJob(state, 'job-2')).toThrow(
      'offscreenExport.alreadyRunning'
    );

    releaseProjectExportJobRegistration(state, 'job-1');
    expect(registerProjectExportJob(state, 'job-2')?.jobId).toBe('job-2');
  });
});
