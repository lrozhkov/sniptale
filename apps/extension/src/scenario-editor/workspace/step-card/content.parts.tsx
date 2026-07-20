import { translate } from '../../../platform/i18n';
import type { ScenarioStep } from '../../../features/scenario/contracts/types/project';
import type { ScenarioStepPatch } from '../../project/mutation/helpers';
import { ScenarioWorkspaceCaptureCanvas } from '../capture-canvas/view';
import { useScenarioStepTextDrafts } from './useScenarioStepTextDrafts';
import {
  InlineTextField,
  NOTE_TONES,
  resolveNoteToneClasses,
  ScenarioNoteToneButton,
} from './content.helpers';

export function CaptureStepContent(props: {
  step: Extract<ScenarioStep, { kind: 'capture' }>;
  onOpenQuickEdit: () => void;
  onUpdateStep: (patch: ScenarioStepPatch) => void;
}) {
  const textDrafts = useScenarioStepTextDrafts({
    onCommitPatch: props.onUpdateStep,
    step: props.step,
  });

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <InlineTextField
          emphasis="title"
          value={textDrafts.title}
          placeholder={translate('scenario.editor.untitledStep')}
          onBlur={textDrafts.commitDraft}
          onChange={textDrafts.updateTitle}
          onCommit={textDrafts.commitDraft}
        />
        <InlineTextField
          multiline
          value={textDrafts.body}
          placeholder={translate('scenario.editor.body')}
          onBlur={textDrafts.commitDraft}
          onChange={textDrafts.updateBody}
        />
      </div>
      <div
        className="group relative overflow-hidden rounded-[20px] border border-[var(--sniptale-color-border-soft)]
          bg-[var(--sniptale-color-surface-panel)] p-3"
      >
        <ScenarioWorkspaceCaptureCanvas
          step={props.step}
          onOpenQuickEdit={props.onOpenQuickEdit}
          onUpdateStep={props.onUpdateStep}
        />
      </div>
    </div>
  );
}

export function SectionStepContent(props: {
  step: Extract<ScenarioStep, { kind: 'section' }>;
  onUpdateStep: (patch: ScenarioStepPatch) => void;
}) {
  const textDrafts = useScenarioStepTextDrafts({
    onCommitPatch: props.onUpdateStep,
    step: props.step,
  });

  return (
    <div className="grid gap-2">
      <InlineTextField
        emphasis="title"
        value={textDrafts.title}
        placeholder={translate('scenario.editor.untitledSection')}
        onBlur={textDrafts.commitDraft}
        onChange={textDrafts.updateTitle}
        onCommit={textDrafts.commitDraft}
      />
    </div>
  );
}

export function DividerStepContent(props: {
  step: Extract<ScenarioStep, { kind: 'divider' }>;
  onUpdateStep: (patch: ScenarioStepPatch) => void;
}) {
  const textDrafts = useScenarioStepTextDrafts({
    onCommitPatch: props.onUpdateStep,
    step: props.step,
  });

  return (
    <div className="grid gap-3 py-2">
      <div className="h-px border-t border-dashed border-[var(--sniptale-color-border-strong)]" />
      {textDrafts.title || textDrafts.body ? (
        <div className="grid gap-1">
          <InlineTextField
            emphasis="title"
            value={textDrafts.title}
            placeholder={translate('scenario.editor.untitledDivider')}
            onBlur={textDrafts.commitDraft}
            onChange={textDrafts.updateTitle}
            onCommit={textDrafts.commitDraft}
          />
          <InlineTextField
            value={textDrafts.body}
            placeholder={translate('scenario.editor.body')}
            onBlur={textDrafts.commitDraft}
            onChange={textDrafts.updateBody}
          />
        </div>
      ) : null}
    </div>
  );
}

export function NoteStepContent(props: {
  step: Extract<ScenarioStep, { kind: 'note' }>;
  onUpdateStep: (patch: ScenarioStepPatch) => void;
}) {
  const textDrafts = useScenarioStepTextDrafts({
    onCommitPatch: props.onUpdateStep,
    step: props.step,
  });

  return (
    <div
      className={[
        'grid gap-3 rounded-[20px] border p-4',
        resolveNoteToneClasses(props.step.tone),
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-3">
        <InlineTextField
          emphasis="title"
          value={textDrafts.title}
          placeholder={translate('scenario.editor.untitledNote')}
          onBlur={textDrafts.commitDraft}
          onChange={textDrafts.updateTitle}
          onCommit={textDrafts.commitDraft}
        />
        <ScenarioNoteToneButton
          tone={props.step.tone}
          onClick={() =>
            props.onUpdateStep({
              tone: NOTE_TONES[(NOTE_TONES.indexOf(props.step.tone) + 1) % NOTE_TONES.length]!,
            })
          }
        />
      </div>
      <InlineTextField
        multiline
        value={textDrafts.body}
        placeholder={translate('scenario.editor.body')}
        onBlur={textDrafts.commitDraft}
        onChange={textDrafts.updateBody}
      />
    </div>
  );
}
