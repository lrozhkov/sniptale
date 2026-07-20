import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const legacyAdapterPath =
  'apps/extension/src/background/runtime/routing/action-kernel/legacy-adapter.ts';
const routeCompletenessProofPath =
  'apps/extension/src/background/runtime/routing/action-kernel/route-completeness.test.ts';

const immediateLegacyRouteKinds = [
  'internal-signal',
  'background-owned',
  'video-runtime',
  'unknown',
] as const;

function readRepoFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

function collectSwitchCaseLabels(source: string): readonly string[] {
  return [...source.matchAll(/case '([^']+)':/g)]
    .map((match) => match[1])
    .filter((caseLabel): caseLabel is string => caseLabel !== undefined)
    .sort();
}

describe('legacy route adapter growth guard', () => {
  it('keeps legacy adapter route families pinned to the migration rule', () => {
    const source = readRepoFile(legacyAdapterPath);

    expect(source).toContain('ROUTING-03 migration rule');
    expect(source).toContain('route-completeness proof');
    expect(collectSwitchCaseLabels(source)).toEqual([...immediateLegacyRouteKinds].sort());
  });

  it('keeps legacy adapter growth tied to route completeness proof', () => {
    const source = readRepoFile(routeCompletenessProofPath);

    expect(source).toContain('backgroundRuntimeTypes');
    expect(source).toContain('collectMissingRuntimeRouteClassifications');
  });
});
