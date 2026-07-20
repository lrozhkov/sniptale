import { useMemo } from 'react';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { formatSelectedDataJson } from '../json/format';
import type { TreeNodeState } from '../types';
import { getSelectionFlags } from './flags';
import { buildSelectedDataPayload } from './payload';
import { getDataSpoilerSummary } from './summary';

export function useSelectedDataState(props: {
  excludedColumns: Map<string, string[]>;
  treeData: ParsedDOMTree | null;
  treeState: Map<string, TreeNodeState>;
}) {
  const { excludedColumns, treeData, treeState } = props;

  const selectedData = useMemo(() => {
    if (!treeData) {
      return '';
    }

    return buildSelectedDataPayload(excludedColumns, treeData, treeState);
  }, [excludedColumns, treeData, treeState]);

  const formattedJSON = useMemo(() => formatSelectedDataJson(selectedData), [selectedData]);

  const spoilerSummary = useMemo(
    () => getDataSpoilerSummary(treeData, treeState),
    [treeData, treeState]
  );

  const { isAnyExpanded, isAnySelected } = useMemo(() => getSelectionFlags(treeState), [treeState]);

  return {
    formattedJSON,
    isAnyExpanded,
    isAnySelected,
    selectedData,
    spoilerSummary,
  };
}
