import { useEffect, useRef, useState } from 'react';
import { LayoutTemplate, Save } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductInput } from '@sniptale/ui/product-form-controls';
import { GUIDE_LIMITS, type GuideStep } from '@sniptale/runtime-contracts/scenario/types/guide';
import { classifyGuideStepContent } from '../../features/scenario/project/public';
import type { GuideTemplateApplication } from '../../composition/persistence/scenario/store/public';
import type { Translate } from '../../platform/i18n';
import { CompactSelect } from '../../ui/compact-inspector-controls/select';
import { GuideInspectorGroup } from './inspector';
import { useGuideTemplateCatalog } from './template-catalog';

/** Save and application choices belong to the selected step, outside its exported content. */
export function GuideTemplateControls({
  step,
  disabled,
  onSave,
  onApply,
  t,
}: {
  step: GuideStep;
  disabled: boolean;
  onSave: (name: string) => Promise<boolean>;
  onApply: (templateId: string, mode: GuideTemplateApplication) => Promise<boolean>;
  t: Translate;
}) {
  const catalog = useGuideTemplateCatalog();
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(step.title);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<'saved' | 'failed' | null>(null);
  const active = useRef(true);
  const lock = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (saving) input.current?.focus();
    else trigger.current?.focus();
  }, [saving]);
  const entries = catalog.entries.filter((entry) => entry.availability === 'available');
  const selection = entries.some((entry) => entry.id === selected) ? selected : '';
  const busy = disabled || pending;
  const cancelSave = () => {
    setSaving(false);
  };
  const run = async (operation: () => Promise<boolean>, save = false) => {
    if (busy || lock.current) return;
    lock.current = true;
    setPending(true);
    setFeedback(null);
    try {
      const ok = await operation();
      if (!active.current) return;
      setFeedback(ok ? (save ? 'saved' : null) : 'failed');
      if (ok && save) {
        cancelSave();
        void catalog.reload();
      }
    } catch {
      if (active.current) setFeedback('failed');
    } finally {
      lock.current = false;
      if (active.current) setPending(false);
    }
  };
  const content = classifyGuideStepContent(step);
  return (
    <GuideInspectorGroup icon={LayoutTemplate} title={t('scenario.editor.stepTemplates')}>
      <div className="guide-template-controls">
        <GuideTemplatePicker
          entries={entries}
          selection={selection}
          status={catalog.status}
          busy={busy}
          content={content}
          onSelect={setSelected}
          onRetry={() => void catalog.reload()}
          onApply={(mode) => void run(() => onApply(selection, mode))}
          t={t}
        />
        <ProductActionButton
          hidden={saving}
          tone="secondary"
          compact
          type="button"
          disabled={busy}
          onClick={(event) => {
            trigger.current = event.currentTarget;
            setSaving(true);
            setFeedback(null);
          }}
        >
          <Save size={14} aria-hidden="true" />
          {t('scenario.editor.templateSave')}
        </ProductActionButton>
        {saving && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) void run(() => onSave(name.trim()), true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !busy) {
                event.preventDefault();
                event.stopPropagation();
                cancelSave();
              }
            }}
          >
            <ProductInput
              ref={input}
              aria-label={t('scenario.editor.templateName')}
              value={name}
              maxLength={GUIDE_LIMITS.maxLabelLength}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
            <div className="guide-template-save-actions">
              <ProductActionButton
                tone="primary"
                compact
                type="submit"
                disabled={busy || !name.trim()}
              >
                {t('scenario.editor.templateSave')}
              </ProductActionButton>
              <ProductActionButton
                tone="secondary"
                compact
                type="button"
                disabled={busy}
                onClick={cancelSave}
              >
                {t('common.actions.cancel')}
              </ProductActionButton>
            </div>
          </form>
        )}
        {feedback && (
          <p role={feedback === 'failed' ? 'alert' : 'status'}>
            {t(
              feedback === 'saved'
                ? 'scenario.editor.templateSaved'
                : 'scenario.editor.templateFailed'
            )}
          </p>
        )}
      </div>
    </GuideInspectorGroup>
  );
}

/** Catalog selection and explicit content policy share one compact presentation. */
function GuideTemplatePicker({
  entries,
  selection,
  status,
  busy,
  content,
  onSelect,
  onRetry,
  onApply,
  t,
}: {
  entries: readonly { id: string; name: string }[];
  selection: string;
  status: 'loading' | 'ready' | 'failed';
  busy: boolean;
  content: ReturnType<typeof classifyGuideStepContent>;
  onSelect: (id: string) => void;
  onRetry: () => void;
  onApply: (mode: GuideTemplateApplication) => void;
  t: Translate;
}) {
  return (
    <>
      {status === 'loading' && <p role="status">{t('scenario.editor.templateLoading')}</p>}
      {status === 'failed' && (
        <div role="alert">
          <p>{t('scenario.editor.templateLoadFailed')}</p>
          <ProductActionButton
            tone="secondary"
            compact
            type="button"
            disabled={busy}
            onClick={() => void onRetry()}
          >
            {t('scenario.editor.guideRetry')}
          </ProductActionButton>
        </div>
      )}
      {entries.length > 0 && (
        <>
          <CompactSelect
            aria-label={t('scenario.editor.stepTemplates')}
            value={selection}
            disabled={busy}
            options={[
              { value: '', label: t('scenario.editor.templateChoose') },
              ...entries.map((entry) => ({ value: entry.id, label: entry.name })),
            ]}
            onChange={onSelect}
          />
          {selection && (
            <>
              <ProductActionButton
                tone="secondary"
                compact
                type="button"
                disabled={busy}
                onClick={() =>
                  onApply(
                    content === 'empty' ? 'replace' : content === 'image' ? 'capture' : 'appearance'
                  )
                }
              >
                {t(
                  content === 'authored'
                    ? 'scenario.editor.templateAppearanceOnly'
                    : content === 'image'
                      ? 'scenario.editor.templateKeepImage'
                      : 'scenario.editor.guideApplyAppearance'
                )}
              </ProductActionButton>
              {content !== 'empty' && (
                <ProductActionButton
                  tone="secondary"
                  compact
                  type="button"
                  disabled={busy}
                  onClick={() => onApply('replace')}
                >
                  {t('scenario.editor.templateReplaceContent')}
                </ProductActionButton>
              )}
              <p className="guide-inspector-hint">{t('scenario.editor.templateApplyHelp')}</p>
            </>
          )}
        </>
      )}
      {status === 'ready' && entries.length === 0 && (
        <p className="guide-inspector-hint">{t('scenario.editor.templateEmpty')}</p>
      )}
    </>
  );
}
