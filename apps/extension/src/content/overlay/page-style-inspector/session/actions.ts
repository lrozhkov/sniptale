import { useCallback } from 'react';
import {
  PAGE_STYLE_ASSET_KINDS,
  PAGE_STYLE_SCOPE_TYPES,
  type PageStyleAssetKind,
  type PageStyleAssetReference,
  type PageStyleDeclaration,
  type PageStylePatch,
  type PageStyleRestoreRule,
  type PageStyleTemplate,
} from '@sniptale/runtime-contracts/page-style';
import { translate } from '../../../../platform/i18n';
import { savePageStyleTemplateAndCleanupAssets } from '../../../../composition/persistence/page-style';
import {
  savePageStyleRestoreRule,
  savePageStyleTemplate,
} from '../../../../composition/persistence/page-style/storage';
import {
  appendPageStyleImageAsset,
  applyPageStylePatchWithHistory,
  applyPageStyleRestoreRuleWithHistory,
  createExactPageStyleScope,
  savePageStyleImageAsset,
} from '../runtime/actions';
import type { PageStyleSelectionSnapshot } from '../runtime/properties';
import { readPageStyleSelectionSnapshot } from '../runtime/properties';
import { createComputedPageStylePatch } from '../value-editing/state';
import {
  createDefaultRuleName,
  createDefaultTemplateName,
  createRuleContentRetention,
} from '../save/flow';
import type { PageStyleInspectorActionOutcome, PageStyleTemplateActionOutcome } from '../types';
import { cleanupRemovedDraftAssets, cleanupUnsavedDraftAsset } from './asset-cleanup';

type SelectionSetter = (selection: PageStyleSelectionSnapshot | null) => void;
type PageStyleSaveActionArgs = {
  draftPatch: PageStylePatch;
  includeComputedInTemplate: boolean;
  refresh: () => Promise<void>;
  retainImage: boolean;
  retainText: boolean;
  ruleName: string;
  selection: PageStyleSelectionSnapshot | null;
  templateName: string;
  values: Record<string, string>;
};

export function usePageStyleSelectionRefresh(args: {
  selection: PageStyleSelectionSnapshot | null;
  setSelection: SelectionSetter;
}) {
  return useCallback(() => {
    if (args.selection) {
      args.setSelection(readPageStyleSelectionSnapshot(args.selection.element));
    }
  }, [args]);
}

export function usePageStyleAssetActions(args: {
  draftPatch: PageStylePatch;
  refreshSelection: () => void;
  selection: PageStyleSelectionSnapshot | null;
  setAssetPatch: (patch: PageStylePatch) => void;
}) {
  const updateAssetPatch = useAssetPatchUpdater(args);
  const clearBackgroundAsset = useBackgroundAssetClearAction(args);
  const saveBackgroundAsset = useImageAssetSaveAction({
    kind: PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE,
    updateAssetPatch,
  });
  const saveImageReplacement = useImageAssetSaveAction({
    kind: PAGE_STYLE_ASSET_KINDS.IMAGE_REPLACEMENT,
    updateAssetPatch,
  });

  return { clearBackgroundAsset, saveBackgroundAsset, saveImageReplacement, updateAssetPatch };
}

function useAssetPatchUpdater(args: {
  draftPatch: PageStylePatch;
  refreshSelection: () => void;
  selection: PageStyleSelectionSnapshot | null;
  setAssetPatch: (patch: PageStylePatch) => void;
}) {
  return useCallback(
    async (asset: PageStyleAssetReference): Promise<PageStyleInspectorActionOutcome> => {
      if (!args.selection) {
        return undefined;
      }

      const previousPatch = args.draftPatch;
      const nextPatch = appendPageStyleImageAsset({ asset, patch: args.draftPatch });
      await applyPageStylePatchWithHistory({
        element: args.selection.element,
        patch: nextPatch,
        selector: args.selection.selector,
      });
      args.setAssetPatch({ assets: nextPatch.assets, declarations: nextPatch.declarations });
      args.refreshSelection();
      return await cleanupRemovedDraftAssets(previousPatch, nextPatch);
    },
    [args]
  );
}

function createClearBackgroundPatch(draftPatch: PageStylePatch): PageStylePatch {
  const clearDeclaration: PageStyleDeclaration = { property: 'background-image', value: 'none' };
  return {
    assets: draftPatch.assets.filter(
      (asset) => asset.kind !== PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE
    ),
    declarations: [
      ...draftPatch.declarations.filter(
        (declaration) => declaration.property !== 'background-image'
      ),
      clearDeclaration,
    ],
  };
}

