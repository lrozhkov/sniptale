import { runtimeVideoExportMessageContracts } from './export';
import { runtimeVideoRecordingMessageContracts } from './recording';
import type { PartialRuntimeRegistry } from '../../runtime-message.registry.ts';

export const runtimeVideoMessageContracts = {
  ...runtimeVideoRecordingMessageContracts,
  ...runtimeVideoExportMessageContracts,
} satisfies PartialRuntimeRegistry;
