import { betaV61Fixture } from './beta-v61';

/** Image lifetime admission adds an empty fence store without changing released user records. */
export const betaV62Fixture = {
  ...betaV61Fixture,
  databaseVersion: 62,
  expectedDigest: '0c6112f0d59c6a6a3e3338e600b8330725cc768a0265b3f6a9e153cac0fb75bf',
  domainVersions: { ...betaV61Fixture.domainVersions, mediaLibrary: 40 },
  stores: [
    ...betaV61Fixture.stores.slice(0, betaV61Fixture.stores.indexOf('image_workspaces') + 1),
    'image_workspace_identities',
    ...betaV61Fixture.stores.slice(betaV61Fixture.stores.indexOf('image_workspaces') + 1),
  ],
  indexes: { ...betaV61Fixture.indexes, image_workspace_identities: [] },
  records: { ...betaV61Fixture.records, image_workspace_identities: [] },
} as const;
