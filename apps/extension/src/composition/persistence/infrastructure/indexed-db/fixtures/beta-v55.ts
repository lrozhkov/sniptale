import { betaV54Fixture } from './beta-v54';

/** Vector backing adds an empty durable store while preserving all released records and bytes. */
export const betaV55Fixture = {
  ...betaV54Fixture,
  databaseVersion: 55,
  expectedDigest: '53e7708ee9a94719c09e518f5c3a324b20e9325878bf6b9cbe4a12378746b7cd',
  domainVersions: {
    ...betaV54Fixture.domainVersions,
    editorVectorLibrary: 1,
    mediaLibrary: 36,
    scenarioProjects: 12,
  },
  stores: [
    ...betaV54Fixture.stores.slice(0, betaV54Fixture.stores.indexOf('state_manager')),
    'editor_vector_library',
    ...betaV54Fixture.stores.slice(betaV54Fixture.stores.indexOf('state_manager')),
  ],
  indexes: {
    ...betaV54Fixture.indexes,
    editor_vector_library: ['kind', 'definitionId', 'retentionReferenceKeys'],
  },
  records: { ...betaV54Fixture.records, editor_vector_library: [] },
} as const;
