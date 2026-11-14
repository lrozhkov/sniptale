import { betaV60Fixture } from './beta-v60';

/** Integrated image admission preserves existing records and immutable source objects. */
export const betaV61Fixture = {
  ...betaV60Fixture,
  databaseVersion: 61,
  expectedDigest: 'a0022e53cf9070d51bc6af3c55417108bae614a18cb6c54d5aaa6494c5ba6739',
  domainVersions: {
    ...betaV60Fixture.domainVersions,
    mediaLibrary: 39,
    scenarioProjects: 12,
    editorVectorLibrary: 1,
  },
  stores: [
    ...betaV60Fixture.stores.slice(0, betaV60Fixture.stores.indexOf('state_manager')),
    'editor_vector_library',
    ...betaV60Fixture.stores.slice(betaV60Fixture.stores.indexOf('state_manager')),
  ],
  indexes: {
    ...betaV60Fixture.indexes,
    editor_vector_library: ['kind', 'definitionId', 'retentionReferenceKeys'],
  },
  records: { ...betaV60Fixture.records, editor_vector_library: [] },
} as const;
