import { runtimeVideoOffscreenMessageContracts } from './offscreen';
import { runtimeVideoSessionMessageContracts } from './session';
import type { PartialRuntimeRegistry } from '../../runtime-message.registry.ts';

export const runtimeVideoRecordingMessageContracts = {
  ...runtimeVideoSessionMessageContracts,
  ...runtimeVideoOffscreenMessageContracts,
} satisfies PartialRuntimeRegistry;
