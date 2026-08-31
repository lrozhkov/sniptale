import { describe, expect, it } from 'vitest';
import { PAGE_PACKAGE_EXTENDED_DIAGNOSTIC_ENTRY_PROFILE } from '@sniptale/runtime-contracts/page-package';
import { createDiagnosticContributions } from './diagnostics';

const digest = async () => 'd'.repeat(64);

function extendedAssets() {
  return PAGE_PACKAGE_EXTENDED_DIAGNOSTIC_ENTRY_PROFILE.map((entry) => ({
    ...entry,
    content: entry.mimeType === 'application/json' ? '{}\n' : '<html>evidence</html>',
  }));
}

describe('Page Package diagnostic contributions', () => {
  it('maps existing standard diagnostic text below an inert deterministic root', async () => {
    const contributions = await createDiagnosticContributions({
      digest,
      intent: 'save',
      level: 'standard',
      standardAssets: [
        { path: 'logs/page-summary.json', content: '{}' },
        {
          path: 'logs/dom.html',
          content: '<html>redacted standard DOM</html>',
        },
        { path: 'logs/css/site.css', content: '/* diagnostic metadata */' },
      ],
    });
    expect(contributions.map(({ path, mimeType }) => ({ path, mimeType }))).toEqual([
      {
        path: 'diagnostics/standard/logs/page-summary.json',
        mimeType: 'application/json',
      },
      {
        path: 'diagnostics/standard/logs/dom.html.txt',
        mimeType: 'text/plain',
      },
      {
        path: 'diagnostics/standard/logs/css/site.css.txt',
        mimeType: 'text/plain',
      },
    ]);
  });

  it.each(['export', 'save'] as const)(
    'admits the closed inert extended inventory for %s intent',
    async (intent) => {
      const contributions = await createDiagnosticContributions({
        digest,
        extendedAssets: extendedAssets(),
        intent,
        level: 'extended',
        standardAssets: [{ path: 'logs/meta.json', content: '{}' }],
      });
      expect(contributions).toHaveLength(PAGE_PACKAGE_EXTENDED_DIAGNOSTIC_ENTRY_PROFILE.length + 1);
      expect(contributions.slice(1).map((entry) => entry.path)).toEqual(
        PAGE_PACKAGE_EXTENDED_DIAGNOSTIC_ENTRY_PROFILE.map((entry) => entry.path)
      );
      expect(contributions.every((entry) => entry.component === 'diagnostics')).toBe(true);
    }
  );

  it('fails closed on wrong level, malformed inventory and unsafe paths before digest', async () => {
    let digestCalls = 0;
    const trackingDigest = async () => {
      digestCalls += 1;
      return 'd'.repeat(64);
    };
    await expect(
      createDiagnosticContributions({
        digest: trackingDigest,
        extendedAssets: extendedAssets(),
        intent: 'export',
        level: 'standard',
      })
    ).rejects.toThrow('require the extended level');
    await expect(
      createDiagnosticContributions({
        digest: trackingDigest,
        extendedAssets: extendedAssets().slice(1),
        intent: 'export',
        level: 'extended',
      })
    ).rejects.toThrow('incomplete');
    await expect(
      createDiagnosticContributions({
        digest: trackingDigest,
        intent: 'export',
        level: 'standard',
        standardAssets: [{ path: '../escape.json', content: '{}' }],
      })
    ).rejects.toThrow('Invalid media archive path');
    await expect(
      createDiagnosticContributions({
        digest: trackingDigest,
        intent: 'export',
        level: 'standard',
        standardAssets: [{ path: 'logs/archive.ZIP', content: 'zip' }],
      })
    ).rejects.toThrow('Invalid diagnostic source path');
    expect(digestCalls).toBe(0);
  });

  it('emits nothing at level none without constructing or hashing supplied evidence', async () => {
    let digestCalls = 0;
    const result = await createDiagnosticContributions({
      digest: async () => {
        digestCalls += 1;
        return 'd'.repeat(64);
      },
      extendedAssets: extendedAssets(),
      intent: 'save',
      level: 'none',
      standardAssets: [{ path: '../ignored', content: 'ignored' }],
    });
    expect(result).toEqual([]);
    expect(digestCalls).toBe(0);
  });

  it('rejects an oversized standard inventory before Blob construction or digest', async () => {
    let digestCalls = 0;
    const source = { path: 'logs/meta.json', content: '{}' };
    await expect(
      createDiagnosticContributions({
        digest: async () => {
          digestCalls += 1;
          return 'd'.repeat(64);
        },
        intent: 'export',
        level: 'standard',
        standardAssets: Array.from({ length: 25_001 }, () => source),
      })
    ).rejects.toThrow('entry count exceeds');
    expect(digestCalls).toBe(0);
  });
});
