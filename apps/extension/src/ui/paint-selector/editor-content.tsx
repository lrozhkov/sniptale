import type { ReactNode } from 'react';
import type {
  GradientStop,
  GradientType,
  Paint,
  PaintStopIdFactory,
} from '@sniptale/foundation/paint';
import type { ColorSelectorFormatMode } from '@sniptale/ui/color-selector/types';
import type { useEyedropper } from '@sniptale/ui/color-selector/popover-state';
import { translate } from '../../platform/i18n';
import { ColorEditorPanel } from '../color-selector/editor-panel';
import { ColorSelectorSwatchSection } from '../color-selector/swatch-section';
import { GradientEditor } from './gradient-editor';
import { GradientTypeSelector } from './mode-selector';

type EditorOptions = {
  draft: Paint;
  original: Paint;
  palette: readonly string[];
  recentColors: readonly string[];
  compact: boolean;
  title: string;
  formatMode: ColorSelectorFormatMode;
  onCycleFormatMode: () => void;
  allowedModes?: readonly ('solid' | GradientType)[];
  onModeChange: (mode: 'solid' | GradientType) => void;
  nameField?: ReactNode;
  createId: PaintStopIdFactory;
  showGradientAdvancedControls?: boolean;
  selectedStopId: string | null;
  selectStop: (id: string | null) => void;
  preview: (paint: Paint) => void;
};

export function PaintSelectorEditorContent(props: {
  changeColor: (color: string) => void;
  eyedropper: ReturnType<typeof useEyedropper>;
  popup: EditorOptions;
  selected: GradientStop | null;
  originalStopColors: ReadonlyMap<string, string>;
}) {
  const { popup } = props;
  const color =
    props.selected?.color ?? (popup.draft.kind === 'solid' ? popup.draft.color : '#000000ff');
  const originalColor = props.selected
    ? (props.originalStopColors.get(props.selected.id) ?? props.selected.color)
    : popup.original.kind === 'solid'
      ? popup.original.color
      : '#000000ff';
  const colorEditor = (
    <div className="sniptale-paint-color min-w-0 space-y-3">
      {popup.palette.length > 0 && (
        <ColorSelectorSwatchSection
          colors={popup.palette.slice(0, 10)}
          gridClassName="grid grid-cols-10 justify-items-center gap-1"
          label=""
          showLabel={false}
          onSelect={props.changeColor}
          selectedColor={color}
          title={popup.title}
        />
      )}
      {!popup.compact && popup.recentColors.length > 0 && (
        <ColorSelectorSwatchSection
          colors={popup.recentColors.slice(0, 10)}
          label={translate('shared.ui.colorSelectorRecentColors')}
          onSelect={props.changeColor}
          selectedColor={color}
          title={popup.title}
        />
      )}
      <ColorEditorPanel
        key={props.selected?.id ?? 'solid'}
        allowAlpha
        compact={popup.compact}
        originalColor={originalColor}
        color={color}
        formatMode={popup.formatMode}
        eyedropper={props.eyedropper}
        onCycleFormatMode={popup.onCycleFormatMode}
        onSelectTransparent={() => props.changeColor('#00000000')}
        onColorChange={props.changeColor}
      />
    </div>
  );
  if (popup.draft.kind === 'solid') return colorEditor;
  return (
    <GradientEditor
      typeControls={
        <GradientTypeSelector
          {...(popup.allowedModes === undefined ? {} : { allowedModes: popup.allowedModes })}
          mode={popup.draft.gradient.type}
          onChange={popup.onModeChange}
        />
      }
      colorEditor={colorEditor}
      nameField={popup.nameField}
      compact={popup.compact}
      createId={popup.createId}
      gradient={popup.draft.gradient}
      showAdvancedControls={popup.showGradientAdvancedControls !== false}
      selectedStopId={popup.selectedStopId}
      onSelectStop={popup.selectStop}
      onChange={(gradient) => popup.preview({ kind: 'gradient', gradient })}
    />
  );
}
