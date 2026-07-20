import { expect, it } from 'vitest';

import * as diagnosticSnapshot from './page-snapshot';
import * as exportManagerSnapshot from './snapshot';

it('re-exports snapshot builders from the canonical diagnostics owner', () => {
  expect(exportManagerSnapshot.buildDomSnapshotHtml).toBe(diagnosticSnapshot.buildDomSnapshotHtml);
  expect(exportManagerSnapshot.buildVirtualDomSnapshotHtml).toBe(
    diagnosticSnapshot.buildVirtualDomSnapshotHtml
  );
  expect(exportManagerSnapshot.buildPageSummaryFile).toBe(diagnosticSnapshot.buildPageSummaryFile);
  expect(exportManagerSnapshot.createHarLikeSnapshot).toBe(
    diagnosticSnapshot.createHarLikeSnapshot
  );
});
