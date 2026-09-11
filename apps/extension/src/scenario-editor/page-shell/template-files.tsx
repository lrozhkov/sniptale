import { useEffect, useRef, useState } from 'react';
import { Download, FolderOpen } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductInput } from '@sniptale/ui/product-form-controls';
import {
  GUIDE_LIMITS,
  MAX_GUIDE_TEMPLATE_BYTES,
  type GuideProject,
  type GuideStep,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import { parseGuideTemplateJson } from '@sniptale/runtime-contracts/scenario/guide-parser';
import {
  createGuideAppearanceTemplate,
  applyGuideAppearanceTemplate,
} from '../../features/scenario/project/public';
import type { Translate } from '../../platform/i18n';
import { downloadScenarioEditorBlob } from '../platform/browser-driver';

type TemplateFileProps = {
  project: GuideProject;
  step: GuideStep;
  disabled: boolean;
  onChange: (project: GuideProject) => void;
  t: Translate;
};
type FileStatus = 'idle' | 'reading' | 'downloaded' | 'applied' | 'failed' | 'stale';

/** Owns a disposable file operation; stale readers never publish into a changed edit buffer. */
function useGuideTemplateFiles(props: TemplateFileProps) {
  const [name, setName] = useState(props.t('scenario.editor.appearanceTemplateDefault'));
  const [status, setStatus] = useState<FileStatus>('idle');
  const current = useRef(props);
  current.current = props;
  const alive = useRef(true);
  const generation = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current += 1;
    };
  }, []);
  const download = () => {
    if (props.disabled || status === 'reading') return;
    try {
      const template = createGuideAppearanceTemplate(props.project, props.step, name);
      if (!template) throw new Error('Invalid appearance template');
      downloadScenarioEditorBlob(
        new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' }),
        'guide-template.json'
      );
      setStatus('downloaded');
    } catch {
      setStatus('failed');
    }
  };
  const open = async (file: File | undefined) => {
    if (!file || props.disabled) return;
    const turn = ++generation.current;
    const snapshot = current.current;
    setStatus('reading');
    try {
      if (file.size > MAX_GUIDE_TEMPLATE_BYTES) throw new Error('Template too large');
      const template = parseGuideTemplateJson(await file.text());
      if (!alive.current || generation.current !== turn) return;
      if (
        current.current.project !== snapshot.project ||
        current.current.step.id !== snapshot.step.id ||
        current.current.disabled
      ) {
        setStatus('stale');
        return;
      }
      if (!template) throw new Error('Invalid appearance template');
      current.current.onChange({
        ...snapshot.project,
        items: snapshot.project.items.map((item) =>
          item.id === snapshot.step.id
            ? applyGuideAppearanceTemplate(snapshot.step, template)
            : item
        ),
      });
      setStatus('applied');
    } catch {
      if (alive.current && generation.current === turn) setStatus('failed');
    }
  };
  return { name, setName, status, download, open };
}

/** Explicit local template exchange contains no captured content or resource references. */
export function GuideTemplateFiles(props: TemplateFileProps) {
  const { t } = props;
  const files = useGuideTemplateFiles(props);
  const input = useRef<HTMLInputElement>(null);
  const locked = props.disabled || files.status === 'reading';
  const statusKeys = {
    idle: null,
    reading: 'scenario.editor.loading',
    downloaded: 'scenario.editor.appearanceTemplateDownloaded',
    applied: 'scenario.editor.appearanceTemplateApplied',
    failed: 'scenario.editor.appearanceTemplateFailed',
    stale: 'scenario.editor.appearanceTemplateStale',
  } as const;
  const message = statusKeys[files.status];
  return (
    <div className="guide-template-files">
      <p>{t('scenario.editor.appearanceTemplatePrivacy')}</p>
      <label>
        {t('scenario.editor.appearanceTemplateName')}
        <ProductInput
          value={files.name}
          disabled={locked}
          maxLength={GUIDE_LIMITS.maxLabelLength}
          onChange={(event) => files.setName(event.target.value)}
        />
      </label>
      <ProductActionButton
        tone="secondary"
        compact
        disabled={locked || !files.name.trim()}
        onClick={files.download}
      >
        <Download size={15} aria-hidden="true" />
        {t('scenario.editor.appearanceTemplateSave')}
      </ProductActionButton>
      <ProductActionButton
        tone="secondary"
        compact
        disabled={locked}
        onClick={() => input.current?.click()}
      >
        <FolderOpen size={15} aria-hidden="true" />
        {t('scenario.editor.appearanceTemplateOpen')}
      </ProductActionButton>
      <input
        ref={input}
        hidden
        type="file"
        accept=".json,application/json"
        disabled={locked}
        aria-label={t('scenario.editor.appearanceTemplateOpen')}
        onChange={(event) => {
          void files.open(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {message && (
        <p role={files.status === 'failed' || files.status === 'stale' ? 'alert' : 'status'}>
          {t(message)}
        </p>
      )}
    </div>
  );
}
