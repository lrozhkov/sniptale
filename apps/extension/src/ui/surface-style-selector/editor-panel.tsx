import type { SurfaceStyle } from '@sniptale/runtime-contracts/highlighter/surface-style';
import { translate } from '../../platform/i18n';
import { CompactPaintSelector } from '../paint-selector';
import type { SurfaceStyleSelectorProps } from './types';

export function SurfaceStyleEditorPanel(props: {
  actions: SurfaceStyleSelectorProps['actions'];
  canonicalCss: string | null;
  disabled?: boolean;
  draft: SurfaceStyle;
  name: string;
  onApply: () => void;
  onCancel: () => void;
  onDraftChange: (style: SurfaceStyle) => void;
  onNameChange: (name: string) => void;
}) {
  return (
    <>
      <CompactPaintSelector
        {...(props.disabled === undefined ? {} : { disabled: props.disabled })}
        label={translate('content.callout.surfaceStyle.paint')}
        title={translate('content.callout.surfaceStyle.paint')}
        value={props.draft.fillPaint}
        onChange={(fillPaint) => props.onDraftChange({ ...props.draft, fillPaint })}
      />
      <label className="grid gap-1 text-xs">
        {translate('content.callout.surfaceStyle.advancedCss')}
        <textarea
          value={props.draft.surfaceCss}
          maxLength={4000}
          rows={5}
          onChange={(event) =>
            props.onDraftChange({ ...props.draft, surfaceCss: event.target.value })
          }
        />
      </label>
      {props.canonicalCss === null ? (
        <div role="alert">{translate('content.callout.surfaceStyle.cssInvalid')}</div>
      ) : null}
      <input
        aria-label={translate('content.callout.surfaceStyle.name')}
        maxLength={80}
        value={props.name}
        onChange={(event) => props.onNameChange(event.target.value)}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={!props.name.trim() || props.canonicalCss === null}
          onClick={() =>
            void props.actions.onCreate(props.name.trim(), {
              ...props.draft,
              surfaceCss: props.canonicalCss ?? '',
            })
          }
        >
          {translate('content.callout.surfaceStyle.create')}
        </button>
        <button type="button" data-ui="surface-style.cancel" onClick={props.onCancel}>
          {translate('content.callout.surfaceStyle.cancel')}
        </button>
        <button
          type="button"
          data-ui="surface-style.apply"
          disabled={props.canonicalCss === null}
          onClick={props.onApply}
        >
          {translate('content.callout.surfaceStyle.apply')}
        </button>
      </div>
    </>
  );
}
