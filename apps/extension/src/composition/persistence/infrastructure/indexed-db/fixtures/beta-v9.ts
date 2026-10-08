import { betaV8Fixture } from './beta-v8';

/** Native usage indexes add no authoritative rows or media copies. */
export const betaV9Fixture = {
  ...betaV8Fixture,
  databaseVersion: 9,
  expectedDigest: '0ccd74861e9c966967bff71ce5ef8a8f4f3ea174f533367e2aba191558bd5cfa',
  domainVersions: {
    ...betaV8Fixture.domainVersions,
    mediaLibrary: 8,
    videoProjects: 3,
    scenarioProjects: 4,
  },
  indexes: {
    ...betaV8Fixture.indexes,
    video_projects: ['updatedAt', 'usageReferenceKeys'],
    video_workspaces: ['updatedAt', 'usageReferenceKeys'],
    project_assets: ['createdAt', 'originMediaId'],
    scenario_assets: ['projectId', 'createdAt', 'borrowedMediaId', 'galleryAssetId'],
  },
} as const;
