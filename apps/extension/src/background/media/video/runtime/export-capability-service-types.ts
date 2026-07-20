import type { VideoProjectExportSettings } from '../../../../features/video/project/types';

export const projectExportCapabilityPolicyState = {
  policyStateId: 'project-export-capabilities',
} as const;

type ProjectExportCapabilityBaseArgs = {
  documentId: string;
  jobId: string;
  senderUrl: string;
};

type ProjectExportCapabilityTokenArgs = ProjectExportCapabilityBaseArgs & {
  token: string;
};

type ProjectExportCapabilityStartArgs = ProjectExportCapabilityBaseArgs & {
  settings: VideoProjectExportSettings;
};

export type ProjectExportCapabilityService = {
  clearCacheForTests(): void;
  consumeProjectExportCancelCapability(args: ProjectExportCapabilityTokenArgs): Promise<boolean>;
  consumeProjectExportStartCapability(
    args: ProjectExportCapabilityStartArgs & ProjectExportCapabilityTokenArgs
  ): Promise<boolean>;
  issueProjectExportCancelCapability(args: ProjectExportCapabilityBaseArgs): Promise<string>;
  issueProjectExportStartCapability(args: ProjectExportCapabilityStartArgs): Promise<string>;
  resetForTests(): void;
};
