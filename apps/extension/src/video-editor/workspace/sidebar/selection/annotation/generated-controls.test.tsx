// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APPLE_GLASS_ANNOTATION_PACK,
  CURSOR_OPS_ANNOTATION_PACK,
  VideoAnnotationControlSection,
  VIDEO_ANNOTATION_PACK_SCHEMA_VERSION,
  VideoAnnotationControlBindingKind,
  VideoAnnotationControlType,
  VideoAnnotationElementKind,
  VideoAnnotationRenderNodeKind,
  VideoAnnotationTargetBindingKind,
  type VideoAnnotationPack,
  type VideoAnnotationTemplate,
} from '../../../../../features/video/project/annotation-engine';
import { createAnnotationClip } from '../../../../../features/video/project/factories/overlay-clip';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import { AnnotationGeneratedControls } from './generated-controls';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

function createTemplate(): VideoAnnotationTemplate {
  return {
    id: 'custom-title',
    label: { fallback: 'Custom title' },
    description: { fallback: 'Custom generated control template' },
    elementKind: VideoAnnotationElementKind.TITLE,
    controls: createTemplateControls(),
    renderTree: {
      id: 'root',
      nodeType: VideoAnnotationRenderNodeKind.TEXT,
      props: { text: 'field:headline' },
    },
    target: { kind: VideoAnnotationTargetBindingKind.NONE },
    timeline: { durationMs: 1000, labels: [], phases: [], tracks: [] },
  };
}

function createTemplateControls(): VideoAnnotationTemplate['controls'] {
  return [createHeadlineControl(), createAccentControl(), createFontFamilyControl()];
}

function createHeadlineControl(): VideoAnnotationTemplate['controls'][number] {
  return {
    id: 'headline',
    label: { fallback: 'Generated headline' },
    type: VideoAnnotationControlType.TEXT,
    defaultValue: 'Snapshot headline',
    binding: {
      kind: VideoAnnotationControlBindingKind.TEMPLATE_FIELD,
      field: 'content.headline',
    },
  };
}

function createAccentControl(): VideoAnnotationTemplate['controls'][number] {
  return {
    id: 'accent',
    label: { fallback: 'Generated accent' },
    type: VideoAnnotationControlType.COLOR,
    defaultValue: '#2563eb',
    binding: {
      kind: VideoAnnotationControlBindingKind.NODE_PROPERTY,
      nodeId: 'root',
      property: 'fill',
    },
  };
}

function createFontFamilyControl(): VideoAnnotationTemplate['controls'][number] {
  return {
    id: 'fontFamily',
    label: { fallback: 'Generated family' },
    type: VideoAnnotationControlType.SELECT,
    defaultValue: 'inter',
    options: [
      { label: { fallback: 'Inter' }, value: 'inter' },
      { label: { fallback: 'System' }, value: 'system' },
    ],
    binding: {
      kind: VideoAnnotationControlBindingKind.NODE_PROPERTY,
      nodeId: 'root',
      property: 'fontFamily',
    },
  };
}

describe('annotation generated controls', () => {
  registerCustomGeneratedControlTests();
  registerBuiltInGeneratedControlTests();
  registerGeneratedControlMutationTests();
});

function registerCustomGeneratedControlTests() {
  it('renders controls from a custom template snapshot', () => {
    const project = createEmptyVideoProject('Generated controls');
    const clip = createAnnotationClip(project.tracks[2]!.id, project.width, project.height, 0);
    const template = createTemplate();
    clip.templateRef = { packId: 'custom.pack', templateId: template.id };
    clip.templateControlValues = undefined;
    clip.templateSnapshot = {
      capturedAtSchemaVersion: VIDEO_ANNOTATION_PACK_SCHEMA_VERSION,
      controls: { headline: 'Stored headline' },
      template,
      templateRef: clip.templateRef,
    };

    const markup = renderToStaticMarkup(
      <AnnotationGeneratedControls
        clip={clip}
        disabled={false}
        onUpdateAnnotationClipContent={vi.fn()}
        onUpdateAnnotationClipStyle={vi.fn()}
        onUpdateAnnotationClipTemplate={vi.fn()}
      />
    );

    expect(markup).toContain('Generated headline');
    expect(markup).toContain('Stored headline');
    expect(markup).toContain('Generated accent');
    expect(markup).toContain('Generated family');
    expect(markup).toContain('shared.ui.compact-inspector.select-field');
    expect(markup).not.toContain('video-editor.selection.compact-field');
  });
}

function registerBuiltInGeneratedControlTests() {
  registerBuiltInLabelControlTests();
  registerBuiltInSectionControlTests();
}

