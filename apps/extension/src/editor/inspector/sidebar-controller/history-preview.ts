import { useRef } from 'react';
import { useEditorStore } from '../../state/useEditorStore';
import type { ImageEditorController } from '../../controller';

function createSnapshotKey(value: unknown): string {
  return JSON.stringify(value);
}

function readSelectionSnapshotKey(): string {
  return createSnapshotKey(useEditorStore.getState().selectionToolSettings);
}

export function useSelectionSettingsHistoryPreview(args: {
  controller: Pick<
    ImageEditorController,
    | 'applyActiveSettingsToSelection'
    | 'commitHistory'
    | 'previewActiveSettingsOnSelection'
    | 'refreshActiveToolSettingsPreview'
  >;
  selectionSettingsEnabled: boolean;
}) {
  const baselineRef = useRef<string | null>(null);

  function captureSelectionBaseline() {
    baselineRef.current ??= readSelectionSnapshotKey();
  }

  return {
    commitPendingSelectionSettings: () => {
      if (!args.selectionSettingsEnabled) {
        baselineRef.current = null;
        return;
      }

      const baseline = baselineRef.current;
      baselineRef.current = null;
      if (baseline === null) {
        return;
      }

      args.controller.previewActiveSettingsOnSelection();
      if (readSelectionSnapshotKey() !== baseline) {
        args.controller.commitHistory();
      }
    },
    previewSelectionSettings: (applyPreviewPatch?: () => void) => {
      if (!args.selectionSettingsEnabled) {
        baselineRef.current = null;
        applyPreviewPatch?.();
        args.controller.refreshActiveToolSettingsPreview();
        return;
      }

      captureSelectionBaseline();
      applyPreviewPatch?.();
      args.controller.previewActiveSettingsOnSelection();
    },
  };
}
