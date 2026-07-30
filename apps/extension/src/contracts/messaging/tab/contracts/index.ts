import { defineMessageContractRegistry } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import type { TabRequestByType, TabResponseByType } from '../index';
import { tabUiMessageContracts } from './ui';
import { tabVideoMessageContracts } from './video';
import { tabFullPageCaptureMessageContracts } from './full-page-capture';

const defineTabMessageRegistry = defineMessageContractRegistry<
  TabRequestByType,
  TabResponseByType
>();

export const tabMessageContracts = defineTabMessageRegistry({
  ...tabUiMessageContracts,
  ...tabVideoMessageContracts,
  ...tabFullPageCaptureMessageContracts,
});
