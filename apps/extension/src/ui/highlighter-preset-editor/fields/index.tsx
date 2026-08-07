import { translate } from '../../../platform/i18n';
import { editorInputClassName } from '../constants';
import type { EditorState } from './types';
import { EditorPreview } from './sections/sample';
import { BorderStyleInspector } from './inspector';
import type { BorderVisualStylePatch } from '../../../features/highlighter/contracts';
import { HighlighterManualInspectorSurface } from '../manual-inspector-surface';
import type { LinkedAnnotationTemplateOptions } from './inspector';

function applyEditorPatch(state: EditorState, patch: BorderVisualStylePatch) {
  if (patch.color !== undefined) state.setColor(patch.color);
  if (patch.fillColor !== undefined) state.setFillColor(patch.fillColor);
  if (patch.fillOpacity !== undefined) state.setFillOpacity(patch.fillOpacity);
  if (patch.effects !== undefined) state.setEffects(patch.effects);
  if (patch.opacity !== undefined) state.setOpacity(patch.opacity);
  if (patch.radius !== undefined) state.setRadius(patch.radius);
  if (patch.shadow !== undefined) state.setShadow(patch.shadow);
  if (patch.strokeOpacity !== undefined) state.setStrokeOpacity(patch.strokeOpacity);
  if (patch.style !== undefined) state.setStyle(patch.style);
  if (patch.width !== undefined) state.setWidth(patch.width);
  if (patch.inheritCustomCss !== undefined) state.setInheritCustomCss(patch.inheritCustomCss);
  if (patch.customCss !== undefined) state.setCustomCss(patch.customCss);
  if (patch.padding !== undefined) {
    state.setPadding((current) => ({ ...current, ...patch.padding }));
  }
}

export function BorderPresetEditorFields({
  linkedTemplateOptions,
  state,
}: {
  linkedTemplateOptions?: LinkedAnnotationTemplateOptions;
  state: EditorState;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('highlighter.editor.nameLabel')}
        </label>
        <input
          type="text"
          value={state.name}
          onChange={(event) => state.setName(event.target.value)}
          placeholder={translate('highlighter.editor.namePlaceholder')}
          className={[
            editorInputClassName,
            'placeholder:text-[var(--sniptale-color-text-dim)]',
            'focus:ring-1 focus:ring-[color:color-mix(in_srgb,var(--sniptale-color-accent)_12%,transparent)]',
          ].join(' ')}
        />
      </div>
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-[176px_minmax(0,1fr)]">
        <EditorPreview state={state} />
        <HighlighterManualInspectorSurface>
          <BorderStyleInspector
            cssDraft={state.customCss}
            cssError={state.cssError}
            cssTextareaHeight={state.textareaHeight}
            onChange={(patch) => applyEditorPatch(state, patch)}
            onCssDraftChange={(customCss) => {
              state.setCustomCss(customCss);
              state.setInheritCustomCss(Boolean(customCss.trim()));
            }}
            onCssResizeStart={state.handleResizeStart}
            style={state}
            {...(linkedTemplateOptions ? { linkedTemplateOptions } : {})}
          />
        </HighlighterManualInspectorSurface>
      </div>
    </div>
  );
}
