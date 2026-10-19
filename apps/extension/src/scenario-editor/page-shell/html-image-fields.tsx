import { ToggleField, SelectField } from '../../ui/compact-inspector-controls';
import type { GuideHtmlImageSettings } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import './html-workbench.css';

/** The same bounded controls edit defaults, individual overrides and bulk selections. */
export function GuideHtmlImageFields({
  value,
  disabled = false,
  onChange,
  t,
}: {
  value: GuideHtmlImageSettings;
  disabled?: boolean;
  onChange: (patch: Partial<GuideHtmlImageSettings>) => void;
  t: Translate;
}) {
  const frame = value.content === 'frame';
  return (
    <div className="guide-html-fields sniptale-parameter-stack">
      <SelectField
        label={t('scenario.editor.htmlContent')}
        disabled={disabled}
        value={value.content}
        options={[
          { value: 'full', label: t('scenario.editor.htmlFull') },
          { value: 'frame', label: t('scenario.editor.htmlFrame') },
        ]}
        onChange={(content) => onChange({ content })}
      />
      <div
        className="guide-html-switch"
        title={t(
          frame ? 'scenario.editor.htmlFrameOptimizeHint' : 'scenario.editor.htmlOptimizeHint'
        )}
      >
        <ToggleField
          label={t('scenario.editor.htmlOptimize')}
          disabled={disabled || frame}
          value={frame || value.optimize}
          onChange={(optimize) => onChange({ optimize })}
        />
      </div>
      {(frame || value.optimize) && (
        <>
          {!frame && (
            <SelectField
              label={t('scenario.editor.htmlMaxEdge')}
              disabled={disabled}
              value={String(value.maxEdge)}
              options={htmlImageEdges.map((edge) => ({ value: String(edge), label: `${edge} px` }))}
              onChange={(next) => {
                const maxEdge = htmlImageEdges.find((edge) => String(edge) === next);
                if (maxEdge !== undefined) onChange({ maxEdge });
              }}
            />
          )}
          <SelectField
            label={t('scenario.editor.htmlQuality')}
            disabled={disabled}
            value={String(value.quality)}
            options={htmlImageQualities.map((quality) => ({
              value: String(quality),
              label: `${quality * 100}%`,
            }))}
            onChange={(next) => {
              const quality = htmlImageQualities.find((quality) => String(quality) === next);
              if (quality !== undefined) onChange({ quality });
            }}
          />
        </>
      )}
      <div
        className="guide-html-switch"
        title={t(frame ? 'scenario.editor.htmlFrameViewerHint' : 'scenario.editor.htmlViewerHint')}
      >
        <ToggleField
          label={t('scenario.editor.htmlViewer')}
          disabled={disabled || frame}
          value={!frame && value.viewer}
          onChange={(viewer) => onChange({ viewer })}
        />
      </div>
    </div>
  );
}

const htmlImageEdges = [1280, 1920, 2560, 4096] as const;
const htmlImageQualities = [0.75, 0.85, 0.95] as const;
