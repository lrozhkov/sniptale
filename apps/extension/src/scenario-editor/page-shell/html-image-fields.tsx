import { ProductToggle } from '@sniptale/ui/product-form-controls';
import { CompactSelect } from '../../ui/compact-inspector-controls/select';
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
  return (
    <div className="guide-html-fields">
      <label>
        <span>{t('scenario.editor.htmlContent')}</span>
        <CompactSelect
          disabled={disabled}
          aria-label={t('scenario.editor.htmlContent')}
          value={value.content}
          options={[
            { value: 'full', label: t('scenario.editor.htmlFull') },
            { value: 'frame', label: t('scenario.editor.htmlFrame') },
          ]}
          onChange={(content) => onChange({ content })}
        />
      </label>
      <label className="guide-html-switch">
        <span>{t('scenario.editor.htmlOptimize')}</span>
        <ProductToggle
          size="sm"
          disabled={disabled}
          checked={value.optimize}
          aria-label={t('scenario.editor.htmlOptimize')}
          onClick={() => onChange({ optimize: !value.optimize })}
        />
      </label>
      {value.optimize && (
        <>
          <p>{t('scenario.editor.htmlOptimizeHint')}</p>
          <label>
            <span>{t('scenario.editor.htmlMaxEdge')}</span>
            <CompactSelect
              disabled={disabled}
              aria-label={t('scenario.editor.htmlMaxEdge')}
              value={String(value.maxEdge)}
              options={htmlImageEdges.map((edge) => ({
                value: String(edge),
                label: `${edge} px`,
              }))}
              onChange={(next) => {
                const maxEdge = htmlImageEdges.find((edge) => String(edge) === next);
                if (maxEdge !== undefined) onChange({ maxEdge });
              }}
            />
          </label>
          <label>
            <span>{t('scenario.editor.htmlQuality')}</span>
            <CompactSelect
              disabled={disabled}
              aria-label={t('scenario.editor.htmlQuality')}
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
          </label>
        </>
      )}
      <label className="guide-html-switch">
        <span>{t('scenario.editor.htmlViewer')}</span>
        <ProductToggle
          size="sm"
          disabled={disabled}
          checked={value.viewer}
          aria-label={t('scenario.editor.htmlViewer')}
          onClick={() => onChange({ viewer: !value.viewer })}
        />
      </label>
      <p>{t('scenario.editor.htmlViewerHint')}</p>
    </div>
  );
}

const htmlImageEdges = [1280, 1920, 2560, 4096] as const;
const htmlImageQualities = [0.75, 0.85, 0.95] as const;
