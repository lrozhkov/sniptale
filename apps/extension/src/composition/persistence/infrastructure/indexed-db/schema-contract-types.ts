import type { EXPECTED_STORES } from './core.stores';
import type { DatabaseMigrationSource, UpgradeDatabase, UpgradeTransaction } from './upgrade/types';

export type PersistenceDomainId =
  | 'assetGraph'
  | 'diagnostics'
  | 'editorAssets'
  | 'effects'
  | 'mediaLibrary'
  | 'recordings'
  | 'runtimeRecovery'
  | 'scenarioProjects'
  | 'snapshots'
  | 'videoProjects';

type DatabaseMigrationRisk = 'additive' | 'destructive' | 'transforming';

export interface DatabaseMigrationDescriptor {
  backupCoverage: 'full' | 'none';
  domainVersions: readonly {
    domainId: PersistenceDomainId;
    from: number;
    to: number;
  }[];
  estimateAdditionalBytes(source?: DatabaseMigrationSource): Promise<number>;
  fromDatabaseVersion: number;
  migrate(db: UpgradeDatabase, transaction: UpgradeTransaction): undefined;
  risk: DatabaseMigrationRisk;
  stores: readonly Exclude<(typeof EXPECTED_STORES)[number], 'schema_contracts'>[];
  toDatabaseVersion: number;
  validate(db: UpgradeDatabase, transaction: UpgradeTransaction): undefined;
}
