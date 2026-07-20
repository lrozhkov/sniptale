import {
  type AnnotationFieldsSectionProps,
  renderAnnotationAppearanceFields,
  renderAnnotationContentMetaFields,
  renderAnnotationContentFields,
  renderAnnotationMotionFields,
} from './field-sections';
import { translate, type TranslationKey } from '../../../../../platform/i18n';
import { resolveLocalizedText } from '../../../../../platform/i18n/localized-text';
import { resolveAnnotationTemplateControls } from '../../../../../features/video/project/annotation/template-controls';
import {
  VideoAnnotationControlSection,
  VideoAnnotationTargetBindingKind,
  createTemplateRefKey,
  getLegacyAnnotationTemplateRefs,
  resolveVideoAnnotationTemplate,
  type VideoAnnotationLocalizedText,
  type VideoAnnotationTemplate,
  type VideoAnnotationTemplateRef,
} from '../../../../../features/video/project/annotation-engine';
import { AnnotationTargetControls } from './target-controls';
import { InspectorGroupedPanel } from '../grouped-inspector';
import { AnnotationSummarySection } from './summary';
import { AnnotationGeneratedControls } from './generated-controls';
import {
  MODERN_ANNOTATION_CONTROL_SECTIONS,
  getTemplateControlsForSection,
} from './control-sections';
import { renderPointOrRectFields } from './target/fields';
import { DetailItem, DetailList } from '../shared/panel';

const MODERN_SECTION_LABELS: Record<VideoAnnotationControlSection, TranslationKey> = {
  [VideoAnnotationControlSection.ADVANCED]:
    'videoEditor.sidebar.annotationInspectorSectionAdvanced',
  [VideoAnnotationControlSection.APPEARANCE]:
    'videoEditor.sidebar.annotationInspectorSectionAppearance',
  [VideoAnnotationControlSection.CONTENT]: 'videoEditor.sidebar.annotationInspectorSectionContent',
  [VideoAnnotationControlSection.MOTION]: 'videoEditor.sidebar.annotationInspectorSectionMotion',
  [VideoAnnotationControlSection.PLACEMENT]:
    'videoEditor.sidebar.annotationInspectorSectionPlacement',
};

export function AnnotationFields(props: AnnotationFieldsSectionProps) {
  const controls = resolveAnnotationTemplateControls(props.clip.templateKind);
  return <InspectorGroupedPanel groups={createAnnotationGroups(props, controls.supportsTarget)} />;
}

export function createAnnotationGroups(
  props: AnnotationFieldsSectionProps,
  legacyUsesTargetGroup: boolean
) {
  const modernTemplate = resolveModernAnnotationTemplate(props.clip);
  if (modernTemplate) {
    return createModernAnnotationGroups(props, modernTemplate.template, modernTemplate.packLabel);
  }

  return createLegacyAnnotationGroups(props, legacyUsesTargetGroup);
}

function createLegacyAnnotationGroups(
  props: AnnotationFieldsSectionProps,
  usesTargetGroup: boolean
) {
  const legacyMeta = translate('videoEditor.sidebar.annotationLegacyComparisonLabel');

  // Legacy comparison stays isolated from declarative-template controls so a later deletion wave
  // can remove this branch without changing the modern schema-driven inspector.
  return [
    {
      id: 'general',
      label: translate('videoEditor.sidebar.inspectorGroupGeneral'),
      meta: legacyMeta,
      defaultActive: true,
      content: <AnnotationGeneralContent props={props} usesTargetGroup={usesTargetGroup} />,
    },
    createLegacyAnnotationContentGroup(props, legacyMeta),
    {
      id: 'style',
      label: translate('videoEditor.sidebar.inspectorGroupStyle'),
      meta: legacyMeta,
      content: renderAnnotationAppearanceFields(props),
      visible: !usesTargetGroup,
    },
    {
      id: 'target',
      label: translate('videoEditor.sidebar.inspectorGroupTarget'),
      meta: legacyMeta,
      content: (
        <AnnotationTargetControls
          clip={props.clip}
          disabled={props.disabled}
          onUpdateAnnotationClipTemplate={props.onUpdateAnnotationClipTemplate}
        />
      ),
      visible: usesTargetGroup,
    },
    {
      id: 'motion',
      label: translate('videoEditor.sidebar.inspectorGroupMotion'),
      meta: legacyMeta,
      content: renderAnnotationMotionFields(props),
    },
  ] as const;
}

