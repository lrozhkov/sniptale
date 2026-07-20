import { useCallback } from 'react';
import {
  PAGE_STYLE_SCOPE_TYPES,
  type PageStyleRestoreRule,
  type PageStyleScope,
} from '@sniptale/runtime-contracts/page-style';
import { translate } from '../../../platform/i18n';
import {
  setPageStyleRestoreRuleEnabled,
  updatePageStyleRestoreRuleScope,
} from '../../../composition/persistence/page-style/storage';
import { deletePageStyleRestoreRuleAndCleanupAssets } from '../../../composition/persistence/page-style';
import type { PageStyleRuleDraft } from './types';

type RunMutation = (
  task: () => Promise<string | null>,
  fallbackKey: 'deleteError' | 'saveError'
) => Promise<void>;

function deriveDomainFromAddress(exactAddress: string): string {
  try {
    return new URL(exactAddress).hostname;
  } catch {
    return '';
  }
}

function buildScopeFromDraft(draft: PageStyleRuleDraft): PageStyleScope {
  const exactAddress = draft.exactAddress.trim();
  const domain =
    draft.domain.trim() ||
    (draft.active === PAGE_STYLE_SCOPE_TYPES.DOMAIN ? deriveDomainFromAddress(exactAddress) : '');

  return {
    active: draft.active,
    ...(domain ? { domain } : { domain: null }),
    exactAddress,
  };
}

export function useRuleStorageActions(args: {
  drafts: Record<string, PageStyleRuleDraft>;
  runMutation: RunMutation;
}) {
  const toggleEnabled = useCallback(
    async (rule: PageStyleRestoreRule) =>
      args.runMutation(async () => {
        await setPageStyleRestoreRuleEnabled(rule.id, !rule.enabled);
        return translate('settings.pageStyles.saved');
      }, 'saveError'),
    [args]
  );
  const saveScope = useCallback(
    async (ruleId: string) => saveRuleScope({ ...args, ruleId }),
    [args]
  );
  const deleteRule = useCallback(
    async (ruleId: string) => deleteStoredRule({ ...args, ruleId }),
    [args]
  );

  return { deleteRule, saveScope, toggleEnabled };
}

async function saveRuleScope(args: {
  drafts: Record<string, PageStyleRuleDraft>;
  ruleId: string;
  runMutation: RunMutation;
}) {
  const draft = args.drafts[args.ruleId];
  if (!draft) {
    return;
  }

  await args.runMutation(async () => {
    await updatePageStyleRestoreRuleScope(args.ruleId, buildScopeFromDraft(draft));
    return translate('settings.pageStyles.saved');
  }, 'saveError');
}

async function deleteStoredRule(args: { ruleId: string; runMutation: RunMutation }) {
  await args.runMutation(async () => {
    const result = await deletePageStyleRestoreRuleAndCleanupAssets(args.ruleId);
    return result.cleanupFailedAssetIds.length > 0
      ? translate('settings.pageStyles.deletedWithCleanupWarning')
      : result.deleted
        ? translate('settings.pageStyles.deleted')
        : null;
  }, 'deleteError');
}
