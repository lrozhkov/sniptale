import { defineMessageContractRegistry } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import type { RuntimeRequestByType, RuntimeResponseByType } from '../runtime-message/index';
import { runtimeCoreMessageContracts } from './core';
import { runtimeVideoMessageContracts } from './video';
import { runtimeVoiceInputMessageContracts } from './voice-input';

const defineRuntimeMessageRegistry = defineMessageContractRegistry<
  RuntimeRequestByType,
  RuntimeResponseByType
>();

export const runtimeMessageContracts = defineRuntimeMessageRegistry({
  ...runtimeCoreMessageContracts,
  ...runtimeVideoMessageContracts,
  ...runtimeVoiceInputMessageContracts,
});
