import { Settings2 } from 'lucide-react';
import type { TranslationKey } from '../../../platform/i18n';
import { translate } from '../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductDropdownMenu } from '@sniptale/ui/product-menus/dropdown';
import { ValueBadge } from '@sniptale/ui/editor-chrome';
import { SCENARIO_TEMPLATE_GROUPS } from '../../../features/scenario/project/v3/templates';
import { ScenarioTemplatePreview } from './picker-preview';
import { groupScenarioTemplates } from './picker-groups';
import type { ScenarioTemplatePickerProps } from './types';

const BUNDLED_TEMPLATE_COPY = {
  'before-after': {
    description: 'scenario.editor.templateBeforeAfterDescription',
    label: 'scenario.editor.templateBeforeAfterLabel',
  },
  blank: {
    description: 'scenario.editor.templateBlankDescription',
    label: 'scenario.editor.templateBlankLabel',
  },
  'code-focus': {
    description: 'scenario.editor.templateCodeFocusDescription',
    label: 'scenario.editor.templateCodeFocusLabel',
  },
  'screenshot-callout': {
    description: 'scenario.editor.templateScreenshotCalloutDescription',
    label: 'scenario.editor.templateScreenshotCalloutLabel',
  },
  'screenshot-focus': {
    description: 'scenario.editor.templateScreenshotFocusDescription',
    label: 'scenario.editor.templateScreenshotFocusLabel',
  },
  'section-divider': {
    description: 'scenario.editor.templateSectionDividerDescription',
    label: 'scenario.editor.templateSectionDividerLabel',
  },
  'step-guide': {
    description: 'scenario.editor.templateStepGuideDescription',
    label: 'scenario.editor.templateStepGuideLabel',
  },
  summary: {
    description: 'scenario.editor.templateSummaryDescription',
    label: 'scenario.editor.templateSummaryLabel',
  },
  title: {
    description: 'scenario.editor.templateTitleDescription',
    label: 'scenario.editor.templateTitleLabel',
  },
} as const satisfies Record<string, { description: TranslationKey; label: TranslationKey }>;

const TEMPLATE_GROUP_LABELS = {
  [SCENARIO_TEMPLATE_GROUPS.code]: 'scenario.editor.layoutGroupCode',
  [SCENARIO_TEMPLATE_GROUPS.comparison]: 'scenario.editor.layoutGroupComparison',
  [SCENARIO_TEMPLATE_GROUPS.section]: 'scenario.editor.layoutGroupSection',
  [SCENARIO_TEMPLATE_GROUPS.summary]: 'scenario.editor.layoutGroupSummary',
  [SCENARIO_TEMPLATE_GROUPS.walkthrough]: 'scenario.editor.layoutGroupWalkthrough',
} as const satisfies Record<string, TranslationKey>;

export function ScenarioTemplatePicker(props: ScenarioTemplatePickerProps) {
  const content = (
    <>
      <div className="flex items-center justify-between border-b border-[var(--sniptale-color-border-soft)] p-3">
        <TemplatePickerHeader />
        <button
          type="button"
          aria-label={translate('scenario.editor.templateManagerOpen')}
          onClick={props.onOpenManager}
          className="inline-flex h-8 w-8 items-center justify-center rounded-[8px]
            text-[var(--sniptale-color-text-secondary)] hover:bg-[var(--sniptale-color-surface-hover)]"
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 overflow-auto p-3">
        <div className="grid gap-5">
          {groupScenarioTemplates(props.templates).map((group) => (
            <TemplateGroup key={group.group} group={group} picker={props} />
          ))}
        </div>
      </div>
    </>
  );

  if (props.surface === 'embedded') {
    return (
      <div
        data-ui="scenario.templates.picker"
        className="grid w-full grid-rows-[auto_1fr] overflow-hidden rounded-[8px] border
          border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]"
      >
        {content}
      </div>
    );
  }

  return (
    <ProductDropdownMenu
      data-ui="scenario.templates.picker"
      className="grid max-h-[min(680px,calc(100vh-6rem))] w-full grid-rows-[auto_1fr]
        overflow-hidden p-0"
    >
      {content}
    </ProductDropdownMenu>
  );
}

function TemplatePickerHeader() {
  return (
    <div className="grid gap-1">
      <h2 className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
        {translate('scenario.editor.layouts')}
      </h2>
      <p className="text-xs text-[var(--sniptale-color-text-muted)]">
        {translate('scenario.editor.templates')}
      </p>
    </div>
  );
}

function TemplateGroup(props: {
  group: ReturnType<typeof groupScenarioTemplates>[number];
  picker: ScenarioTemplatePickerProps;
}) {
  return (
    <section className="grid gap-2">
      <h3 className="text-[11px] font-semibold uppercase text-[var(--sniptale-color-text-muted)]">
        {getTemplateGroupLabel(props.group.group)}
      </h3>
      <div className="grid gap-2">
        {props.group.templates.map((template) => (
          <TemplateCard
            key={`${template.source}:${template.templateId}`}
            picker={props.picker}
            template={template}
          />
        ))}
      </div>
    </section>
  );
}

function TemplateCard(props: {
  picker: ScenarioTemplatePickerProps;
  template: ScenarioTemplatePickerProps['templates'][number];
}) {
  return (
    <article
      className="grid grid-cols-[128px_minmax(0,1fr)] gap-3 rounded-[8px] border
        border-[var(--sniptale-color-border-soft)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_92%,var(--sniptale-color-surface-hover)_8%)]
        p-2"
    >
      <ScenarioTemplatePreview template={props.template} />
      <div className="grid min-w-0 gap-2">
        <div className="grid min-w-0 gap-1">
          <div className="truncate text-sm font-medium text-[var(--sniptale-color-text-primary)]">
            {getTemplateLabel(props.template)}
          </div>
          <div className="line-clamp-2 text-xs text-[var(--sniptale-color-text-muted)]">
            {getTemplateDescription(props.template)}
          </div>
          <ValueBadge className="w-fit text-[11px]">
            {getTemplateSourceLabel(props.template)}
          </ValueBadge>
        </div>
        <div className="flex justify-end gap-2">
          <ProductActionButton compact onClick={() => props.picker.onCreateSlide(props.template)}>
            {translate('scenario.editor.newSlideFromTemplate')}
          </ProductActionButton>
        </div>
      </div>
    </article>
  );
}

function getTemplateGroupLabel(group: string) {
  return translate(
    Object.entries(TEMPLATE_GROUP_LABELS).find(([key]) => key === group)?.[1] ??
      'scenario.editor.layoutGroupSection'
  );
}

function getTemplateCopy(template: ScenarioTemplatePickerProps['templates'][number]) {
  return template.source === 'bundled'
    ? Object.entries(BUNDLED_TEMPLATE_COPY).find(
        ([templateId]) => templateId === template.templateId
      )?.[1]
    : undefined;
}

function getTemplateDescription(template: ScenarioTemplatePickerProps['templates'][number]) {
  const copy = getTemplateCopy(template);
  return copy ? translate(copy.description) : template.description;
}

function getTemplateLabel(template: ScenarioTemplatePickerProps['templates'][number]) {
  const copy = getTemplateCopy(template);
  return copy ? translate(copy.label) : template.label;
}

function getTemplateSourceLabel(template: ScenarioTemplatePickerProps['templates'][number]) {
  return template.source === 'bundled'
    ? translate('scenario.editor.layoutSourceBundled')
    : translate('scenario.editor.layoutSourceImported');
}
