import { betaV19Fixture } from './beta-v19';

/** Empty unit admission preserves released full-project and historical records. */
export const betaV20Fixture = {
  ...betaV19Fixture,
  databaseVersion: 20,
  expectedDigest: '95aea164906890e78fbe88b4dd223e7cd8dbd60f7fca3eb6b9e5540fae92eb03',
  domainVersions: { ...betaV19Fixture.domainVersions, scenarioProjects: 6 },
  stores: [
    ...betaV19Fixture.stores.slice(0, betaV19Fixture.stores.indexOf('project_assets')),
    'scenario_project_units',
    ...betaV19Fixture.stores.slice(betaV19Fixture.stores.indexOf('project_assets')),
  ],
  indexes: { ...betaV19Fixture.indexes, scenario_project_units: ['projectId'] },
  records: { ...betaV19Fixture.records, scenario_project_units: [] },
} as const;
