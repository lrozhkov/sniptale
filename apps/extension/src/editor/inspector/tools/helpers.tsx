import type { EditorToolSettings } from '../../../features/editor/document/tool-settings-types';
import { translate } from '../../../platform/i18n';
import {
  INSPECTOR_INLINE_BUTTON_CLASS_NAME,
  INSPECTOR_PRIMARY_BUTTON_CLASS_NAME,
  INSPECTOR_SECONDARY_BUTTON_CLASS_NAME,
} from '../chrome';
import { DimensionInput, updateLockedDraft } from '../sidebar-shared';
import { PanelSection } from './sections';

export const panelButtonClassName = INSPECTOR_INLINE_BUTTON_CLASS_NAME;
export const primaryPanelButtonClassName = INSPECTOR_PRIMARY_BUTTON_CLASS_NAME;
export const secondaryPanelButtonClassName = INSPECTOR_SECONDARY_BUTTON_CLASS_NAME;

export function renderLayerSizeInputs(args: {
  layerSizeDraft: { width: number; height: number };
  layerSizeLocked: boolean;
  layerAspectRatio: number | null;
  setLayerSizeDraft: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <DimensionInput
        label={translate('editor.compact.widthDimension')}
        value={args.layerSizeDraft.width}
        min={1}
        onChange={(value) =>
          args.setLayerSizeDraft((state) =>
            updateLockedDraft(state, 'width', value, args.layerSizeLocked, args.layerAspectRatio)
          )
        }
      />
      <DimensionInput
        label={translate('editor.compact.heightDimension')}
        value={args.layerSizeDraft.height}
        min={1}
        onChange={(value) =>
          args.setLayerSizeDraft((state) =>
            updateLockedDraft(state, 'height', value, args.layerSizeLocked, args.layerAspectRatio)
          )
        }
      />
    </div>
  );
}

export function selectSharedToolProps(props: {
  inspectorToolSettings: EditorToolSettings;
  previewColor: (setter: (value: string) => void, color: string) => void;
  recentColors: string[];
  updateColor: (setter: (value: string) => void, color: string) => void;
  toNumber: (value: string, fallback?: number) => number;
}) {
  return {
    inspectorToolSettings: props.inspectorToolSettings,
    previewColor: props.previewColor,
    recentColors: props.recentColors,
    updateColor: props.updateColor,
    toNumber: props.toNumber,
  };
}

export function renderDefaultToolInspector() {
  return (
    <PanelSection label={translate('editor.compact.state')}>
      <div className="text-sm leading-6 text-[color:var(--sniptale-color-text-secondary)]">
        {translate('editor.compact.chooseToolOrObject')}
      </div>
    </PanelSection>
  );
}
