export const FOCUSED_COVERAGE_DB_OWNER_MAPPINGS = [
  {
    owner: 'durable-ready-media-locators',
    productionFile: 'apps/extension/src/composition/persistence/assets/ready-media-claims.ts',
    exclusive: true,
    reason:
      'Ready media locators serve native journals and replica retention. ' +
      'Direct locator tests and pending-publication consumer tests prove complete source families.',
    testFiles: [
      'apps/extension/src/composition/persistence/assets/ready-media-claims.test.ts',
      'apps/extension/src/composition/persistence/media-library/delete-cascade.pending-publication.test.ts',
    ],
  },
  {
    owner: 'sync-project-snapshot-native-admission',
    productionFile: 'apps/extension/src/composition/persistence/sync-capture/project-snapshot.ts',
    exclusive: true,
    reason:
      'Project snapshot helpers and graph admission serve native freeze and replica application. ' +
      'Direct, guard, capture, recording, binary and Scenario consumer tests prove the retained graph.',
    testFiles: [
      'apps/extension/src/composition/persistence/sync-capture/project-snapshot.test.ts',
      'apps/extension/src/composition/persistence/sync-capture/capture.integration.test.ts',
      'apps/extension/src/composition/persistence/sync-capture/guards.test.ts',
      'apps/extension/src/composition/persistence/sync-capture/freeze.test.ts',
      'apps/extension/src/composition/persistence/sync-capture/freeze.recording.test.ts',
      'apps/extension/src/composition/persistence/sync-capture/apply-video-project.test.ts',
      'apps/extension/src/composition/persistence/sync-capture/apply-video-project.binary.test.ts',
      'apps/extension/src/composition/persistence/sync-capture/apply-video-project.scenario.test.ts',
    ],
  },
  {
    owner: 'native-database-migrations',
    productionFile:
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/database-migrations.ts',
    exclusive: true,
    reason:
      'Migration fixtures and branch integration prove additive admission, retained records and malformed prototype refusal.',
    testFiles: [
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/schema-contracts.test.ts',
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/core.stores.fixture.test.ts',
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/core.test.ts',
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/branch-integration.test.ts',
    ],
  },
  {
    owner: 'sync-capture-project-fixture',
    productionFile:
      'apps/extension/src/composition/persistence/sync-capture/test-support/freeze.ts',
    reason:
      'Frozen project and recording tests use this database fixture to prove detached capture boundaries.',
    testFiles: [
      'apps/extension/src/composition/persistence/sync-capture/freeze.test.ts',
      'apps/extension/src/composition/persistence/sync-capture/freeze.recording.test.ts',
    ],
  },
  {
    owner: 'sync-capture-project-apply-prototype',
    productionFile:
      'apps/extension/src/composition/persistence/sync-capture/test-support/apply-video-project.ts',
    reason:
      'Capture integration proves duplicate application, stale source refusal and atomic replica publication.',
    testFiles: [
      'apps/extension/src/composition/persistence/sync-capture/capture.integration.test.ts',
    ],
  },
  {
    owner: 'review-attachment-target-retention-consumers',
    productionFile: 'apps/extension/src/composition/persistence/assets/retention-index.ts',
    allowCrossOwner: true,
    reason:
      'Review attachment cancellation and Library binding use the native target-retention index.',
    testFiles: [
      'apps/extension/src/workflows/video-review/presentation-attachment.test.ts',
      'apps/extension/src/workflows/video-review/watermark-image.test.ts',
    ],
  },
  {
    owner: 'review-attachment-physical-cleanup-consumers',
    productionFile: 'apps/extension/src/composition/persistence/assets/operations.ts',
    allowCrossOwner: true,
    reason:
      'Review attachment cancellation uses checked physical cleanup and targeted ready claims.',
    testFiles: [
      'apps/extension/src/workflows/video-review/presentation-attachment.test.ts',
      'apps/extension/src/workflows/video-review/watermark-image.test.ts',
    ],
  },
  {
    owner: 'durable-asset-retention-consumers',
    productionFile: 'apps/extension/src/composition/persistence/assets/retention-authority.ts',
    allowCrossOwner: true,
    reason:
      'Retention authority serves physical deletion, recovery, audit and residency. ' +
      'These consumers prove failed reads, cancellation, rollback claims and retained sources.',
    testFiles: [
      'apps/extension/src/composition/persistence/assets/retention-authority.test.ts',
      'apps/extension/src/composition/persistence/assets/operations.test.ts',
      'apps/extension/src/composition/persistence/assets/fault-state-machine.test.ts',
      'apps/extension/src/composition/persistence/assets/residency-maintenance.test.ts',
      'apps/extension/src/composition/persistence/assets/residency-maintenance.inline.test.ts',
      'apps/extension/src/composition/persistence/assets/private-source-retention.test.ts',
      'apps/extension/src/composition/persistence/asset-publication-recovery/audit.test.ts',
      'apps/extension/src/composition/persistence/asset-publication-recovery/index.test.ts',
      'apps/extension/src/composition/persistence/asset-publication-recovery/maintenance.integration.test.ts',
      'apps/extension/src/composition/persistence/asset-publication-recovery/maintenance.test.ts',
      'apps/extension/src/workflows/sync-transfer/native-residency.test.ts',
    ],
  },
  {
    owner: 'sync-connection-enrollment-and-retirement',
    productionFile: 'apps/extension/src/composition/persistence/remote-connection/store.ts',
    reason:
      'Enrollment and local-only consumers prove replay, rollback, stale identities and authority retirement.',
    testFiles: [
      'apps/extension/src/composition/persistence/remote-connection/enrollment.test.ts',
      'apps/extension/src/composition/persistence/remote-connection/local-only.test.ts',
    ],
  },
  {
    owner: 'sync-native-media-parser-backup-consumers',
    productionFile: 'apps/extension/src/composition/persistence/sync-capture/guards.ts',
    allowCrossOwner: true,
    reason: 'Backup workflows consume the retained native media parser through this public owner.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/index.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/codec.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/restore.test.ts',
    ],
  },
  {
    owner: 'sync-native-review-snapshot-workflow-consumers',
    productionFile: 'apps/extension/src/composition/persistence/sync-capture/review-snapshot.ts',
    allowCrossOwner: true,
    reason: 'Portable review workflows consume the retained native review parser and contract.',
    testFiles: [
      'apps/extension/src/workflows/sync-transfer/captured-review.test.ts',
      'apps/extension/src/workflows/sync-transfer/prepared-review.test.ts',
      'apps/extension/src/workflows/sync-transfer/portable-root.test.ts',
      'apps/extension/src/workflows/sync-transfer/portable-review.test.ts',
      'apps/extension/src/workflows/sync-transfer/incoming-review.test.ts',
    ],
  },
  {
    owner: 'sync-queue-native-control-and-delivery',
    productionFile: 'apps/extension/src/composition/persistence/sync-capture/queue.ts',
    reason:
      'Transaction-scoped source admission shares native queue controls and retained capture joins. ' +
      'Queue, pagination, history and transfer suites prove commands, publication and interrupted recovery.',
    testFiles: [
      'apps/extension/src/composition/persistence/sync-capture/queue.test.ts',
      'apps/extension/src/composition/persistence/sync-capture/queue-pagination.test.ts',
      'apps/extension/src/composition/persistence/sync-capture/queue-history.test.ts',
      'apps/extension/src/workflows/sync-transfer/queue.test.ts',
    ],
  },
  {
    owner: 'sync-replica-durable-native-admission',
    productionFile:
      'apps/extension/src/composition/persistence/sync-capture/replica-publication.ts',
    reason:
      'Delayed replica recovery must preserve native concurrency, deletion, recreation and retry guards. ' +
      'The existing media, project and journal suites prove these admission boundaries.',
    testFiles: [
      'apps/extension/src/composition/persistence/sync-capture/apply-media.test.ts',
      'apps/extension/src/composition/persistence/sync-capture/apply-media.export.test.ts',
      'apps/extension/src/composition/persistence/sync-capture/apply-media.snapshot.test.ts',
      'apps/extension/src/composition/persistence/sync-capture/apply-video-project.test.ts',
      'apps/extension/src/composition/persistence/sync-capture/apply-video-project.scenario.test.ts',
      'apps/extension/src/composition/persistence/sync-capture/replica-publication.test.ts',
    ],
  },
  {
    owner: 'shared-db-media-source-retention',
    productionFile:
      'apps/extension/src/composition/persistence/media-library/delete-cascade.sources.ts',
    reason:
      'Source retention includes purge, pending native publications, Scenario dependencies ' +
      'and recording replacement through native sync and backup publication.',
    testFiles: [
      'apps/extension/src/composition/persistence/media-library/delete-cascade.sources.test.ts',
      'apps/extension/src/composition/persistence/media-library/delete-cascade.pending-publication.test.ts',
      'apps/extension/src/composition/persistence/media-library/delete-cascade.scenario.test.ts',
      'apps/extension/src/composition/persistence/media-library/delete-cascade.test.ts',
      'apps/extension/src/composition/persistence/sync-capture/apply-media.recording.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/root-publication/media.capture.test.ts',
    ],
  },
  {
    owner: 'shared-db-canonical-media-deletion',
    productionFile: 'apps/extension/src/composition/persistence/media-library/delete-cascade.ts',
    reason:
      'Canonical deletion includes retained Scenario consumers and recording safety copies. ' +
      'The existing Scenario, source, dependency and deletion suites prove the complete transaction.',
    testFiles: [
      'apps/extension/src/composition/persistence/media-library/delete-cascade.scenario.test.ts',
      'apps/extension/src/composition/persistence/media-library/delete-cascade.sources.test.ts',
      'apps/extension/src/composition/persistence/media-library/delete-cascade.test.ts',
      'apps/extension/src/composition/persistence/media-library/dependencies.test.ts',
    ],
  },
  {
    owner: 'shared-db-video-dependency-envelope',
    productionFile: 'apps/extension/src/composition/persistence/media-library/dependencies.ts',
    exclusive: true,
    reason:
      'Dependency admission/refusal is proved directly and through Scenario deletion, ' +
      'Library cleanup/purge, private retention, source admission and backup.',
    testFiles: [
      'apps/extension/src/composition/persistence/media-library/dependencies.test.ts',
      'apps/extension/src/composition/persistence/scenario/video-asset-detachment.test.ts',
      'apps/extension/src/composition/persistence/scenario/store/project-records/delete.test.ts',
      'apps/extension/src/composition/persistence/library-lifecycle/cleanup-orphans.test.ts',
      'apps/extension/src/composition/persistence/library-lifecycle/cleanup-transaction.test.ts',
      'apps/extension/src/composition/persistence/library-lifecycle/cleanup-linked-recording.test.ts',
      'apps/extension/src/composition/persistence/library-lifecycle/cleanup-races.test.ts',
      'apps/extension/src/composition/persistence/assets/private-source-retention.test.ts',
      'apps/extension/src/composition/persistence/projects/source-admission.test.ts',
      'apps/extension/src/composition/persistence/projects/backup-restore.test.ts',
      'apps/extension/src/composition/persistence/projects/backup-restore.review-assets.test.ts',
      'apps/extension/src/composition/persistence/media-library/delete-cascade.test.ts',
      'apps/extension/src/composition/persistence/media-library/delete-cascade.sources.test.ts',
      'apps/extension/src/composition/persistence/media-library/delete-cascade.scenario.test.ts',
    ],
  },
  {
    owner: 'shared-db-core-init-maintenance',
    productionFile: 'apps/extension/src/composition/persistence/infrastructure/indexed-db/core.ts',
    reason:
      'DB initialization and post-open maintenance are covered by core and maintenance suites.',
    testFiles: [
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/core.test.ts',
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/maintenance/provenance.test.ts',
    ],
  },
  {
    owner: 'shared-db-core-upgrade-root',
    exclusive: true,
    productionFile:
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/core.ts',
    reason:
      'Preserve DB boundary proof and add legacy migrations, core admission, and provenance checks.',
    testFiles: [
      'apps/extension/src/composition/persistence/diagnostics/index.test.ts',
      'apps/extension/src/composition/persistence/projects/index.read-guards.test.ts',
      'apps/extension/src/composition/persistence/scenario/projects/assets.test.ts',
      'apps/extension/src/composition/persistence/scenario/projects/exports.test.ts',
      'apps/extension/src/composition/persistence/scenario/projects/project.test.ts',
      'apps/extension/src/composition/persistence/effect-bundles/index.test.ts',
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/review-history.test.ts',
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/scenario-history.test.ts',
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/scenario-units.test.ts',
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/core.test.ts',
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/maintenance/provenance.test.ts',
    ],
  },
  {
    owner: 'shared-db-core-stores-schema-version',
    exclusive: true,
    productionFile:
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/core.stores.ts',
    reason:
      'Preserve DB boundary proof and add legacy migration store/index expectations for schema changes.',
    testFiles: [
      'apps/extension/src/composition/persistence/diagnostics/index.test.ts',
      'apps/extension/src/composition/persistence/projects/index.read-guards.test.ts',
      'apps/extension/src/composition/persistence/scenario/projects/assets.test.ts',
      'apps/extension/src/composition/persistence/scenario/projects/exports.test.ts',
      'apps/extension/src/composition/persistence/scenario/projects/project.test.ts',
      'apps/extension/src/composition/persistence/effect-bundles/index.test.ts',
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/review-history.test.ts',
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/scenario-history.test.ts',
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/scenario-units.test.ts',
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/core.test.ts',
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/maintenance/provenance.test.ts',
    ],
  },
  {
    owner: 'shared-db-core-upgrade-store-helpers',
    productionPrefix:
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/core.',
    reason: 'Store-specific schema upgrade helpers are covered by the root core upgrade suite.',
    testFiles: [
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/core.test.ts',
    ],
  },
  {
    owner: 'shared-db-core-upgrade-helper-types',
    productionFile:
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/types.ts',
    reason: 'Core upgrade helper types are covered by the root core upgrade suite.',
    testFiles: [
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/core.test.ts',
    ],
  },
  {
    owner: 'shared-db-core-provenance-maintenance',
    productionPrefix:
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/maintenance/',
    reason: 'Persisted provenance URL maintenance is covered by the focused maintenance suite.',
    testFiles: [
      [
        'apps/extension/src/composition/persistence/infrastructure/indexed-db',
        'maintenance/provenance.test.ts',
      ].join('/'),
    ],
  },
  {
    owner: 'shared-db-image-workspace-provenance',
    productionFile:
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/maintenance/provenance.ts',
    reason: 'Image workspace provenance maintenance is covered by focused maintenance tests.',
    testFiles: [
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/maintenance/provenance.test.ts',
    ],
  },
  {
    owner: 'shared-db-image-workspace-aggregate',
    productionPrefix: 'apps/extension/src/composition/persistence/image-workspaces/',
    reason:
      'Image workspace contracts, parser, and reads are covered through aggregate CAS and provenance suites.',
    testFiles: [
      'apps/extension/src/composition/persistence/image-aggregates/mutations.test.ts',
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/maintenance/provenance.test.ts',
    ],
  },
  {
    owner: 'shared-db-scenario-project-entry',
    productionFile: 'apps/extension/src/composition/persistence/scenario/projects/entry.ts',
    reason:
      'Canonical Scenario entry construction serves project, asset, export and capture writers. ' +
      'Checkpoint admission and native producer suites prove those consumers.',
    testFiles: [
      'apps/extension/src/composition/persistence/scenario/editing-history.test.ts',
      'apps/extension/src/composition/persistence/scenario/aggregate-mutations.test.ts',
      'apps/extension/src/composition/persistence/scenario/aggregate-mutations.identity.test.ts',
      'apps/extension/src/composition/persistence/scenario/projects/project.test.ts',
      'apps/extension/src/composition/persistence/scenario/projects/assets.test.ts',
      'apps/extension/src/composition/persistence/scenario/projects/exports.test.ts',
      'apps/extension/src/composition/persistence/scenario/projects/index.test.ts',
      'apps/extension/src/composition/persistence/scenario/projects/project.capture-format.test.ts',
    ],
  },
  {
    owner: 'shared-db-scenario-aggregate-mutations',
    productionFile: 'apps/extension/src/composition/persistence/scenario/aggregate-mutations.ts',
    reason: 'Scenario suites cover aggregate CAS, rollback, and graph deletion.',
    testFiles: [
      'apps/extension/src/composition/persistence/scenario/store/project-records/delete.test.ts',
      'apps/extension/src/composition/persistence/scenario/aggregate-mutations.test.ts',
      'apps/extension/src/composition/persistence/scenario/store/capture-step/artifact-persistence.test.ts',
    ],
  },
  {
    owner: 'shared-db-editor-custom-shapes',
    productionFile: 'apps/extension/src/editor/objects/custom-shapes/persistence.ts',
    reason:
      'Editor custom shape persistence semantics are covered by the focused custom shapes DB suite.',
    testFiles: ['apps/extension/src/editor/objects/custom-shapes/persistence.test.ts'],
  },
  {
    owner: 'shared-db-media-library-provenance',
    productionFile: 'apps/extension/src/composition/persistence/media-library/index.library.ts',
    reason: 'Media library provenance patch writes are covered by focused provenance tests.',
    testFiles: [
      'apps/extension/src/composition/persistence/media-library/index.library.mutations.test.ts',
      'apps/extension/src/composition/persistence/media-library/index.library.provenance.test.ts',
      'apps/extension/src/composition/persistence/media-library/index.library.tags.test.ts',
      'apps/extension/src/composition/persistence/media-library/index.library.test.ts',
      'apps/extension/src/composition/persistence/media-library/index.library.web-snapshot-provenance.test.ts',
    ],
  },
  {
    owner: 'shared-db-screenshot-media-provenance',
    productionFile: 'apps/extension/src/composition/persistence/media-library/index.screenshots.ts',
    reason: 'Screenshot media provenance writes are covered by focused screenshot DB tests.',
    testFiles: [
      'apps/extension/src/composition/persistence/media-library/index.screenshots.test.ts',
    ],
  },
  {
    owner: 'shared-db-read-guards',
    productionFile:
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/read-primitives.ts',
    reason: 'Root DB read guards are owned by the focused read-guard boundary suite.',
    testFiles: [
      'apps/extension/src/composition/persistence/projects/index.read-guards.test.ts',
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/core.test.ts',
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/core.test.ts',
      'apps/extension/src/composition/persistence/diagnostics/index.test.ts',
      'apps/extension/src/editor/objects/custom-shapes/persistence.test.ts',
    ],
  },
  {
    owner: 'shared-db-media-read-guards',
    productionFile: 'apps/extension/src/composition/persistence/media-library/read-guards.ts',
    reason: 'Media library DB read guards are owned by the focused read-guard boundary suite.',
    testFiles: ['apps/extension/src/composition/persistence/projects/index.read-guards.test.ts'],
  },
  {
    owner: 'shared-db-scenario-asset-storage-policy',
    productionFile:
      'apps/extension/src/composition/persistence/scenario/projects/guards/asset-policy.ts',
    reason:
      'Scenario asset storage MIME and size policy is owned by the scenario-project DB guard suite.',
    testFiles: [
      'apps/extension/src/composition/persistence/scenario/projects/guards/asset-policy.test.ts',
      'apps/extension/src/composition/persistence/scenario/projects/assets.test.ts',
    ],
  },
  {
    owner: 'shared-db-video-project-persistence',
    productionFile: 'apps/extension/src/composition/persistence/projects/index.ts',
    reason: 'Video project persistence writes are covered by focused project DB regression suites.',
    testFiles: [
      'apps/extension/src/composition/persistence/projects/index.delete.test.ts',
      'apps/extension/src/composition/persistence/projects/index.test.ts',
      'apps/extension/src/composition/persistence/projects/index.stale-save.test.ts',
    ],
  },
  {
    owner: 'shared-db-video-project-delete',
    productionFile: 'apps/extension/src/composition/persistence/projects/index.delete.ts',
    reason:
      'Video project delete retention semantics are covered by focused project DB delete tests.',
    testFiles: ['apps/extension/src/composition/persistence/projects/index.delete.test.ts'],
  },
  {
    owner: 'shared-db-video-project-mutation-stores',
    productionFile: 'apps/extension/src/composition/persistence/projects/mutation-stores.ts',
    reason:
      'Project mutation store construction is covered by project persistence and the complete mutation inventory.',
    testFiles: [
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/mutation-inventory.test.ts',
      'apps/extension/src/composition/persistence/projects/index.delete.test.ts',
      'apps/extension/src/composition/persistence/projects/index.test.ts',
      'apps/extension/src/composition/persistence/sync-capture/checkpoint-schedule.test.ts',
      'apps/extension/src/composition/persistence/sync-capture/capture.integration.test.ts',
    ],
  },
  {
    owner: 'shared-db-project-asset-references',
    productionFile: 'apps/extension/src/composition/persistence/projects/asset-references.ts',
    reason: 'Project asset reference ownership is covered by focused project DB delete tests.',
    testFiles: ['apps/extension/src/composition/persistence/projects/index.delete.test.ts'],
  },
];
