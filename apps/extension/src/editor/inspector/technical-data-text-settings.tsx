import { Type } from 'lucide-react';
import { useRef } from 'react';
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
import { INSPECTOR_SECTION_LABEL_CLASS_NAME } from './chrome';

const fontLabels: Record<DrawingFontFamily, Parameters<typeof translate>[0]> = {
  sans: 'content.toolbar.drawingTextFontSans',
  serif: 'content.toolbar.drawingTextFontSerif',
  mono: 'content.toolbar.drawingTextFontMono',
  handwritten: 'content.toolbar.drawingTextFontHandwritten',
};

const optionClassName = '!h-8 !min-h-8 !min-w-8 rounded-md px-2 text-xs';
const fontPreview = 'Aa';
const quietPickerClassName = [
  'space-y-3 pb-1',
  "[&_[data-ui='shared.ui.color-selector.trigger']]:!border-transparent",
  "[&_[data-ui='shared.ui.color-selector.trigger']]:!shadow-none",
].join(' ');

export function EditorTechnicalDataTextSettings() {
  const boundaryRef = useRef<HTMLDivElement>(null);
  const settings = useEditorStore((state) => state.technicalDataTextSettings);
  const updateSettings = useEditorStore((state) => state.updateTechnicalDataTextSettings);

  return (
    <div
      ref={boundaryRef}
      className={quietPickerClassName}
      data-ui="editor.technical-data.text-settings"
    >
      <div
        className="flex items-center justify-between gap-2"
        data-ui="editor.technical-data.font-row"
      >
        <p className={INSPECTOR_SECTION_LABEL_CLASS_NAME}>{translate('editor.compact.font')}</p>
        <div
          className="flex shrink-0 items-center gap-1"
          data-ui="editor.technical-data.font-options"
        >
          {DRAWING_TEXT_FONT_FAMILIES.map((fontFamily) => (
            <ContentToolbarButton
              key={fontFamily}
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
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className={INSPECTOR_SECTION_LABEL_CLASS_NAME}>
            {translate('content.toolbar.drawingTextColor')}
          </p>
          <DrawingColorOptions
            colors={DEFAULT_DRAWING_COLORS}
            floatingBoundaryRef={boundaryRef}
            floatingPlacement="auto"
            label={translate('content.toolbar.drawingTextColor')}
            value={settings.color}
            onSelect={(color) => updateSettings({ color })}
            icon={Type}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className={INSPECTOR_SECTION_LABEL_CLASS_NAME}>
            {translate('content.toolbar.drawingTextBackground')}
          </p>
          <DrawingTextBackgroundOptions
            colors={DEFAULT_DRAWING_COLORS}
            floatingBoundaryRef={boundaryRef}
            floatingPlacement="auto"
            value={settings.backgroundColor}
            vertical={false}
            onChange={(backgroundColor) => updateSettings({ backgroundColor })}
          />
        </div>
      </div>
      <div
        className="flex items-center justify-between gap-2"
        data-ui="editor.technical-data.size-row"
      >
        <p className={INSPECTOR_SECTION_LABEL_CLASS_NAME}>
          {translate('content.toolbar.drawingTextSize')}
        </p>
        <div
          className="flex shrink-0 items-center gap-1"
          data-ui="editor.technical-data.size-options"
        >
          {DRAWING_TEXT_SIZES.map((fontSize) => (
            <ContentToolbarButton
              key={fontSize}
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
      </div>
    </div>
  );
}
