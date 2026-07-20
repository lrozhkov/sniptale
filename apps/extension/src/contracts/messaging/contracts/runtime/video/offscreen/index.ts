import { runtimeVideoOffscreenControlMessageContracts } from './control';
import { runtimeVideoOffscreenEventMessageContracts } from './events';
import { runtimeVideoOffscreenViewportMessageContracts } from './viewport';
import type { PartialRuntimeRegistry } from '../../../runtime-message.registry.ts';

export const runtimeVideoOffscreenMessageContracts = {
  ...runtimeVideoOffscreenControlMessageContracts,
  ...runtimeVideoOffscreenViewportMessageContracts,
  ...runtimeVideoOffscreenEventMessageContracts,
} satisfies PartialRuntimeRegistry;
