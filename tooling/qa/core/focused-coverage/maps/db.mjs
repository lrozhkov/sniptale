export const FOCUSED_COVERAGE_DB_OWNER_MAPPINGS = [
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
    productionFile:
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/core.ts',
    reason: 'DB schema upgrade dispatch is covered by core upgrade and provenance migration tests.',
    testFiles: [
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/core.test.ts',
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/maintenance/provenance.test.ts',
    ],
  },
  {
    owner: 'shared-db-core-stores-schema-version',
    productionFile:
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/core.stores.ts',
    reason: 'DB schema version changes are covered by core upgrade and migration tests.',
    testFiles: [
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
      [
        'apps/extension/src/composition/persistence/web-snapshots',
        'maintenance/provenance.test.ts',
      ].join('/'),
    ],
  },
  {
    owner: 'shared-db-web-snapshot-provenance-state',
    productionFile: 'apps/extension/src/composition/persistence/web-snapshots/provenance-state.ts',
    reason:
      'Web snapshot provenance maintenance markers are covered by save, restore, and maintenance suites.',
    testFiles: [
      [
        'apps/extension/src/composition/persistence/web-snapshots',
        'maintenance/provenance.test.ts',
      ].join('/'),
      'apps/extension/src/composition/persistence/web-snapshots/records.test.ts',
      'apps/extension/src/workflows/media-hub-backup/restore/web-snapshot.test.ts',
    ],
  },
  {
    owner: 'shared-db-editor-session-provenance',
    productionFile: 'apps/extension/src/composition/persistence/editor-sessions/index.ts',
    reason: 'Editor session provenance writes are covered by focused editor session tests.',
    testFiles: ['apps/extension/src/composition/persistence/editor-sessions/index.test.ts'],
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
  {
    owner: 'shared-media-hub-backup-project-test-support',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/export/projects/test-support.ts',
    reason: 'Media hub backup project fixtures are owned by the project bundle export suite.',
    testFiles: ['apps/extension/src/workflows/media-hub-backup/export/projects/index.test.ts'],
  },
];
