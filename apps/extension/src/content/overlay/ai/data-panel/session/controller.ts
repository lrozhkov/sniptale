import { useLayoutEffect } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import { formatSelectedDataJson } from '../json/format';
import { useDataPanelBaseState } from './base';
import { useTreeDataInitialization } from './init';
import { useSelectedDataState } from './selected';
import { createAIModalDataPanelActions } from './actions';
import type { AIModalDataPanelProps } from '../types';
import { buildAIModalDataPanelViewState } from './view-state';

const logger = createLogger({ namespace: 'ContentAiDataPanelState' });

function countSelectedNodes(treeState: Map<string, { selected: boolean }>) {
  return [...treeState.values()].filter((state) => state.selected).length;
}

function useSelectedDataChangeEffect(args: {
  base: ReturnType<typeof useDataPanelBaseState>;
  derived: ReturnType<typeof useSelectedDataState>;
  onSelectedDataChange: (selectedData: string) => void;
  treeData: AIModalDataPanelProps['treeData'];
}): void {
  const { base, derived, onSelectedDataChange, treeData } = args;

  useLayoutEffect(() => {
    logger.debug('AI pick selectedData changed', {
      derivedLength: derived.selectedData.length,
      hasTreeData: Boolean(treeData),
      selectedIdsCount: countSelectedNodes(base.treeState),
    });
    onSelectedDataChange(derived.selectedData);
  }, [base.treeState, derived.selectedData, onSelectedDataChange, treeData]);
}

function logDataPanelRenderState(args: {
  formattedJSON: string;
  selectedData: string;
  selectedDataProp: string;
}): void {
  logger.debug('AI pick data-panel render state', {
    derivedLength: args.selectedData.length,
    effectiveLength: args.selectedData.length,
    formattedLength: args.formattedJSON.length,
    selectedDataPropLength: args.selectedDataProp.length,
    selectedDataPropMatchesDerived: args.selectedDataProp === args.selectedData,
  });
}

export function useAIModalDataPanelState({
  treeData,
  onSelectedDataChange,
  selectedData,
}: Pick<AIModalDataPanelProps, 'onSelectedDataChange' | 'selectedData' | 'treeData'>) {
  const base = useDataPanelBaseState();

  useTreeDataInitialization({
    onSelectedDataChange,
    setExcludedColumns: base.setExcludedColumns,
    setIsDataSpoilerOpen: base.setIsDataSpoilerOpen,
    setTreeState: base.setTreeState,
    treeData,
  });

  const derived = useSelectedDataState({
    excludedColumns: base.excludedColumns,
    treeData,
    treeState: base.treeState,
  });

  useSelectedDataChangeEffect({ base, derived, onSelectedDataChange, treeData });
  const actions = createAIModalDataPanelActions({ base, derived, treeData });
  const formattedJSON = formatSelectedDataJson(derived.selectedData);

  logDataPanelRenderState({
    formattedJSON,
    selectedData: derived.selectedData,
    selectedDataProp: selectedData,
  });

  return buildAIModalDataPanelViewState({
    actions,
    base,
    derived: {
      ...derived,
      formattedJSON,
      selectedData: derived.selectedData,
    },
  });
}
