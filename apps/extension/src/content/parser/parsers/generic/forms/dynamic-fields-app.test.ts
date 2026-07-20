// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { PageProfile, SectionNode } from '@sniptale/runtime-contracts/dom-tree';
import { initContext } from '../../../dom-tree-parser/traversal';
import {
  DynamicFieldsEmbeddedAppParser,
  parseDynamicFieldsEmbeddedAppElement,
} from './dynamic-fields-app';

function appendElement<T extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement,
  tagName: T,
  props?: Partial<HTMLElementTagNameMap[T]>
): HTMLElementTagNameMap[T] {
  const element = document.createElement(tagName);
  if (props) {
    Object.assign(element, props);
  }
  parent.append(element);
  return element;
}

function createSection(title: string): SectionNode {
  return {
    type: 'section',
    id: `${title}-section`,
    title,
    children: [],
    selected: true,
  };
}

function buildVirtualDynamicFieldsContainer(): HTMLElement {
  const container = appendElement(document.body, 'div', {
    id: 'gwt-debug-EmbeddedApplicationContent.dynamicFields',
    className: 'GAQEVERFM',
  });
  appendElement(container, 'span', {
    id: 'gwt-debug-title',
    textContent: 'Дополнительные параметры',
  });

  const virtualContent = appendElement(container, 'div', {
    id: 'virtual-dynamic-fields',
  });
  virtualContent.setAttribute('data-virtual-iframe', 'true');
  virtualContent.setAttribute('data-application-code', 'dynamicFields');

  const field = appendElement(virtualContent, 'div', {
    className: 'FormField-EA__field FormField-EA__fieldRead',
    id: 'row-cost',
  });
  const fieldInfo = appendElement(field, 'div', {
    className: 'FormField-EA__fieldInfo',
  });
  appendElement(fieldInfo, 'label', {
    textContent: 'Стоимость',
  });
  const fieldBody = appendElement(field, 'div', {
    className: 'FormField-EA__fieldBody',
  });
  const controlBox = appendElement(fieldBody, 'div', {
    className: 'FormField-EA__controlBox',
  });
  const control = appendElement(controlBox, 'div', {
    className: 'FormField-EA__control',
  });
  appendElement(control, 'span', {
    className: 'MaskedField-EA__value',
    textContent: '800',
  });

  return virtualContent;
}

function appendDynamicField(root: ParentNode, labelText: string, valueText: string): void {
  const field = appendElement(root as HTMLElement, 'div', {
    className: 'FormField-EA__field FormField-EA__fieldRead',
  });
  const fieldInfo = appendElement(field, 'div', {
    className: 'FormField-EA__fieldInfo',
  });
  appendElement(fieldInfo, 'label', {
    textContent: labelText,
  });
  const fieldBody = appendElement(field, 'div', {
    className: 'FormField-EA__fieldBody',
  });
  const controlBox = appendElement(fieldBody, 'div', {
    className: 'FormField-EA__controlBox',
  });
  const control = appendElement(controlBox, 'div', {
    className: 'FormField-EA__control',
  });
  appendElement(control, 'span', {
    className: 'MaskedField-EA__value',
    textContent: valueText,
  });
}

function createProfile(): PageProfile {
  return {
    vendor: 'naumen-sd-gwt',
    appFamily: 'naumen-sd',
    pageKind: 'object-card-with-dynamic-fields',
    pipelineId: 'naumen-sd-gwt',
    confidence: 0.99,
    matchedSignals: [],
    preferredRoots: ['body'],
  };
}

afterEach(() => {
  document.body.replaceChildren();
  document.title = '';
});

function registerExistingSectionReuseTest() {
  it('reuses the titled dynamic-fields section instead of appending into the last active section', () => {
    const ctx = initContext(createProfile());
    const additionalParamsSection = createSection('Дополнительные параметры');
    const componentsSection = createSection('Компоненты КЕ (для редактирования)');

    ctx.result.structure.push(additionalParamsSection, componentsSection);
    ctx.currentSection = componentsSection;

    const virtualContainer = buildVirtualDynamicFieldsContainer();
    parseDynamicFieldsEmbeddedAppElement(virtualContainer, ctx);

    expect(additionalParamsSection.children).toHaveLength(1);
    expect(additionalParamsSection.children[0]).toMatchObject({
      type: 'field',
      label: 'Стоимость',
      value: '800',
    });
    expect(componentsSection.children).toHaveLength(0);
    expect(ctx.currentSection?.title).toBe('Дополнительные параметры');
  });
}

function registerDefaultSectionTitleTest() {
  it('creates a new default-titled section when dynamic fields have no visible title', () => {
    const ctx = initContext(createProfile());
    const virtualContainer = buildVirtualDynamicFieldsContainer();
    const titledShell = virtualContainer.closest('.GAQEVERFM');
    titledShell?.querySelector('#gwt-debug-title')?.remove();

    parseDynamicFieldsEmbeddedAppElement(virtualContainer, ctx);

    expect(ctx.result.structure).toHaveLength(1);
    expect(ctx.currentSection?.title).toBe('Дополнительные параметры');
    expect(ctx.currentSection?.children).toEqual([
      expect.objectContaining({
        label: 'Стоимость',
        value: '800',
      }),
    ]);
    expect(ctx.result.structure[0]).toBe(ctx.currentSection);
  });
}

