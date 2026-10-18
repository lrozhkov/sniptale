import { Type } from 'lucide-react';
import { useContext, useRef } from 'react';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import {
  DEFAULT_DRAWING_COLORS,
  DRAWING_TEXT_FONT_FAMILIES,
  DRAWING_TEXT_SIZES,
  resolveDrawingTextFontFamily,
  type DrawingFontFamily,
} from '../../features/drawing/public';
import { translate } from '../../platform/i18n';
import { DrawingColorOptions, DrawingTextBackgroundOptions } from '../../ui/drawing-tools/options';
import { useEditorStore } from '../state/useEditorStore';
import { InspectorParameterRow } from '../../ui/compact-inspector-controls/layout';

const fontLabels: Record<DrawingFontFamily, Parameters<typeof translate>[0]> = {
  sans: 'content.toolbar.drawingTextFontSans',
  serif: 'content.toolbar.drawingTextFontSerif',
  mono: 'content.toolbar.drawingTextFontMono',
  handwritten: 'content.toolbar.drawingTextFontHandwritten',
};

const optionClassName =
  '!h-8 !min-h-8 !min-w-8 rounded-[4px] px-2 text-[13px] font-medium leading-[18px]';
const fontPreview = 'Aa';
const quietPickerClassName = [
  'sniptale-parameter-stack pb-1',
  "[&_[data-ui='shared.ui.color-selector.trigger']]:!border-transparent",
  "[&_[data-ui='shared.ui.color-selector.trigger']]:!shadow-none",
].join(' ');

export function EditorTechnicalDataTextSettings() {
  const scoped = useContext(CommandPressScope);
  const boundaryRef = useRef<HTMLDivElement>(null);
  const settings = useEditorStore((state) => state.technicalDataTextSettings);
  const updateSettings = useEditorStore((state) => state.updateTechnicalDataTextSettings);

  return (
    <div
      ref={boundaryRef}
      className={quietPickerClassName}
      data-ui="editor.technical-data.text-settings"
    >
      <InspectorParameterRow
        label={translate('editor.compact.font')}
        valueMinimum={148}
        dataUi="editor.technical-data.font-row"
      >
        <div
          className="flex shrink-0 items-center gap-1"
          data-ui="editor.technical-data.font-options"
        >
          {DRAWING_TEXT_FONT_FAMILIES.map((fontFamily) => (
            <ContentToolbarButton
              key={fontFamily}
              tone={scoped ? 'property' : 'default'}
              type="button"
              active={settings.fontFamily === fontFamily}
              aria-label={translate(fontLabels[fontFamily])}
              aria-pressed={settings.fontFamily === fontFamily}
              title={translate(fontLabels[fontFamily])}
              dataUi={`editor.technical-data.font-${fontFamily}`}
              className={optionClassName}
              onClick={() => updateSettings({ fontFamily })}
            >
              <span
                aria-hidden="true"
                style={{ fontFamily: resolveDrawingTextFontFamily(fontFamily) }}
              >
                {fontPreview}
              </span>
            </ContentToolbarButton>
          ))}
        </div>
      </InspectorParameterRow>
      <InspectorParameterRow
        label={translate('content.toolbar.drawingTextColor')}
        valueMinimum={184}
      >
        <DrawingColorOptions
          colors={DEFAULT_DRAWING_COLORS}
          floatingBoundaryRef={boundaryRef}
          floatingPlacement="auto"
          label={translate('content.toolbar.drawingTextColor')}
          value={settings.color}
          onSelect={(color) => updateSettings({ color })}
          icon={Type}
        />
      </InspectorParameterRow>
      <InspectorParameterRow
        label={translate('content.toolbar.drawingTextBackground')}
        valueMinimum={220}
      >
        <DrawingTextBackgroundOptions
          colors={DEFAULT_DRAWING_COLORS}
          floatingBoundaryRef={boundaryRef}
          floatingPlacement="auto"
          value={settings.backgroundColor}
          vertical={false}
          onChange={(backgroundColor) => updateSettings({ backgroundColor })}
        />
      </InspectorParameterRow>
      <InspectorParameterRow
        label={translate('content.toolbar.drawingTextSize')}
        valueMinimum={112}
        dataUi="editor.technical-data.size-row"
      >
        <div
          className="flex shrink-0 items-center gap-1"
          data-ui="editor.technical-data.size-options"
        >
          {DRAWING_TEXT_SIZES.map((fontSize) => (
            <ContentToolbarButton
              key={fontSize}
              tone={scoped ? 'property' : 'default'}
              type="button"
              active={settings.fontSize === fontSize}
              aria-label={`${translate('content.toolbar.drawingTextSize')}: ${fontSize}px`}
              aria-pressed={settings.fontSize === fontSize}
              title={`${fontSize}px`}
              dataUi={`editor.technical-data.size-${fontSize}`}
              className={optionClassName}
              onClick={() => updateSettings({ fontSize })}
            >
              {fontSize}
            </ContentToolbarButton>
          ))}
        </div>
      </InspectorParameterRow>
    </div>
  );
}
