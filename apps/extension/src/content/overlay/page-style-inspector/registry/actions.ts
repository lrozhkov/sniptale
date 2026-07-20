import { useCallback } from 'react';
import type {
  PageStyleRestoreRule,
  PageStyleTemplate,
} from '@sniptale/runtime-contracts/page-style';
import {
  deletePageStyleRestoreRuleAndCleanupAssets,
  deletePageStyleTemplateAndCleanupAssets,
} from '../../../../composition/persistence/page-style';
import {
  savePageStyleTemplate,
  setPageStyleRestoreRuleEnabled,
} from '../../../../composition/persistence/page-style/storage';
import { translate } from '../../../../platform/i18n';
import { createDefaultTemplateName } from '../save/flow';

export function usePageStyleRegistryActions(refresh: () => Promise<void>) {
  const deleteTemplate = useDeleteTemplateAction(refresh);
  const duplicateTemplate = useDuplicateTemplateAction(refresh);
  const deleteRule = useDeleteRuleAction(refresh);
  const toggleRuleEnabled = useToggleRuleEnabledAction(refresh);

  return { deleteRule, deleteTemplate, duplicateTemplate, toggleRuleEnabled };
}

function useDeleteTemplateAction(refresh: () => Promise<void>) {
  return useCallback(
    async (template: PageStyleTemplate) => {
      const result = await deletePageStyleTemplateAndCleanupAssets(template.id);
      await refresh();
      if (result.cleanupFailedAssetIds.length > 0) {
        return {
          message: translate('content.pageStyleInspector.templateCleanupWarning'),
          state: 'warning' as const,
        };
      }
      return undefined;
    },
    [refresh]
  );
}

function useDuplicateTemplateAction(refresh: () => Promise<void>) {
  return useCallback(
    async (template: PageStyleTemplate) => {
      await savePageStyleTemplate({
        name: `${template.name} ${createDefaultTemplateName()}`,
        patch: template.patch,
      });
      await refresh();
    },
    [refresh]
  );
}

function useDeleteRuleAction(refresh: () => Promise<void>) {
  return useCallback(
    async (rule: PageStyleRestoreRule) => {
      const result = await deletePageStyleRestoreRuleAndCleanupAssets(rule.id);
      await refresh();
      if (result.cleanupFailedAssetIds.length > 0) {
        return {
          message: translate('content.pageStyleInspector.templateCleanupWarning'),
          state: 'warning' as const,
        };
      }
      return undefined;
    },
    [refresh]
  );
}

function useToggleRuleEnabledAction(refresh: () => Promise<void>) {
  return useCallback(
    async (rule: PageStyleRestoreRule) => {
      await setPageStyleRestoreRuleEnabled(rule.id, !rule.enabled);
      await refresh();
    },
    [refresh]
  );
}
