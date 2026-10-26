import { useEffect, useId, useRef, useState } from 'react';
import { InspectorDisclosureView } from '../../../../../ui/compact-inspector-controls/disclosure';
import { TextareaField } from '../../../../../ui/compact-inspector-controls/textarea-field';
import { ProductInput, ProductSelect } from '@sniptale/ui/product-form-controls';
import { DesignReviewSettings } from '../view';
import { openDesignReviewTarget } from '../../../../selection/design-review';
import { copyDesignReviewText } from '../../session/clipboard';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate } from '../../../../../platform/i18n';
import type { DesignReviewTool } from '../../../../selection/design-review';
import type { DesignReviewActions, DesignReviewViewState } from '../../types';
import { inspectReviewElement, parseReviewCss, ReviewCssValidationError } from '../tools-model';

type Props = { actions: DesignReviewActions; disabled: boolean; state: DesignReviewViewState };

function useReviewCssEditor({ actions, state }: Props) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const checkpoint = useRef('');
  const editing = useRef(false);
  const [shownDraft, setShownDraft] = useState<Element | null>(null);
  const drafts = actions.tools?.cssDrafts;
  const target = shownDraft ?? state.selection?.element ?? drafts?.items[0]?.target ?? null;
  const draft = drafts?.read(target) ?? '';
  const currentTarget = state.selection?.element ?? null;
  const selectorLabel = state.selection?.selectorLabel;
  const registerEditorCancel = drafts?.registerEditorCancel;
  const write = drafts?.write;
  useEffect(() => {
    setShownDraft(null);
    editing.current = false;
    textarea.current?.blur();
  }, [currentTarget]);
  useEffect(
    () =>
      registerEditorCancel?.(() => {
        if (!editing.current || !target) return false;
        write?.(target, selectorLabel ?? target.tagName, checkpoint.current);
        editing.current = false;
        textarea.current?.blur();
        return true;
      }),
    [registerEditorCancel, write, target, selectorLabel]
  );
  return {
    textarea,
    checkpoint,
    drafts,
    target,
    draft,
    currentTarget,
    shownDraft,
    setShownDraft,
    editableTarget: target?.isConnected && target === currentTarget,
    focus() {
      checkpoint.current = draft;
      editing.current = true;
    },
    blur() {
      editing.current = false;
    },
    change(value: string) {
      if (target) write?.(target, selectorLabel ?? target.tagName, value);
    },
    discard() {
      if (target) drafts?.discard(target);
      checkpoint.current = '';
    },
  };
}
type ReviewCssEditor = ReturnType<typeof useReviewCssEditor>;

function useReviewCssApply(editor: ReviewCssEditor, { actions, state }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const revision = useRef(0);
  const { currentTarget, target, draft, drafts, editableTarget, checkpoint } = editor;
  useEffect(() => {
    revision.current += 1;
    setError(null);
    setPending(false);
  }, [currentTarget]);
  const apply = () => {
    if (!target || !editableTarget || !actions.tools || !drafts || pending) return;
    const request = ++revision.current;
    setError(null);
    try {
      if (!state.selection || state.selection.element !== target) return;
      const declarations = parseReviewCss(state.selection.element, draft);
      actions.tools.finish();
      setPending(true);
      void actions.tools
        .apply(declarations)
        .then(() => {
          actions.tools?.finish();
          drafts.accept(target);
          checkpoint.current = draft;
        })
        .catch(() => {
          if (request === revision.current)
            setError(translate('content.designReview.cssDraftError'));
        })
        .finally(() => {
          if (request === revision.current) setPending(false);
        });
    } catch (failure) {
      setError(
        failure instanceof ReviewCssValidationError
          ? translate(`content.designReview.cssError${failure.reason}`).replace(
              '{property}',
              failure.property
            )
          : translate('content.designReview.cssDraftError')
      );
    }
  };
  return { error, pending, apply };
}

