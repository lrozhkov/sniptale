import { useRef, useState } from 'react';
import type { TreeNodeState } from '../types';

export function useDataPanelBaseState() {
  const [showDataPreview, setShowDataPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [treeState, setTreeState] = useState<Map<string, TreeNodeState>>(new Map());
  const [excludedColumns, setExcludedColumns] = useState<Map<string, string[]>>(new Map());
  const [isDataSpoilerOpen, setIsDataSpoilerOpen] = useState(false);
  const [isDataResizing, setIsDataResizing] = useState(false);
  const [isJsonResizing, setIsJsonResizing] = useState(false);
  const dataContainerRef = useRef<HTMLDivElement>(null);
  const jsonPreviewRef = useRef<HTMLPreElement>(null);

  return {
    copied,
    dataContainerRef,
    excludedColumns,
    isDataResizing,
    isDataSpoilerOpen,
    isJsonResizing,
    jsonPreviewRef,
    setCopied,
    setExcludedColumns,
    setIsDataResizing,
    setIsDataSpoilerOpen,
    setIsJsonResizing,
    setShowDataPreview,
    setTreeState,
    showDataPreview,
    treeState,
  };
}
