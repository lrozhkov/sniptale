export const FOCUSED_COVERAGE_DB_OWNER_MAPPINGS = [
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
    ],
  },
  {
    owner: 'shared-db-project-asset-references',
    productionFile: 'apps/extension/src/composition/persistence/projects/asset-references.ts',
    reason: 'Project asset reference ownership is covered by focused project DB delete tests.',
    testFiles: ['apps/extension/src/composition/persistence/projects/index.delete.test.ts'],
  },
];
