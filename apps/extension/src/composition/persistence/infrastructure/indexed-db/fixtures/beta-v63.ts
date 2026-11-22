import { betaV62Fixture } from './beta-v62';

/** Retained local revisions prevent stale writes after Scenario identity reuse. */
export const betaV63Fixture = {
  ...betaV62Fixture,
  databaseVersion: 63,
  expectedDigest: 'e491798c0f9c39e207e58628a942c734217dff63a635e1ec3d2d36d069a2bbec',
  domainVersions: { ...betaV62Fixture.domainVersions, scenarioProjects: 13 },
  stores: [
    ...betaV62Fixture.stores.slice(0, betaV62Fixture.stores.indexOf('scenario_projects')),
    'scenario_project_revisions',
    ...betaV62Fixture.stores.slice(betaV62Fixture.stores.indexOf('scenario_projects')),
  ],
  indexes: { ...betaV62Fixture.indexes, scenario_project_revisions: [] },
  records: { ...betaV62Fixture.records, scenario_project_revisions: [] },
} as const;
