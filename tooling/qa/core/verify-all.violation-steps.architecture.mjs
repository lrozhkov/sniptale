import { runBrowserAdapterCheck } from './verify-browser-adapters.mjs';
import { runCanonicalFacadeCheck } from './verify-canonical-facades.mjs';
import { runChangedUiAutomationSeamCheck } from './verify-ui-automation-seams.mjs';
import { runHeavyRuntimeImportOwnershipCheck } from './verify-heavy-runtime-import-ownership.mjs';
import { runInstanceOwnershipCheck } from './verify-instance-ownership.mjs';
import { runManifestIntegrityCheck } from './verify-manifest-integrity.mjs';
import { runManifestPermissionsCheck } from '../guards/architecture/verify-manifest-permissions.mjs';
import { runMultiMessageTransitionCheck } from './verify-multi-message-transitions.mjs';
import { runOssReleaseSurfaceCheck } from './verify-oss-release-surface.mjs';
import { runPackageBoundaryCheck } from './verify-package-boundaries.mjs';
import { runAppCoreOwnerCheck } from './verify-app-core-owners.mjs';
import { runTargetOnlyPathCheck } from './verify-target-only-paths.mjs';
import { runRepoWideInterfaceSurfaceCheck } from './verify-interface-surfaces.mjs';
import { runRepoWideReturnedObjectSurfaceCheck } from './verify-interface-surfaces.mjs';
import { runRepoWideRootSideEffectCheck } from './verify-root-side-effects.mjs';
import { runRuntimeTopologyCheck } from '../guards/architecture/verify-runtime-topology.mjs';
import { runSharedStyleOwnershipCheck } from './verify-shared-style-ownership.mjs';
import { runSharedUiBoundaryCheck } from './verify-shared-ui-boundaries.mjs';

export const ARCHITECTURE_VIOLATION_STEPS = [
  ['Manifest integrity', 'Manifest integrity violations found:', runManifestIntegrityCheck],
  ['Manifest permissions', 'Manifest permission violations found:', runManifestPermissionsCheck],
  ['Runtime topology', 'Runtime topology violations found:', runRuntimeTopologyCheck],
  ['Package boundaries', 'Package boundary violations found:', runPackageBoundaryCheck],
  ['App-core owners', 'App-core owner violations found:', runAppCoreOwnerCheck],
  ['Target-only paths', 'Target-only path violations found:', runTargetOnlyPathCheck],
  ['OSS release surface', 'OSS release surface violations found:', runOssReleaseSurfaceCheck],
  ['Shared UI boundaries', 'Shared UI boundary violations found:', runSharedUiBoundaryCheck],
  ['Browser adapters', 'Browser adapter guardrail violations found:', runBrowserAdapterCheck],
  [
    'Heavy runtime imports',
    'Heavy runtime import ownership violations found:',
    runHeavyRuntimeImportOwnershipCheck,
  ],
  ['Canonical facades', 'Canonical facade guardrail violations found:', runCanonicalFacadeCheck],
  ['Root side effects', 'Root side-effect violations found:', runRepoWideRootSideEffectCheck],
  [
    'Shared style ownership',
    'Shared style ownership guardrail violations found:',
    runSharedStyleOwnershipCheck,
  ],
  [
    'Interface surfaces',
    'Broad interface surface violations found:',
    runRepoWideInterfaceSurfaceCheck,
  ],
  [
    'Returned object surfaces',
    'Broad returned object surface violations found:',
    runRepoWideReturnedObjectSurfaceCheck,
  ],
  [
    'Multi-message transitions',
    'Multi-message transition violations found:',
    () => runMultiMessageTransitionCheck({ scope: 'repo-wide' }),
  ],
  ['UI automation seams', 'UI automation seam violations found:', runChangedUiAutomationSeamCheck],
  [
    'Interactive controller ownership',
    'Interactive controller ownership violations found:',
    runInstanceOwnershipCheck,
  ],
];
