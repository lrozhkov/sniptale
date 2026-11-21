import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Save } from 'lucide-react';
import { useCommandPress } from '@sniptale/ui/control-language/press';
import {
  captureReviewTextTemplate,
  REVIEW_TEXT_TEMPLATE_IDS,
  reviewBuiltinTextTemplates,
  type ReviewTextTemplate,
} from '../../features/video/review/annotation-effects/text-templates';
import { reviewTextCssColor } from '../../features/video/review/annotation-effects/text-appearance';
import type { ReviewAnnotationTextClip } from '../../features/video/review/annotation-effects/types';
import { translate } from '../../platform/i18n';
import { TextField } from '../../ui/compact-inspector-controls';
import { reviewTextPreferredFont } from '../../workflows/video-review/annotation-text-fonts';
import {
  ReviewButton,
  ReviewDetails,
  reviewDeleteButtonClassName,
  reviewTextButtonClassName,
} from './controls';
import { useReviewTextTemplateCatalog } from './use-annotation-text-template-catalog';
import './annotation-text-fonts.css';

type Editor = { id: string; name: string } & (
  | { type: 'create'; afterDeletion: string | null }
  | { type: 'update'; previous: string }
);
function TemplateSample({ template }: { template: ReviewTextTemplate }) {
  const { appearance, color } = template;
  const { background, shadow, outline } = appearance;
  const style: CSSProperties = {
    fontFamily: reviewTextPreferredFont(appearance.family),
    fontWeight: appearance.weight,
    letterSpacing: `${appearance.letterSpacing}em`,
    color,
    background:
      background.mode === 'none'
        ? undefined
        : reviewTextCssColor(background.color, background.opacity),
    borderRadius: background.mode === 'block' ? `${background.radius}em` : undefined,
    padding:
      background.mode === 'none' ? undefined : `${background.paddingY}em ${background.paddingX}em`,
    textShadow: shadow.enabled
      ? `${shadow.x}em ${shadow.y}em ${shadow.blur}em ${reviewTextCssColor(shadow.color, shadow.opacity)}`
      : undefined,
    WebkitTextStroke: outline.enabled
      ? `${outline.width}em ${reviewTextCssColor(outline.color, outline.opacity)}`
      : undefined,
  };
  return (
    <span className="review-text-template-sample" aria-hidden="true">
      <span style={style}>{translate('gallery.videoReview.annotationTextSample')}</span>
    </span>
  );
}

function TemplateOption(props: {
  template: ReviewTextTemplate;
  label: string;
  disabled: boolean;
  pressed: boolean;
  onClick(): void;
}) {
  const press = useCommandPress({ onClick: props.onClick, disabled: props.disabled });
  return (
    <button
      type="button"
      className="review-text-template-option"
      aria-pressed={props.pressed}
      title={props.label}
      disabled={props.disabled}
      {...press.props}
      data-command-press=""
      data-pressing={press.pressed ? 'true' : undefined}
    >
      <span className="sniptale-command-content">
        <TemplateSample template={props.template} />
        <span className="review-text-template-label">{props.label}</span>
      </span>
    </button>
  );
}

type DeleteTarget = { id: string; name: string; revision: string };
type TemplateFailure = { kind: 'write' } | { kind: 'delete'; target: DeleteTarget };

function TemplateDeleteRecovery({
  target,
  current,
  ready,
  disabled,
  reload,
  dismiss,
  remove,
}: {
  target: DeleteTarget;
  current: DeleteTarget | undefined;
  ready: boolean;
  disabled: boolean;
  reload: ReactNode;
  dismiss(): void;
  remove(record: DeleteTarget): void;
}) {
  const message =
    ready && !current
      ? 'gallery.videoReview.annotationTextTemplateDeleteGone'
      : current && current.revision !== target.revision
        ? 'gallery.videoReview.annotationTextTemplateDeleteUpdated'
        : 'gallery.videoReview.annotationTextTemplateDeleteFailed';
  return (
    <div className="review-inspector-notice" role="alert">
      {translate(message).replace('{name}', () => current?.name ?? target.name)}
      <div className="review-text-template-actions">
        {reload}
        {current && (
          <ReviewButton
            label={translate('gallery.videoReview.annotationTextTemplateDeleteNamed').replace(
              '{name}',
              () => current.name
            )}
            className={reviewDeleteButtonClassName}
            disabled={disabled}
            onClick={() => remove(current)}
          >
            {translate('gallery.videoReview.annotationTextTemplateDelete')}
          </ReviewButton>
        )}
        <ReviewButton
          label={translate('gallery.videoReview.annotationTextTemplateDismiss')}
          className={reviewTextButtonClassName}
          onClick={dismiss}
        />
      </div>
    </div>
  );
}

