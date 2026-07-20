import type { PageProfile } from '@sniptale/runtime-contracts/dom-tree';

type ParserBackendFailureContext = {
  backendId: string;
  pageProfile: PageProfile;
};

export class ParserBackendExecutionError extends Error {
  readonly backendId: string;
  readonly pipelineId: PageProfile['pipelineId'];
  readonly profileId: string;

  constructor(context: ParserBackendFailureContext, cause: unknown) {
    const profileId = `${context.pageProfile.vendor}/${context.pageProfile.pageKind}`;
    super(
      `Parser backend ${context.backendId} failed for ${profileId} via ${context.pageProfile.pipelineId}.`,
      { cause }
    );
    this.name = 'ParserBackendExecutionError';
    this.backendId = context.backendId;
    this.pipelineId = context.pageProfile.pipelineId;
    this.profileId = profileId;
  }
}
