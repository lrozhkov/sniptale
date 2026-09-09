import { AutoProcessingModal, AutoProcessingLayer } from './auto-transform-modal';
import { AutoProcessingReview, AutoProcessingFooter } from './auto-transform-steps';
import { FloatingChromePanel } from '@sniptale/ui/floating-chrome';
import { useState } from 'react';
import { ArrowLeft, WandSparkles } from 'lucide-react';
import { ProductModalBody } from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { formatNumber, translate, useAppLocale } from '../../../../../platform/i18n';
import { AutoProcessingSetup } from './auto-transform-setup';
import {
  useAutoProcessingWorkflow,
  type AutoProcessingWorkflowProps,
} from './auto-transform-workflow';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { toolbarButtonClassName } from './constants/button';

export type AutoProcessingHeaderProps = Omit<AutoProcessingWorkflowProps, 'onClose'> & {
  onModalVisibilityChange: (visible: boolean) => void;
};
export function ProjectTimelineAutoProcessingControl(
  props: AutoProcessingHeaderProps & { visible?: boolean }
) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {props.visible !== false ? (
        <ContentToolbarButton
          className={toolbarButtonClassName}
          dataUi="video-editor.auto.open"
          title={translate('videoEditor.timeline.autoTransform')}
          onClick={() => setOpen(true)}
        >
          <WandSparkles size={14} aria-hidden="true" />
          <span className="@max-[1600px]/timeline:sr-only">
            {translate('videoEditor.timeline.autoTransform')}
          </span>
        </ContentToolbarButton>
      ) : null}
      {open ? <AutoTransformWizard {...props} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
export function AutoTransformWizard(props: AutoProcessingHeaderProps & { onClose: () => void }) {
  const locale = useAppLocale();
  const seconds = (value: number) =>
    `${formatNumber(value, { maximumFractionDigits: 2 }, locale)} ${translate('videoEditor.timeline.autoSeconds')}`;
  const {
    choices,
    scope,
    settings,
    camera,
    typingRate,
    framingScale,
    setTypingRate,
    setFramingScale,
    analysis,
    preview,
    selectedIds,
    busy,
    applying,
    originalInterval,
    step,
    stale,
    status,
    selectionChanged,
    prepare,
    apply,
    close,
    setOriginalInterval,
    setStep,
    patchSettings,
    toggleScope,
    toggleCamera,
    toggleSuggestion,
    viewOriginal,
  } = useAutoProcessingWorkflow(props);
  const content = originalInterval ? (
    <FloatingChromePanel
      dataUi="video-editor.auto.original"
      className="fixed right-4 top-20 z-50 flex max-w-lg items-center gap-4 p-3 text-sm"
    >
      <div className="min-w-0">
        <p className="font-medium">
          {translate('videoEditor.timeline.autoOriginal')} · {seconds(originalInterval.start)}–
          {seconds(originalInterval.end)}
        </p>
        <p className="mt-1 text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('videoEditor.timeline.autoOriginalPlayback')}
        </p>
      </div>
      <ProductActionButton
        compact
        tone="secondary"
        data-ui="video-editor.auto.return"
        onClick={() => setOriginalInterval(null)}
      >
        <ArrowLeft size={14} aria-hidden="true" />
        {translate('videoEditor.timeline.autoReturn')}
      </ProductActionButton>
    </FloatingChromePanel>
  ) : (
    <AutoProcessingModal
      onClose={close}
      applying={applying}
      step={step}
      onVisibilityChange={props.onModalVisibilityChange}
    >
      <ProductModalBody
        compact
        className="min-h-0 max-h-[min(400px,calc(100vh_-_240px))] !gap-0 !p-0"
      >
        {step === 'setup' ? (
          <AutoProcessingSetup
            choices={choices}
            scope={scope}
            settings={settings}
            camera={camera}
            typingRate={typingRate}
            framingScale={framingScale}
            onTypingRate={setTypingRate}
            onFramingScale={setFramingScale}
            busy={busy}
            seconds={seconds}
            onToggleScope={toggleScope}
            onChangeSettings={patchSettings}
            onToggleCamera={toggleCamera}
          />
        ) : (
          <AutoProcessingReview
            analysis={analysis}
            preview={preview}
            selectedIds={selectedIds}
            action={settings.stableSegments.action}
            stale={stale}
            selectionChanged={selectionChanged}
            busy={busy}
            seconds={seconds}
            onToggleSuggestion={toggleSuggestion}
            onViewOriginal={viewOriginal}
          />
        )}
      </ProductModalBody>
      {status ? (
        <p
          role="status"
          className="shrink-0 border-t border-[var(--sniptale-color-border-soft)] px-5 py-3 text-xs leading-relaxed"
        >
          {status}
        </p>
      ) : null}
      <AutoProcessingFooter
        step={step}
        busy={busy}
        applying={applying}
        selectionChanged={selectionChanged}
        stale={stale}
        preview={preview}
        selectedCount={selectedIds.length}
        hasScope={scope.length > 0}
        onBack={() => setStep('setup')}
        close={close}
        prepare={prepare}
        apply={apply}
      />
    </AutoProcessingModal>
  );
  return <AutoProcessingLayer>{content}</AutoProcessingLayer>;
}
