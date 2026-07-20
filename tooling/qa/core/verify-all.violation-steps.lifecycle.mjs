import { runDestructiveAsyncSwapCheck } from './verify-destructive-async-swaps.mjs';
import { runHistoryDetachedSnapshotCheck } from './verify-history-detached-snapshots.mjs';
import { runHistoryRevisionSemanticsCheck } from './verify-history-revision-semantics.mjs';
import { runHistoryTransactionLifecycleCheck } from './verify-history-transaction-lifecycle.mjs';
import { runLifecycleIntentCheck } from './verify-lifecycle-intent.mjs';
import { runParserSnapshotPurityCheck } from './verify-parser-snapshot-purity.mjs';
import { runStorageWritePatternCheck } from './verify-storage-write-patterns.mjs';
import { runSuccessFailureAsymmetryCheck } from './verify-success-failure-asymmetry.mjs';

export const LIFECYCLE_VIOLATION_STEPS = [
  [
    'Lifecycle intent loss',
    'Lifecycle intent guardrail violations found:',
    runLifecycleIntentCheck,
  ],
  [
    'Success/failure asymmetry',
    'Success/failure asymmetry violations found:',
    runSuccessFailureAsymmetryCheck,
  ],
  [
    'Destructive async swaps',
    'Destructive async swap violations found:',
    runDestructiveAsyncSwapCheck,
  ],
  [
    'Storage write patterns',
    'Storage write-pattern violations found:',
    runStorageWritePatternCheck,
  ],
  [
    'Parser snapshot purity',
    'Parser snapshot purity violations found:',
    runParserSnapshotPurityCheck,
  ],
  [
    'History revision semantics',
    'History revision semantics violations found:',
    runHistoryRevisionSemanticsCheck,
  ],
  [
    'History detached snapshots',
    'History detached-snapshot violations found:',
    runHistoryDetachedSnapshotCheck,
  ],
  [
    'History transaction lifecycle',
    'History transaction lifecycle violations found:',
    runHistoryTransactionLifecycleCheck,
  ],
];