function useBackgroundAssetClearAction(args: {
  draftPatch: PageStylePatch;
  refreshSelection: () => void;
  selection: PageStyleSelectionSnapshot | null;
  setAssetPatch: (patch: PageStylePatch) => void;
}) {
  return useCallback(async (): Promise<PageStyleInspectorActionOutcome> => {
    if (!args.selection) {
      return undefined;
    }

    const nextPatch = createClearBackgroundPatch(args.draftPatch);
    await applyPageStylePatchWithHistory({
      element: args.selection.element,
      patch: nextPatch,
      selector: args.selection.selector,
    });
    args.setAssetPatch({ assets: nextPatch.assets, declarations: nextPatch.declarations });
    args.refreshSelection();
    return await cleanupRemovedDraftAssets(args.draftPatch, nextPatch);
  }, [args]);
}

function useImageAssetSaveAction(args: {
  kind: PageStyleAssetKind;
  updateAssetPatch: (asset: PageStyleAssetReference) => Promise<PageStyleInspectorActionOutcome>;
}) {
  return useCallback(
    async (file: File): Promise<PageStyleInspectorActionOutcome> => {
      const asset = await savePageStyleImageAsset({ file, kind: args.kind });
      try {
        return await args.updateAssetPatch(asset);
      } catch (error) {
        await cleanupUnsavedDraftAsset(asset.assetId);
        throw error;
      }
    },
    [args]
  );
}

export function usePageStyleApplyActions(args: {
  refreshSelection: () => void;
  selection: PageStyleSelectionSnapshot | null;
  setAssetPatch: (patch: PageStylePatch) => void;
}) {
  const applyTemplate = useCallback(
    async (template: { patch: PageStylePatch }) => {
      if (!args.selection) {
        return;
      }

      await applyPageStylePatchWithHistory({
        element: args.selection.element,
        patch: template.patch,
        selector: args.selection.selector,
      });
      args.setAssetPatch({ assets: template.patch.assets, declarations: [] });
      args.refreshSelection();
    },
    [args]
  );

  const applyRule = useCallback(
    async (rule: PageStyleRestoreRule) => {
      await applyPageStyleRestoreRuleWithHistory(rule);
      args.refreshSelection();
    },
    [args]
  );

  return { applyRule, applyTemplate };
}

export function usePageStyleSaveActions(args: PageStyleSaveActionArgs) {
  const templateActions = usePageStyleTemplateSaveActions(args);
  const saveRule = usePageStyleRuleSaveAction(args);

  return { ...templateActions, saveRule };
}

function usePageStyleTemplateSaveActions(args: PageStyleSaveActionArgs) {
  const saveTemplate = useCallback(async () => {
    if (!args.selection) {
      return;
    }

    await savePageStyleTemplate({
      name: args.templateName.trim() || createDefaultTemplateName(),
      patch: createTemplatePatch(args),
    });
    await args.refresh();
  }, [args]);

  const renameTemplate = useCallback(
    async (template: PageStyleTemplate, name: string) => {
      await savePageStyleTemplate({
        id: template.id,
        name: name.trim() || template.name,
        patch: template.patch,
      });
      await args.refresh();
    },
    [args]
  );

  const updateTemplate = useCallback(
    async (template: PageStyleTemplate): Promise<PageStyleTemplateActionOutcome> => {
      if (!args.selection) {
        return undefined;
      }

      const result = await savePageStyleTemplateAndCleanupAssets({
        id: template.id,
        name: template.name,
        patch: createTemplatePatch(args),
      });
      await args.refresh();
      if (result.cleanupFailedAssetIds.length > 0) {
        return {
          message: translate('content.pageStyleInspector.templateCleanupWarning'),
          state: 'warning',
        };
      }
      return undefined;
    },
    [args]
  );

  return { renameTemplate, saveTemplate, updateTemplate };
}

function usePageStyleRuleSaveAction(args: PageStyleSaveActionArgs) {
  return useCallback(async () => {
    if (!args.selection) {
      return;
    }

    await savePageStyleRestoreRule(createRuleInput({ ...args, selection: args.selection }));
    await args.refresh();
  }, [args]);
}

function createTemplatePatch(args: {
  draftPatch: PageStylePatch;
  includeComputedInTemplate: boolean;
  values: Record<string, string>;
}): PageStylePatch {
  return args.includeComputedInTemplate
    ? createComputedPageStylePatch({ assets: args.draftPatch.assets, values: args.values })
    : args.draftPatch;
}

function createRuleInput(args: {
  draftPatch: PageStylePatch;
  retainImage: boolean;
  retainText: boolean;
  ruleName: string;
  selection: PageStyleSelectionSnapshot;
}) {
  const retention = createRuleContentRetention({
    patch: args.draftPatch,
    retainImage: args.retainImage,
    retainText: args.retainText,
    selection: args.selection,
  });
  const pageScope = createExactPageStyleScope();
  const ruleInput = {
    name: args.ruleName.trim() || createDefaultRuleName(args.selection),
    patch: args.draftPatch,
    scope: { ...pageScope, active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS },
    selector: args.selection.selector,
  };

  return retention?.text || retention?.image
    ? { ...ruleInput, contentRetention: retention }
    : ruleInput;
}