/** Owns the profile chooser, independently of the selected clip's history. */
export function useReviewAnnotationTextTemplates(
  clip: ReviewAnnotationTextClip,
  disabled: boolean,
  apply: (template: ReviewTextTemplate) => void
): { picker: ReactNode; form: ReactNode; save: ReactNode } {
  const catalog = useReviewTextTemplateCatalog();
  const [chosen, setChosen] = useState<string>();
  const [editor, setEditor] = useState<Editor>();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<TemplateFailure>();
  const input = useRef<HTMLInputElement>(null);
  const editorId = editor?.id;
  useEffect(() => {
    if (!editorId) return;
    // The command menu restores its trigger's focus at the end of the activation.
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [editorId]);

  const template = captureReviewTextTemplate(clip);
  const signature = JSON.stringify(template);
  const builtin = REVIEW_TEXT_TEMPLATE_IDS.map((id) => ({
    id,
    label: translate(`gallery.videoReview.annotationTextTemplate_${id}`),
    value: reviewBuiltinTextTemplates[id],
  }));
  const options = catalog.records.map(({ id, name, template }) => ({
    id,
    label: name,
    value: template,
  }));
  const matches = (option: (typeof options)[number]) => JSON.stringify(option.value) === signature;
  const active =
    options.find((item) => item.id === chosen && matches(item)) ??
    [...builtin, ...options].find(matches);
  const selected = catalog.records.find((item) => item.id === (active?.id ?? chosen));
  const unavailable = catalog.status !== 'ready';
  const currentRecord =
    editor?.type === 'update'
      ? catalog.records.find((record) => record.id === editor.id)
      : undefined;
  const conflict =
    !unavailable && editor?.type === 'update' && currentRecord?.revision !== editor.previous;
  const newDraft = (name: string): Editor => ({
    type: 'create',
    id: crypto.randomUUID(),
    name,
    afterDeletion: catalog.deletionRevision,
  });
  const deletion = failure?.kind === 'delete' ? failure.target : undefined;
  const mutate = async (
    command: Parameters<typeof catalog.change>[0],
    refusal: TemplateFailure = { kind: 'write' }
  ) => {
    setPending(true);
    setFailure(undefined);
    try {
      if (await catalog.change(command)) {
        if (command.type === 'delete')
          setChosen((selection) => (selection === command.id ? undefined : selection));
        else {
          setChosen(command.id);
          setEditor(undefined);
        }
      } else setFailure(refusal);
    } finally {
      setPending(false);
    }
  };
  const remove = (target: DeleteTarget) => {
    void mutate(
      { type: 'delete', id: target.id, previous: target.revision },
      { kind: 'delete', target }
    );
  };
  const submit = (draft: Editor) => {
    if (disabled || pending || conflict || !draft.name.trim()) return;
    // A new explicit submission can create a fresh identity after a catalog deletion.
    if (
      draft.type === 'create' &&
      !unavailable &&
      draft.afterDeletion !== catalog.deletionRevision
    ) {
      const fresh = newDraft(draft.name);
      setEditor(fresh);
      void mutate({ ...fresh, template });
    } else void mutate({ ...draft, template });
  };
  const renderOption = (option: (typeof options)[number]) => (
    <TemplateOption
      key={option.id}
      label={option.label}
      template={option.value}
      disabled={disabled}
      pressed={option.id === active?.id}
      onClick={() => {
        if (deletion) setFailure(undefined);
        setChosen(option.id);
        apply(option.value);
      }}
    />
  );
  const title = translate('gallery.videoReview.annotationTextTemplates');
  const save = translate('gallery.videoReview.annotationTextTemplateSave');
  const personal = translate('gallery.videoReview.annotationTextTemplatesPersonal');
  const reload = catalog.status === 'unavailable' && (
    <ReviewButton
      label={translate('gallery.videoReview.annotationTextTemplatesReloadList')}
      className={reviewTextButtonClassName}
      disabled={pending}
      onClick={() => void catalog.reload()}
    />
  );
  return {
    picker: (
      <ReviewDetails label={title} preferenceId="text-templates" initiallyOpen>
        <div className="review-text-template-picker">
          <fieldset className="review-text-template-group">
            <legend>{translate('gallery.videoReview.annotationTextTemplatesBuiltin')}</legend>
            <div className="review-text-template-options">{builtin.map(renderOption)}</div>
          </fieldset>
          <fieldset className="review-text-template-group">
            <legend>{personal}</legend>
            {options.length > 0 ? (
              <div className="review-text-template-options">{options.map(renderOption)}</div>
            ) : catalog.status === 'ready' ? (
              <span className="review-text-template-status">
                {translate('gallery.videoReview.annotationTextTemplatesEmpty')}
              </span>
            ) : null}
            {selected && (
              <div className="review-text-template-actions" role="group" aria-label={selected.name}>
                {!active && (
                  <span className="review-text-template-label" title={selected.name}>
                    {selected.name}
                  </span>
                )}
                <ReviewButton
                  label={translate('gallery.videoReview.annotationTextTemplateUpdate')}
                  className={reviewTextButtonClassName}
                  disabled={disabled || pending}
                  onClick={() =>
                    setEditor({
                      type: 'update',
                      id: selected.id,
                      name: selected.name,
                      previous: selected.revision,
                    })
                  }
                >
                  {translate('gallery.videoReview.annotationTextTemplateUpdate')}
                </ReviewButton>
                <ReviewButton
                  label={translate('gallery.videoReview.annotationTextTemplateDelete')}
                  className={reviewTextButtonClassName}
                  disabled={disabled || pending || deletion !== undefined}
                  onClick={() => remove(selected)}
                >
                  {translate('gallery.videoReview.annotationTextTemplateDelete')}
                </ReviewButton>
              </div>
            )}
          </fieldset>
        </div>
      </ReviewDetails>
    ),
    form: (
      <>
        {deletion ? (
          <TemplateDeleteRecovery
            target={deletion}
            current={catalog.records.find((record) => record.id === deletion.id)}
            ready={!unavailable}
            disabled={disabled || pending}
            reload={reload}
            dismiss={() => setFailure(undefined)}
            remove={remove}
          />
        ) : !conflict && (failure || catalog.status === 'unavailable') ? (
          <div className="review-inspector-notice" role="alert">
            {translate('gallery.videoReview.annotationTextTemplateFailed')}
            {reload}
          </div>
        ) : null}
        {editor && (
          <form
            className="review-inspector-section-body"
            onSubmit={(event) => {
              event.preventDefault();
              submit(editor);
            }}
          >
            <TextField
              ref={input}
              label={translate('gallery.videoReview.annotationTextTemplateName')}
              value={editor.name}
              maxLength={80}
              disabled={pending}
              onChange={(event) => setEditor({ ...editor, name: event.currentTarget.value })}
            />
            {conflict && (
              <div className="review-inspector-notice" role="alert">
                {translate('gallery.videoReview.annotationTextTemplateChanged')}
                <div className="review-text-template-actions">
                  <ReviewButton
                    label={translate(
                      currentRecord
                        ? 'gallery.videoReview.annotationTextTemplateReload'
                        : 'gallery.videoReview.annotationTextTemplateSaveNew'
                    )}
                    className={reviewTextButtonClassName}
                    disabled={disabled || pending}
                    onClick={() => {
                      setFailure(undefined);
                      setEditor(
                        currentRecord
                          ? {
                              type: 'update',
                              id: currentRecord.id,
                              name: editor.name,
                              previous: currentRecord.revision,
                            }
                          : newDraft(editor.name)
                      );
                      input.current?.focus();
                    }}
                  />
                </div>
              </div>
            )}
            <div className="review-text-template-actions">
              <ReviewButton
                label={translate('gallery.videoReview.annotationTextTemplateConfirm')}
                type="submit"
                className={reviewTextButtonClassName}
                disabled={disabled || pending || conflict || !editor.name.trim()}
              >
                {translate('gallery.videoReview.annotationTextTemplateConfirm')}
              </ReviewButton>
              <ReviewButton
                label={translate('gallery.videoReview.annotationTextTemplateCancel')}
                className={reviewTextButtonClassName}
                disabled={pending}
                onClick={() => {
                  setEditor(undefined);
                  setFailure(undefined);
                }}
              >
                {translate('gallery.videoReview.annotationTextTemplateCancel')}
              </ReviewButton>
            </div>
          </form>
        )}
      </>
    ),
    save: (
      <ReviewButton
        label={save}
        className={reviewTextButtonClassName}
        disabled={disabled || unavailable || pending}
        onClick={() => {
          setFailure(undefined);
          setEditor(newDraft(''));
        }}
      >
        <Save size={16} aria-hidden />
        <span>{save}</span>
      </ReviewButton>
    ),
  };
}
