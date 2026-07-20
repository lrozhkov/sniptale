import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  createViewerPreparationRoot,
  disposeViewerPreparationRoot,
  type ViewerPreparationRoot,
} from './root';
import { ViewerPreparationRuntime } from '../runtime';
import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';

export function SnapshotPreparationHost(props: {
  iframe: HTMLIFrameElement | null;
  manifest: WebSnapshotManifest;
  onViewportChange?: (viewport: { width: number; height: number } | null) => void;
}) {
  const root = useViewerPreparationRoot();

  if (!root) {
    return null;
  }

  return createPortal(
    <ViewerPreparationRuntime
      iframe={props.iframe}
      manifest={props.manifest}
      {...(props.onViewportChange === undefined
        ? {}
        : { onViewportChange: props.onViewportChange })}
    />,
    root.appContainer
  );
}

function useViewerPreparationRoot(): ViewerPreparationRoot | null {
  const [root, setRoot] = useState<ViewerPreparationRoot | null>(null);

  useEffect(() => {
    const nextRoot = createViewerPreparationRoot();
    setRoot(nextRoot);

    return () => {
      disposeViewerPreparationRoot(nextRoot);
    };
  }, []);

  return root;
}