function registerSkipChildrenNoopTest() {
  it('returns skipChildren without mutating sections when neither iframe nor virtual content yields fields', () => {
    const ctx = initContext(createProfile());
    const existingSection = createSection('Stable section');
    ctx.result.structure.push(existingSection);
    ctx.currentSection = existingSection;

    const emptyVirtualContainer = appendElement(document.body, 'div', {
      id: 'gwt-debug-EmbeddedApplicationContent.dynamicFields.empty',
    });
    emptyVirtualContainer.setAttribute('data-virtual-iframe', 'true');
    emptyVirtualContainer.setAttribute('data-application-code', 'dynamicFields');

    expect(parseDynamicFieldsEmbeddedAppElement(emptyVirtualContainer, ctx)).toEqual({
      skipChildren: true,
    });
    expect(existingSection.children).toEqual([]);
    expect(ctx.result.structure).toHaveLength(1);
    expect(ctx.currentSection).toBe(existingSection);
  });

  it('reuses the current section when it already matches the resolved title', () => {
    const ctx = initContext(createProfile());
    const existingSection = createSection('Дополнительные параметры');
    ctx.result.structure.push(existingSection);
    ctx.currentSection = existingSection;

    const virtualContainer = buildVirtualDynamicFieldsContainer();
    parseDynamicFieldsEmbeddedAppElement(virtualContainer, ctx);

    expect(ctx.result.structure).toHaveLength(1);
    expect(ctx.currentSection).toBe(existingSection);
    expect(existingSection.children).toEqual([
      expect.objectContaining({
        label: 'Стоимость',
        value: '800',
      }),
    ]);
  });
}

function registerOriginalIframePreferenceTest() {
  it('prefers original iframe extraction over virtual content when the iframe is available', () => {
    const ctx = initContext(createProfile());
    const iframeDocument = document.implementation.createHTMLDocument('dynamic-fields');
    appendDynamicField(iframeDocument.body, 'Стоимость', '1200');

    const originalIframe = appendElement(document.body, 'iframe', {
      id: 'virtual-dynamic-fields',
    });
    originalIframe.setAttribute('data-application-code', 'dynamicFields');
    Object.defineProperty(originalIframe, 'contentDocument', {
      configurable: true,
      value: iframeDocument,
    });
    const virtualContainer = buildVirtualDynamicFieldsContainer();

    const result = parseDynamicFieldsEmbeddedAppElement(virtualContainer, ctx);

    expect(result.fields).toEqual([
      expect.objectContaining({
        label: 'Стоимость',
        value: '1200',
      }),
    ]);
    expect(ctx.currentSection?.children).toEqual(result.fields ?? []);
  });
}

function registerSectionReuseAcrossResultTest() {
  it('reuses an existing titled section from the result tree when it is not current', () => {
    const ctx = initContext(createProfile());
    const reusableSection = createSection('Дополнительные параметры');
    const activeSection = createSection('Другая секция');
    ctx.result.structure.push(reusableSection, activeSection);
    ctx.currentSection = activeSection;

    parseDynamicFieldsEmbeddedAppElement(buildVirtualDynamicFieldsContainer(), ctx);

    expect(ctx.currentSection).toBe(reusableSection);
    expect(reusableSection.children).toEqual([
      expect.objectContaining({
        label: 'Стоимость',
        value: '800',
      }),
    ]);
  });
}

describe('parseDynamicFieldsEmbeddedAppElement', () => {
  registerExistingSectionReuseTest();
  registerDefaultSectionTitleTest();
  registerSkipChildrenNoopTest();
  registerOriginalIframePreferenceTest();
  registerSectionReuseAcrossResultTest();
});

describe('DynamicFieldsEmbeddedAppParser', () => {
  it('matches only virtual dynamicFields iframes', () => {
    const parser = new DynamicFieldsEmbeddedAppParser();
    const matching = document.createElement('div');
    matching.setAttribute('data-virtual-iframe', 'true');
    matching.setAttribute('data-application-code', 'dynamicFields');

    const wrongCode = document.createElement('div');
    wrongCode.setAttribute('data-virtual-iframe', 'true');
    wrongCode.setAttribute('data-application-code', 'mvs');

    const notVirtual = document.createElement('div');
    notVirtual.setAttribute('data-application-code', 'dynamicFields');

    expect(parser.canParse(matching, initContext(createProfile()))).toBe(true);
    expect(parser.canParse(wrongCode, initContext(createProfile()))).toBe(false);
    expect(parser.canParse(notVirtual, initContext(createProfile()))).toBe(false);
  });
});