function ReviewCssDraftNavigation({ editor }: { editor: ReviewCssEditor }) {
  const { drafts, shownDraft, setShownDraft, target, editableTarget } = editor;
  return (
    <>
      {drafts?.items.length ? (
        <ProductSelect
          controlSize="sm"
          aria-label={translate('content.designReview.cssSavedDrafts')}
          placeholder={translate('content.designReview.cssSavedDrafts')}
          value={
            shownDraft ? String(drafts.items.findIndex((item) => item.target === shownDraft)) : ''
          }
          options={drafts.items.map((item, index) => ({
            value: String(index),
            label: item.target.isConnected
              ? item.label
              : `${item.label} · ${translate('content.designReview.cssTargetRemoved')}`,
          }))}
          onChange={(value) => {
            const item = drafts.items.find((_item, index) => String(index) === value);
            if (item) setShownDraft(item.target);
          }}
        />
      ) : null}
      {target && !editableTarget ? (
        <div className="grid gap-1 text-xs">
          <p role="status">
            {translate(
              target.isConnected
                ? 'content.designReview.cssOtherTarget'
                : 'content.designReview.cssTargetRemoved'
            )}
          </p>
          {target.isConnected ? (
            <ProductActionButton
              compact
              tone="secondary"
              onClick={() => openDesignReviewTarget(target, 'draft')}
            >
              {translate('content.designReview.cssVisitTarget')}
            </ProductActionButton>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function ReviewCssActions({
  editor,
  pending,
  disabled,
  tools,
}: {
  editor: ReviewCssEditor;
  pending: boolean;
  disabled: boolean;
  tools: DesignReviewActions['tools'];
}) {
  const { draft, editableTarget } = editor;
  return (
    <div className="flex flex-wrap gap-1">
      <ProductActionButton
        compact
        type="submit"
        disabled={disabled || pending || !draft.trim() || !editableTarget || !tools}
      >
        {translate('content.designReview.applyCss')}
      </ProductActionButton>
      {draft ? (
        <>
          <ProductActionButton
            compact
            tone="secondary"
            onClick={() => void copyDesignReviewText(draft, 'content.designReview.cssDraftCopied')}
          >
            {translate('content.designReview.cssCopyDraft')}
          </ProductActionButton>
          <ProductActionButton compact tone="secondary" disabled={pending} onClick={editor.discard}>
            {translate('content.designReview.cssDiscardDraft')}
          </ProductActionButton>
        </>
      ) : null}
    </div>
  );
}

function ReviewCssControl(props: Props) {
  const errorId = useId();
  const editor = useReviewCssEditor(props);
  const { error, pending, apply } = useReviewCssApply(editor, props);
  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      <ReviewCssDraftNavigation editor={editor} />
      <TextareaField
        ref={editor.textarea}
        label={translate('content.designReview.directCss')}
        value={editor.draft}
        maxLength={16000}
        disabled={props.disabled || pending}
        readOnly={!editor.editableTarget}
        onFocus={editor.focus}
        onBlur={editor.blur}
        onChange={editor.change}
        placeholder={translate('content.designReview.cssExample')}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
      />
      {error ? (
        <p id={errorId} role="alert">
          {error}
        </p>
      ) : null}
      <ReviewCssActions
        editor={editor}
        pending={pending}
        disabled={props.disabled}
        tools={props.actions.tools}
      />
    </form>
  );
}

/** Each page tool exposes only its own controls, outside the comment composer. */
export function ReviewToolsSection(props: Props & { tool: Exclude<DesignReviewTool, 'comment'> }) {
  const [cssOpen, setCssOpen] = useState(false);
  const [computedOpen, setComputedOpen] = useState(false);
  const [computedFilter, setComputedFilter] = useState('');
  const selection = props.state.selection;
  if (!selection && (props.tool !== 'inspect' || !props.actions.tools?.cssDrafts.items.length))
    return null;
  if (props.tool === 'move') return null;
  if (props.tool === 'compare') return null;
  const current = selection
    ? inspectReviewElement(selection.element, selection.selectorLabel)
    : null;
  const cssLabel = translate('content.designReview.directCss');
  const draftBadge = props.actions.tools?.cssDrafts.items.length
    ? ` · ${translate('content.designReview.cssDraftBadge')}`
    : '';
  const computedValues = Object.entries(current?.values ?? {}).filter(([key, value]) =>
    `${key} ${value}`.toLowerCase().includes(computedFilter.trim().toLowerCase())
  );
  return (
    <div className="grid min-w-0 gap-3 text-xs" data-ui="content.design-review.inspector-controls">
      {selection ? <DesignReviewSettings {...props} presentation="workspace" /> : null}
      <InspectorDisclosureView
        dataUi="content.design-review.css-section"
        variant="structural"
        level="section"
        label={`${cssLabel}${draftBadge}`}
        open={cssOpen}
        onOpenChange={setCssOpen}
        bodyClassName="px-2 pb-3 pt-2"
      >
        <ReviewCssControl {...props} />
      </InspectorDisclosureView>
      <InspectorDisclosureView
        dataUi="content.design-review.computed-section"
        variant="structural"
        level="section"
        label={translate('content.designReview.inspectStyles')}
        open={computedOpen}
        onOpenChange={setComputedOpen}
        bodyClassName="px-2 pb-3 pt-2"
      >
        <div className="mb-2 flex min-w-0 gap-1">
          <ProductInput
            className="min-w-0 flex-1"
            aria-label={translate('content.designReview.computedFilter')}
            placeholder={translate('content.designReview.computedFilter')}
            value={computedFilter}
            onChange={(event) => setComputedFilter(event.currentTarget.value)}
          />
          <ProductActionButton
            compact
            tone="secondary"
            disabled={!computedValues.length}
            onClick={() =>
              void copyDesignReviewText(
                computedValues.map(([key, value]) => `${key}: ${value};`).join('\n'),
                'content.designReview.computedCopied'
              )
            }
          >
            {translate('content.designReview.computedCopy')}
          </ProductActionButton>
        </div>
        {!computedValues.length ? (
          <p role="status">{translate('content.designReview.computedEmpty')}</p>
        ) : null}
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 select-text">
          {computedValues.map(([key, value]) => (
            <div key={key} className="contents">
              <dt>{key}</dt>
              <dd className="break-all">{value || '—'}</dd>
            </div>
          ))}
        </dl>
      </InspectorDisclosureView>
    </div>
  );
}
