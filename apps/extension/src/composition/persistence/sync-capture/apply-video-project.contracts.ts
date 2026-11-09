import type { SyncConnectionIdentity } from '../remote-connection/model';
import type { MediaLibraryEntry } from '../media-library/contracts';
import type { AssetRef } from '../assets/contracts';
import type { PreparedScenarioProjectDependency } from './scenario-dependencies';
import type {
  PreparedVideoProjectReplicaRoot,
  hydratePreparedVideoProjectReplicaRoot,
} from './prepared-project';

export interface PreparedVideoProjectDependency {
  entry: MediaLibraryEntry;
  ref: AssetRef;
  expectedGeneration: number;
  expectedBasis: readonly string[];
}

export interface ApplyPreparedVideoProjectRevisionInput {
  authorization?: SyncConnectionIdentity;
  root: PreparedVideoProjectReplicaRoot;
  operationId: string;
  sourceDigest: string;
  connectionGeneration: number;
  spaceId: string;
  profileCreatedAt: number;
  expectedBasis: readonly string[];
  expectedLocalGeneration: number;
  expectedWorkspaceRevision: number | null;
  dependencies: readonly PreparedVideoProjectDependency[];
  rootDependencies?: readonly PreparedScenarioProjectDependency[];
}

export type HydratedProjectInput = Omit<ApplyPreparedVideoProjectRevisionInput, 'root'> & {
  root: Awaited<ReturnType<typeof hydratePreparedVideoProjectReplicaRoot>>;
};

export class VideoProjectApplyConflictError extends Error {
  constructor(
    readonly code:
      | 'invalid-input'
      | 'unsupported-project'
      | 'profile-changed'
      | 'project-changed'
      | 'dependency-changed'
      | 'pending-local-change'
  ) {
    super(`Prepared project application refused: ${code}.`);
    this.name = 'VideoProjectApplyConflictError';
  }
}
