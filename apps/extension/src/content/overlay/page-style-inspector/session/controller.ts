import {
  usePageStyleApplyActions,
  usePageStyleAssetActions,
  usePageStyleSaveActions,
  usePageStyleSelectionRefresh,
} from './actions';
import { usePageStyleDraftState } from './draft';
import { usePageStyleRegistryActions } from '../registry/actions';
import { useInspectorOpenState, useInspectorSelection, useRegistryData } from './hooks';
import { usePageStyleValueActions } from '../value-editing/actions';

interface UsePageStyleInspectorControllerParams {
  quickEditDocumentMode: boolean;
  quickEditMode: boolean;
}

type OpenState = ReturnType<typeof useInspectorOpenState>;
type DraftState = ReturnType<typeof usePageStyleDraftState>;
type RegistryActions = ReturnType<typeof usePageStyleRegistryActions>;
type ValueActions = ReturnType<typeof usePageStyleValueActions>;
type AssetActions = ReturnType<typeof usePageStyleAssetActions>;
type ApplyActions = ReturnType<typeof usePageStyleApplyActions>;
type SaveActions = ReturnType<typeof usePageStyleSaveActions>;

export function usePageStyleInspectorController(params: UsePageStyleInspectorControllerParams) {
  const openState = useInspectorOpenState(params.quickEditDocumentMode);
  const { selection, setSelection } = useInspectorSelection({
    open: openState.open,
    quickEditDocumentMode: params.quickEditDocumentMode,
    quickEditMode: params.quickEditMode,
  });
  const registryData = useRegistryData(openState.open);
  const registryActions = usePageStyleRegistryActions(registryData.refresh);
  const draftState = usePageStyleDraftState(selection);
  const valueActions = usePageStyleValueActions({
    defaultValues: draftState.defaultValues,
    selection,
    setValues: draftState.setValues,
  });
  const refreshSelection = usePageStyleSelectionRefresh({ selection, setSelection });
  const interactionActions = usePageStyleInteractionActions({
    draftState,
    refresh: registryData.refresh,
    refreshSelection,
    selection,
  });

  return {
    actions: createControllerActions({
      applyActions: interactionActions.applyActions,
      assetActions: interactionActions.assetActions,
      draftState,
      openState,
      registryActions,
      saveActions: interactionActions.saveActions,
      valueActions,
    }),
    inspectorOpen: openState.open && params.quickEditMode && !params.quickEditDocumentMode,
    toggleInspector: () =>
      !params.quickEditDocumentMode && openState.setOpen((current) => !current),
    viewState: createViewState({
      activeTab: openState.activeTab,
      draftState,
      registryData,
      selection,
    }),
  };
}

function usePageStyleInteractionActions(args: {
  draftState: DraftState;
  refresh: () => Promise<void>;
  refreshSelection: () => void;
  selection: ReturnType<typeof useInspectorSelection>['selection'];
}) {
  const assetActions = usePageStyleAssetActions({
    draftPatch: args.draftState.draftPatch,
    refreshSelection: args.refreshSelection,
    selection: args.selection,
    setAssetPatch: args.draftState.setAssetPatch,
  });
  const applyActions = usePageStyleApplyActions({
    refreshSelection: args.refreshSelection,
    selection: args.selection,
    setAssetPatch: args.draftState.setAssetPatch,
  });
  const saveActions = usePageStyleSaveActions({
    ...args.draftState,
    refresh: args.refresh,
    selection: args.selection,
  });

  return { applyActions, assetActions, saveActions };
}

function createControllerActions(args: {
  applyActions: ApplyActions;
  assetActions: AssetActions;
  draftState: DraftState;
  openState: OpenState;
  registryActions: RegistryActions;
  saveActions: SaveActions;
  valueActions: ValueActions;
}) {
  return {
    applyRule: args.applyActions.applyRule,
    applyTemplate: args.applyActions.applyTemplate,
    clearBackgroundAsset: args.assetActions.clearBackgroundAsset,
    close: () => args.openState.setOpen(false),
    deleteRule: args.registryActions.deleteRule,
    deleteTemplate: args.registryActions.deleteTemplate,
    duplicateTemplate: args.registryActions.duplicateTemplate,
    renameTemplate: args.saveActions.renameTemplate,
    resetValue: args.valueActions.resetValue,
    saveBackgroundAsset: args.assetActions.saveBackgroundAsset,
    saveImageReplacement: args.assetActions.saveImageReplacement,
    saveRule: args.saveActions.saveRule,
    saveTemplate: args.saveActions.saveTemplate,
    setActiveTab: args.openState.setActiveTab,
    setIncludeComputedInTemplate: args.draftState.setIncludeComputedInTemplate,
    setRuleQuery: args.draftState.setRuleQuery,
    setRuleName: args.draftState.setRuleName,
    setRetainImage: args.draftState.setRetainImage,
    setRetainText: args.draftState.setRetainText,
    setSideFieldLinked: args.draftState.setSideFieldLinked,
    setTemplateQuery: args.draftState.setTemplateQuery,
    setTemplateName: args.draftState.setTemplateName,
    toggleRuleEnabled: args.registryActions.toggleRuleEnabled,
    updateTemplate: args.saveActions.updateTemplate,
    updateAssetPatch: args.assetActions.updateAssetPatch,
    updateValue: args.valueActions.updateValue,
    updateValues: args.valueActions.updateValues,
  };
}

function createViewState(args: {
  activeTab: OpenState['activeTab'];
  draftState: DraftState;
  registryData: ReturnType<typeof useRegistryData>;
  selection: ReturnType<typeof useInspectorSelection>['selection'];
}) {
  return {
    activeTab: args.activeTab,
    defaultValues: args.draftState.defaultValues,
    draftPatch: args.draftState.draftPatch,
    includeComputedInTemplate: args.draftState.includeComputedInTemplate,
    modifiedProperties: args.draftState.modifiedProperties,
    registryError: args.registryData.error,
    registryLoading: args.registryData.loading,
    ruleName: args.draftState.ruleName,
    ruleQuery: args.draftState.ruleQuery,
    rules: args.registryData.rules,
    retainImage: args.draftState.retainImage,
    retainText: args.draftState.retainText,
    selection: args.selection,
    sideFieldLinks: args.draftState.sideFieldLinks,
    templateQuery: args.draftState.templateQuery,
    templateName: args.draftState.templateName,
    templates: args.registryData.templates,
    values: args.draftState.values,
  };
}
