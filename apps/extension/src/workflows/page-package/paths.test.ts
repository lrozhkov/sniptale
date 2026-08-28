import { describe, expect, it } from 'vitest';
import {
  assertPagePackageContribution,
  assertUniquePagePackagePaths,
  type PagePackageContribution,
} from './paths';

function contribution(
  overrides: Partial<PagePackageContribution<string>> = {}
): PagePackageContribution<string> {
  return {
    component: 'images',
    mimeType: 'image/png',
    path: 'exports/images/photo.png',
    sha256: 'a'.repeat(64),
    size: 4,
    source: 'source',
    ...overrides,
  };
}

describe('Page Package contribution paths', () => {
  it('accepts an admitted component path without reading its source', () => {
    expect(() => assertPagePackageContribution(contribution())).not.toThrow();
  });

  it('rejects unsafe, nested-package, MIME-parameter and component-crossing paths', () => {
    expect(() => assertPagePackageContribution(contribution({ path: '../photo.png' }))).toThrow();
    expect(() =>
      assertPagePackageContribution(
        contribution({
          path: 'exports/images/archive.zip',
          mimeType: 'application/zip',
        })
      )
    ).toThrow();
    expect(() =>
      assertPagePackageContribution(contribution({ mimeType: 'image/png; charset=binary' }))
    ).toThrow();
    expect(() =>
      assertPagePackageContribution(contribution({ component: 'attachments' }))
    ).toThrow();
  });

  it('rejects exact and locale-pinned case collisions', () => {
    expect(() =>
      assertUniquePagePackagePaths([
        contribution(),
        contribution({ path: 'exports/images/PHOTO.PNG' }),
      ])
    ).toThrow('Duplicate Page Package path');
  });
});
