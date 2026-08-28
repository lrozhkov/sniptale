import { runtimeActionCaptureMessageContracts } from './capture';
import { runtimeActionCoreMessageContracts } from './core';
import { runtimeActionExportMessageContracts } from './export';
import { runtimeActionScenarioMessageContracts } from '../../../scenario/actions';
import { runtimeActionSaveMessageContracts } from './save';
import { runtimeActionPagePackageDownloadLeaseContracts } from './page-package-download-lease';
import { runtimeActionPagePackageStagingContracts } from './page-package-staging';
import type { PartialRuntimeRegistry } from '../../runtime-message.registry.ts';

export const runtimeActionMessageContracts = {
  ...runtimeActionCoreMessageContracts,
  ...runtimeActionScenarioMessageContracts,
  ...runtimeActionSaveMessageContracts,
  ...runtimeActionExportMessageContracts,
  ...runtimeActionCaptureMessageContracts,
  ...runtimeActionPagePackageDownloadLeaseContracts,
  ...runtimeActionPagePackageStagingContracts,
} satisfies PartialRuntimeRegistry;
