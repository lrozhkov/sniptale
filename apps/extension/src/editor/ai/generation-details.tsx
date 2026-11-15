import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import clockDollarIcon from '@iconify-icons/tabler/clock-dollar';
import { Check } from 'lucide-react';
import { writeBrowserClipboardText } from '@sniptale/platform/browser/clipboard';
import { formatNumber, translate } from '../../platform/i18n';
import { EditorIconButton } from '../chrome/ui';
import type { ImageSessionState } from './session';

/** Exposes metadata only. Prompts, raster data, provider errors and credentials never enter this copy action. */
export function ImageGenerationDetails({
  step,
  variant,
}: {
  step: ImageSessionState['steps'][number] | undefined;
  variant?: number | undefined;
}) {
  const [notice, setNotice] = useState<'copied' | 'failed' | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 1600);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  const results = step?.variants.filter((entry) => entry !== null) ?? [];
  const selected = variant !== undefined ? step?.variants[variant] : null;
  const shown = selected ? [selected] : results;
  const costs = shown.flatMap((entry) => (entry.costRub === undefined ? [] : [entry.costRub]));
  const times = shown.flatMap((entry) =>
    Number.isFinite(entry.durationMs) ? [entry.durationMs] : []
  );
  const unknown = translate('editor.ai.detailsUnknown');
  const duration = times.length
    ? `${formatNumber(Math.max(...times) / 1000, { maximumFractionDigits: 2 })} s`
    : unknown;
  const dimensions =
    shown.map((entry) => `${entry.image.width} × ${entry.image.height}`).join(', ') || unknown;
  const text = step
    ? [
        `${translate('editor.ai.detailsModel')}: ${step.modelLabel} (${step.model.modelCode})`,
        `${translate('editor.ai.detailsTime')}: ${duration}`,
        `${translate('editor.ai.detailsCost')}: ${
          costs.length
            ? `${formatNumber(
                costs.reduce((sum, value) => sum + value, 0),
                { maximumFractionDigits: 4 }
              )} ₽${costs.length < shown.length ? ' + ?' : ''}`
            : unknown
        }`,
        `${translate('editor.ai.detailsTokens')}: ${unknown}`,
        `${translate('editor.ai.detailsReceived')}: ${results.length} / ${step.context.parameters.variants}`,
        `${translate('editor.ai.detailsSize')}: ${dimensions}`,
        `${translate('editor.ai.detailsParameters')}: ${JSON.stringify(step.context.parameters)}`,
      ].join('\n')
    : translate('editor.ai.generationDetails');
  return (
    <EditorIconButton
      title={
        notice
          ? translate(
              notice === 'copied' ? 'editor.ai.detailsCopied' : 'editor.ai.detailsCopyFailed'
            )
          : `${text}${step ? `\n\n${translate('editor.ai.copyGenerationDetails')}` : ''}`
      }
      data-ui="editor.ai.generation-details"
      disabled={!step}
      className="!border-transparent !bg-transparent hover:!text-[var(--sniptale-color-text-primary-strong)]"
      onClick={() => {
        if (!step) return;
        void writeBrowserClipboardText(text)
          .then(() => setNotice('copied'))
          .catch(() => setNotice('failed'));
      }}
    >
      {notice === 'copied' ? (
        <Check size={16} />
      ) : (
        <Icon ssr aria-hidden="true" icon={clockDollarIcon} width={16} height={16} />
      )}
    </EditorIconButton>
  );
}
