import { expect, it } from 'vitest';
import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';

it.each([2, 3])('classifies retired project version %i without admitting its body', (version) => {
  expect(parseGuideProject({ version, id: 'retired', steps: [], slides: [] })).toEqual({
    status: 'unsupported',
    version,
  });
});