function registerBuiltInLabelControlTests() {
  it('renders localized built-in labels and options without fallback labels', () => {
    const appleMarkup = renderToStaticMarkup(
      <AnnotationGeneratedControls
        {...createBuiltInProps(
          APPLE_GLASS_ANNOTATION_PACK,
          APPLE_GLASS_ANNOTATION_PACK.templates.callout[0]!
        )}
      />
    );
    const cursorMarkup = renderToStaticMarkup(
      <AnnotationGeneratedControls
        {...createBuiltInProps(
          CURSOR_OPS_ANNOTATION_PACK,
          CURSOR_OPS_ANNOTATION_PACK.templates.title[0]!
        )}
      />
    );

    expect(appleMarkup).toContain('videoEditor.sidebar.annotationHeadlineLabel');
    expect(appleMarkup).toContain('videoEditor.sidebar.annotationTemplates.controls.easeOut');
    expect(cursorMarkup).toContain('videoEditor.sidebar.annotationTemplates.controls.linear');
    expect(appleMarkup).not.toContain('>Headline<');
    expect(appleMarkup).not.toContain('Motion easing');
    expect(cursorMarkup).not.toContain('Linear');
  });
}

function registerBuiltInSectionControlTests() {
  it('filters modern controls by schema section', () => {
    const markup = renderToStaticMarkup(
      <AnnotationGeneratedControls
        {...createBuiltInProps(
          APPLE_GLASS_ANNOTATION_PACK,
          APPLE_GLASS_ANNOTATION_PACK.templates.lowerThird[0]!
        )}
        section={VideoAnnotationControlSection.CONTENT}
      />
    );

    expect(markup).toContain('videoEditor.sidebar.annotationHeadlineLabel');
    expect(markup).toContain('videoEditor.sidebar.annotationSublineLabel');
    expect(markup).not.toContain('videoEditor.sidebar.annotationAccentColorLabel');
    expect(markup).not.toContain('videoEditor.sidebar.annotationTemplates.controls.durationMs');
  });

  it('hides generated controls that are not used by the built-in render tree', () => {
    const markup = renderToStaticMarkup(
      <AnnotationGeneratedControls
        {...createBuiltInProps(
          APPLE_GLASS_ANNOTATION_PACK,
          APPLE_GLASS_ANNOTATION_PACK.templates.title[0]!
        )}
        section={VideoAnnotationControlSection.CONTENT}
      />
    );

    expect(markup).toContain('videoEditor.sidebar.annotationHeadlineLabel');
    expect(markup).toContain('videoEditor.sidebar.annotationSublineLabel');
    expect(markup).not.toContain('videoEditor.sidebar.annotationBadgeLabel');
  });
}

function registerGeneratedControlMutationTests() {
  it('persists generated control updates into template values and compatibility fields', () => {
    const props = createBuiltInProps(
      APPLE_GLASS_ANNOTATION_PACK,
      APPLE_GLASS_ANNOTATION_PACK.templates.title[0]!
    );

    act(() => {
      root?.render(
        <AnnotationGeneratedControls {...props} section={VideoAnnotationControlSection.CONTENT} />
      );
    });

    const headlineInput = container?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      'input, textarea'
    );
    expect(headlineInput).not.toBeNull();
    act(() => {
      if (headlineInput) {
        setInputValue(headlineInput, 'Updated headline');
        headlineInput.dispatchEvent(new Event('input', { bubbles: true }));
        headlineInput.dispatchEvent(new Event('change', { bubbles: true }));
        headlineInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
      }
    });

    expect(props.onUpdateAnnotationClipTemplate).toHaveBeenCalledWith(
      props.clip.id,
      expect.objectContaining({
        content: expect.objectContaining({ headline: 'Updated headline' }),
        templateControlValues: expect.objectContaining({ headline: 'Updated headline' }),
        templateSnapshot: expect.objectContaining({
          controls: expect.objectContaining({ headline: 'Updated headline' }),
          templateRef: props.clip.templateRef,
        }),
      })
    );
  });
}

function createBuiltInProps(pack: VideoAnnotationPack, template: VideoAnnotationTemplate) {
  const project = createEmptyVideoProject('Generated built-in controls');
  const clip = createAnnotationClip(project.tracks[2]!.id, project.width, project.height, 0, {
    pack,
    packLabel: pack.label,
    packTheme: pack.theme,
    template,
    templateRef: { packId: pack.packId, templateId: template.id },
  });

  return {
    clip,
    disabled: false,
    onUpdateAnnotationClipContent: vi.fn(),
    onUpdateAnnotationClipStyle: vi.fn(),
    onUpdateAnnotationClipTemplate: vi.fn(),
  } as const;
}

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  valueSetter?.call(input, value);
}
