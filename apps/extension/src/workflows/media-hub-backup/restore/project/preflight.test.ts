import JSZip from 'jszip';
import { expect, it, vi } from 'vitest';

import { assertPreparedProjectBlobsAvailable } from './preflight';
import { createMissingProjectBlobZip, createPreparedDomains } from '../projects/test-support';

it('materializes every project blob exactly once before the write transaction', async () => {
  const zip = new JSZip();
  const paths = [
    'export-thumb',
    'project-asset',
    'recording',
    'scenario-asset',
    'scenario-export-thumb',
    'scenario-thumb',
    'video-thumb',
  ];
  for (const path of paths) {
    zip.file(path, path);
  }
  const asyncSpies = paths.map((path) => vi.spyOn(zip.file(path)!, 'async'));
  const fileSpy = vi.spyOn(zip, 'file');

  await expect(
    assertPreparedProjectBlobsAvailable(createPreparedDomains(), zip)
  ).resolves.toBeUndefined();

  expect(fileSpy).toHaveBeenCalledWith('scenario-asset');
  expect(fileSpy).toHaveBeenCalledWith('recording');
  const asyncCallsByPath = Object.fromEntries(
    paths.map((path, index) => [path, asyncSpies[index]!.mock.calls.length])
  );
  expect(asyncCallsByPath).toMatchObject({
    'export-thumb': 1,
    'project-asset': 1,
    recording: 1,
    'scenario-asset': 1,
    'scenario-export-thumb': 1,
    'scenario-thumb': 1,
    'video-thumb': 1,
  });
});

it('fails when a prepared project blob entry is missing', async () => {
  await expect(
    assertPreparedProjectBlobsAvailable(createPreparedDomains(), createMissingProjectBlobZip())
  ).rejects.toThrow('project-asset');
});
