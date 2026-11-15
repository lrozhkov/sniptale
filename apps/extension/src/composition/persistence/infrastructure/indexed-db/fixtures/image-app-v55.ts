import { imageAppV54Fixture } from './image-app-v54';

/** Vector backing adds an empty durable store while preserving all released records and bytes. */
export const imageAppV55Fixture = {
  ...imageAppV54Fixture,
  databaseVersion: 55,
  expectedDigest: '53e7708ee9a94719c09e518f5c3a324b20e9325878bf6b9cbe4a12378746b7cd',
  domainVersions: {
    ...imageAppV54Fixture.domainVersions,
    editorVectorLibrary: 1,
    mediaLibrary: 36,
    scenarioProjects: 12,
  },
  stores: [
    ...imageAppV54Fixture.stores.slice(0, imageAppV54Fixture.stores.indexOf('state_manager')),
    'editor_vector_library',
    ...imageAppV54Fixture.stores.slice(imageAppV54Fixture.stores.indexOf('state_manager')),
  ],
  indexes: {
    ...imageAppV54Fixture.indexes,
    editor_vector_library: ['kind', 'definitionId', 'retentionReferenceKeys'],
  },
  records: { ...imageAppV54Fixture.records, editor_vector_library: [] },
} as const;
