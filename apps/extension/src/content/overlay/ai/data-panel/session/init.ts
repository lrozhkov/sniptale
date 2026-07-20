import { useEffect } from 'react';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { loadSpoilerState } from '../../persistence/spoiler-state';
import type { TreeNodeState } from '../types';
import { buildInitialTreeState } from './tree';

export function useTreeDataInitialization(props: {
  onSelectedDataChange: (selectedData: string) => void;
  setExcludedColumns: React.Dispatch<React.SetStateAction<Map<string, string[]>>>;
  setIsDataSpoilerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setTreeState: React.Dispatch<React.SetStateAction<Map<string, TreeNodeState>>>;
  treeData: ParsedDOMTree | null;
}) {
  const { onSelectedDataChange, setExcludedColumns, setIsDataSpoilerOpen, setTreeState, treeData } =
    props;

  useEffect(() => {
    if (!treeData) {
      setTreeState(new Map());
      setExcludedColumns(new Map());
      onSelectedDataChange('');
      return;
    }

    setTreeState(buildInitialTreeState(treeData));
    setExcludedColumns(new Map());
  }, [onSelectedDataChange, setExcludedColumns, setTreeState, treeData]);

  useEffect(() => {
    let isSubscribed = true;

    void loadSpoilerState().then((saved) => {
      if (isSubscribed) {
        setIsDataSpoilerOpen(saved);
      }
    });

    return () => {
      isSubscribed = false;
    };
  }, [setIsDataSpoilerOpen]);
}
