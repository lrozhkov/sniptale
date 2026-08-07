import { useRef, useState } from 'react';

import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate } from '../../../platform/i18n';

type TemplateForkMode = 'templates' | 'temporary';

export function useTemplateForkWorkflow<Preset extends { id: string }>(args: {
  activeTemplateId?: string;
  onFork: (template: Preset) => void;
  onRestore: (template: Preset) => void;
  onShowTemplates: () => void | Promise<void>;
  templates: readonly Preset[];
}) {
  const [mode, setMode] = useState<TemplateForkMode>(() =>
    args.activeTemplateId ? 'templates' : 'temporary'
  );
  const [confirmingReturn, setConfirmingReturn] = useState(false);
  const [saveRequest, setSaveRequest] = useState(0);
  const sourceTemplateId = useRef<string | null>(null);

  const fork = (requestedTemplate?: Preset) => {
    if (mode === 'temporary') return;
    const template =
      requestedTemplate ?? args.templates.find((item) => item.id === args.activeTemplateId);
    if (!template) return;
    sourceTemplateId.current = template.id;
    args.onFork(template);
    setConfirmingReturn(false);
    setMode('temporary');
  };

  const requestTemplates = () => setConfirmingReturn(true);
  const continueEditing = () => setConfirmingReturn(false);
  const goToSave = () => {
    setConfirmingReturn(false);
    setSaveRequest((current) => current + 1);
  };
  const discard = () => {
    const source = args.templates.find((item) => item.id === sourceTemplateId.current);
    if (source) args.onRestore(source);
    sourceTemplateId.current = null;
    setConfirmingReturn(false);
    setMode('templates');
    void args.onShowTemplates();
  };
  const completeSave = () => {
    sourceTemplateId.current = null;
    setConfirmingReturn(false);
    setMode('templates');
    void args.onShowTemplates();
  };

  return {
    completeSave,
    confirmingReturn,
    continueEditing,
    discard,
    fork,
    goToSave,
    mode,
    requestTemplates,
    saveRequest,
  };
}

export function TemplateForkReturnGuard(props: {
  onContinue: () => void;
  onDiscard: () => void;
  onGoToSave: () => void;
}) {
  return (
    <div
      className="grid gap-3 p-3"
      data-ui="content.template-fork.return-guard"
      role="region"
      aria-label={translate('content.templateFork.unsavedTitle')}
    >
      <div className="grid gap-1">
        <div className="text-[13px] font-semibold text-[var(--sniptale-color-text-primary)]">
          {translate('content.templateFork.unsavedTitle')}
        </div>
        <div className="text-[11px] leading-4 text-[var(--sniptale-color-text-secondary)]">
          {translate('content.templateFork.unsavedDescription')}
        </div>
      </div>
      <div className="grid gap-1.5">
        <ProductActionButton compact onClick={props.onGoToSave}>
          {translate('content.templateFork.goToSave')}
        </ProductActionButton>
        <ProductActionButton compact onClick={props.onDiscard} tone="secondary">
          {translate('content.templateFork.discard')}
        </ProductActionButton>
        <ProductActionButton compact onClick={props.onContinue} tone="secondary">
          {translate('content.templateFork.continueEditing')}
        </ProductActionButton>
      </div>
    </div>
  );
}
