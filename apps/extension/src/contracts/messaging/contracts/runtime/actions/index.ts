import { runtimeActionCaptureMessageContracts } from './capture';
import { runtimeActionCoreMessageContracts } from './core';
import { runtimeActionExportMessageContracts } from './export';
import { runtimeActionScenarioMessageContracts } from '../../../scenario/actions';
import { runtimeActionSaveMessageContracts } from './save';
import type { PartialRuntimeRegistry } from '../../runtime-message.registry.ts';

export const runtimeActionMessageContracts = {
  ...runtimeActionCoreMessageContracts,
  ...runtimeActionScenarioMessageContracts,
  ...runtimeActionSaveMessageContracts,
  ...runtimeActionExportMessageContracts,
  ...runtimeActionCaptureMessageContracts,
} satisfies PartialRuntimeRegistry;
