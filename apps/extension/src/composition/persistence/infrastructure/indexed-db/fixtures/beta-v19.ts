import { betaV18Fixture } from './beta-v18';

/** Empty scenario history admission preserves every released project and immutable object. */
export const betaV19Fixture = {
  ...betaV18Fixture,
  databaseVersion: 19,
  expectedDigest: '54c90832852805bc8d24752436c5e65a0ad3995ee3be2edc3a45ad2372c58bbe',
  domainVersions: { ...betaV18Fixture.domainVersions, scenarioProjects: 5 },
  stores: [
    ...betaV18Fixture.stores.slice(0, betaV18Fixture.stores.indexOf('project_assets')),
    'scenario_project_history',
    ...betaV18Fixture.stores.slice(betaV18Fixture.stores.indexOf('project_assets')),
  ],
  indexes: { ...betaV18Fixture.indexes, scenario_project_history: ['projectId'] },
  records: { ...betaV18Fixture.records, scenario_project_history: [] },
} as const;
