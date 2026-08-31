import { expect, it } from 'vitest';

import { collectVerificationProfile } from './verification-profile.mjs';
import {
  expectAdvisoryCoverage,
  expectAdvisoryToolCoverageScopes,
  expectBaseWrapperToolCoverageScopes,
  expectHybridWrapperToolCoverageScopes,
  expectManualOnlySeparation,
  expectRepoAuditReportCoverage,
  expectWrapperCoverage,
  readJson,
} from './verification-profile.test-support';

it('classifies trigger-covered and advisory scripts separately from focused blind spots', () => {
  const packageJson = readJson('package.json');
  const { verification, loopholes } = collectVerificationProfile(packageJson);

  expectWrapperCoverage(verification);
  expectManualOnlySeparation(verification);
  expectAdvisoryCoverage(verification);
  expectRepoAuditReportCoverage(verification);
  expectBaseWrapperToolCoverageScopes(verification);
  expectHybridWrapperToolCoverageScopes(verification);
  expectAdvisoryToolCoverageScopes(verification);
  expect(loopholes).not.toContainEqual(expect.objectContaining({ kind: 'focused-blind-spot' }));
});
