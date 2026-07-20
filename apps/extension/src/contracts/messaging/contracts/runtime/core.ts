import { runtimeActionMessageContracts } from './actions';
import { runtimeModeMessageContracts } from './mode';
import { runtimeNativeAppMessageContracts } from './native-app';
import type { PartialRuntimeRegistry } from '../runtime-message.registry.ts';

export const runtimeCoreMessageContracts = {
  ...runtimeModeMessageContracts,
  ...runtimeActionMessageContracts,
  ...runtimeNativeAppMessageContracts,
} satisfies PartialRuntimeRegistry;
