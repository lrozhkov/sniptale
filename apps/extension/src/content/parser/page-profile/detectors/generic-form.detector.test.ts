// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { detectGenericForm } from './generic-form.detector';

function resetDetectorDom() {
  document.body.replaceChildren();
}

function appendFormShell(inputCount = 1) {
  const form = document.createElement('form');
  const inputs: HTMLInputElement[] = [];

  for (let index = 0; index < inputCount; index += 1) {
    const label = document.createElement('label');
    label.textContent = `Стоимость ${index + 1}`;
    const input = document.createElement('input');
    input.value = `12332${index}`;
    inputs.push(input);
    form.append(label, input);
  }

  document.body.append(form);
  return { form, inputs };
}

function appendNarrativeContentRoot(withControlCount = 0) {
  const main = document.createElement('main');
  const article = document.createElement('article');
  const heading = document.createElement('h1');
  heading.textContent = 'Narrative content';
  const firstParagraph = document.createElement('p');
  firstParagraph.textContent = 'A'.repeat(120);
  const secondParagraph = document.createElement('p');
  secondParagraph.textContent = 'B'.repeat(120);

  article.append(heading, firstParagraph, secondParagraph);

  for (let index = 0; index < withControlCount; index += 1) {
    article.append(document.createElement('input'));
  }

  main.append(article);
  document.body.append(main);
  return article;
}

afterEach(() => {
  resetDetectorDom();
});

describe('detectGenericForm', () => {
  it('returns null when no form-like root is present', () => {
    document.body.append(document.createElement('div'));

    expect(detectGenericForm(document)).toBeNull();
  });

  it('returns null when label or input coverage is incomplete', () => {
    const form = document.createElement('form');
    form.append(document.createElement('input'));
    document.body.append(form);

    expect(detectGenericForm(document)).toBeNull();
  });

  it('suppresses form detection when a narrative content root has only incidental controls', () => {
    appendFormShell();
    appendNarrativeContentRoot(0);

    expect(detectGenericForm(document)).toBeNull();
  });

  it('keeps form detection when the narrative content root also carries enough controls', () => {
    appendFormShell(9);
    appendNarrativeContentRoot(5);

    const result = detectGenericForm(document);

    expect(result?.profile.vendor).toBe('generic');
    expect(result?.profile.pageKind).toBe('form');
    expect(result?.profile.preferredRoots).toEqual(['form', 'main', '[role="main"]', 'body']);
  });
});
