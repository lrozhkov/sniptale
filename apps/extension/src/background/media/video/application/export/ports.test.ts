import { beforeEach, expect, it, vi } from 'vitest';

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

const mocks = vi.hoisted(() => ({
  attachCapability: vi.fn((message: Record<string, unknown>) => ({
    ...message,
    capabilityToken: 'capability-token',
  })),
}));

vi.mock('@sniptale/platform/security/offscreen-command-capability', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@sniptale/platform/security/offscreen-command-capability')
  >()),
  attachOffscreenCommandCapability: mocks.attachCapability,
}));

import { attachProjectExportOffscreenCommandCapability } from './ports';

beforeEach(() => {
  mocks.attachCapability.mockClear();
});

it('attaches ordinary offscreen capabilities', async () => {
  await expect(
    attachProjectExportOffscreenCommandCapability({ type: 'ordinary-command', value: 1 })
  ).resolves.toEqual({
    capabilityToken: 'capability-token',
    type: 'ordinary-command',
    value: 1,
  });
});

it('attaches a bounded project export input reference without embedding project bytes', async () => {
  await expect(
    attachProjectExportOffscreenCommandCapability({
      input: {
        contentSha256: `sha256:${'a'.repeat(64)}`,
        jobId: 'job-1',
        projectId: 'project-1',
        retainedByteLength: 3_000_000,
      },
      type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
    })
  ).resolves.toEqual(expect.objectContaining({ capabilityToken: 'capability-token' }));
  expect(mocks.attachCapability).toHaveBeenCalledWith(
    expect.objectContaining({ input: expect.objectContaining({ retainedByteLength: 3_000_000 }) })
  );
});