function createLegacyAnnotationContentGroup(
  props: AnnotationFieldsSectionProps,
  legacyMeta: string
) {
  return {
    id: 'content',
    label: translate('videoEditor.sidebar.inspectorGroupContent'),
    meta: legacyMeta,
    content: (
      <>
        {renderAnnotationContentFields(props)}
        {renderAnnotationContentMetaFields(props)}
      </>
    ),
  };
}

function createModernAnnotationGroups(
  props: AnnotationFieldsSectionProps,
  template: VideoAnnotationTemplate,
  packLabel: VideoAnnotationLocalizedText | undefined
) {
  const usesTargetGroup = template.target.kind !== VideoAnnotationTargetBindingKind.NONE;
  const controlGroups = MODERN_ANNOTATION_CONTROL_SECTIONS.map((section) => {
    const controls = getTemplateControlsForSection(template, section);
    const placementTargetVisible = section === VideoAnnotationControlSection.PLACEMENT;
    return {
      id: section,
      label: translate(MODERN_SECTION_LABELS[section]),
      content: (
        <>
          <AnnotationGeneratedControls {...props} section={section} />
          {placementTargetVisible && usesTargetGroup ? renderPointOrRectFields(props) : null}
        </>
      ),
      visible: controls.length > 0 || (placementTargetVisible && usesTargetGroup),
    };
  });

  return [
    {
      id: 'basic',
      label: translate('videoEditor.sidebar.annotationInspectorSectionBasic'),
      defaultActive: true,
      content: <ModernAnnotationSummary packLabel={packLabel} template={template} />,
    },
    ...controlGroups,
  ] as const;
}

function AnnotationGeneralContent(props: {
  props: AnnotationFieldsSectionProps;
  usesTargetGroup: boolean;
}) {
  return (
    <>
      <AnnotationSummarySection {...props.props} />
      {props.usesTargetGroup ? renderAnnotationAppearanceFields(props.props) : null}
    </>
  );
}

function ModernAnnotationSummary(props: {
  packLabel: VideoAnnotationLocalizedText | undefined;
  template: VideoAnnotationTemplate;
}) {
  return (
    <DetailList>
      <DetailItem
        label={translate('videoEditor.sidebar.annotationTemplateLabel')}
        value={resolveLocalizedText(props.template.label)}
      />
      {props.packLabel ? (
        <DetailItem
          label={translate('videoEditor.sidebar.annotationTemplateThemeLabel')}
          value={resolveLocalizedText(props.packLabel)}
        />
      ) : null}
    </DetailList>
  );
}

function resolveModernAnnotationTemplate(clip: AnnotationFieldsSectionProps['clip']): {
  packLabel?: VideoAnnotationLocalizedText | undefined;
  template: VideoAnnotationTemplate;
} | null {
  const resolution = resolveVideoAnnotationTemplate(clip);
  const template =
    resolution.status === 'resolved' ? resolution.template : resolution.fallbackTemplate;
  const ref = resolveTemplateRefForModernClip(clip, resolution);

  if (!template || !ref || isLegacyTemplateRef(ref)) {
    return null;
  }

  return {
    packLabel:
      resolution.status === 'resolved' ? resolution.pack.label : clip.templateSnapshot?.packLabel,
    template,
  };
}

function resolveTemplateRefForModernClip(
  clip: AnnotationFieldsSectionProps['clip'],
  resolution: ReturnType<typeof resolveVideoAnnotationTemplate>
): VideoAnnotationTemplateRef | null {
  if (resolution.status === 'resolved') {
    return resolution.ref;
  }
  return resolution.ref ?? clip.templateRef ?? clip.templateSnapshot?.templateRef ?? null;
}

function isLegacyTemplateRef(ref: VideoAnnotationTemplateRef): boolean {
  const refKey = createTemplateRefKey(ref);
  return Object.values(getLegacyAnnotationTemplateRefs()).some(
    (legacyRef) => createTemplateRefKey(legacyRef) === refKey
  );
}
