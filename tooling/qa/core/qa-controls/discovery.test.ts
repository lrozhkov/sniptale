import { expect, it } from 'vitest';

import { isPolicyConsumerEvidenceFile } from './discovery.mjs';

it('does not treat generated inventories as executable policy consumers', () => {
  expect(isPolicyConsumerEvidenceFile('tooling/configs/qa/control-dispositions.data.json')).toBe(
    false
  );
  expect(isPolicyConsumerEvidenceFile('tooling/configs/qa/oss-release-consumers.data.json')).toBe(
    false
  );
  expect(isPolicyConsumerEvidenceFile('tooling/configs/qa/technical-debt.data.json')).toBe(false);
  expect(isPolicyConsumerEvidenceFile('tooling/configs/qa/validation-manifest.json')).toBe(true);
  expect(isPolicyConsumerEvidenceFile('tooling/qa/core/verify-focused.mjs')).toBe(true);
});
