// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { extractSchemaTextHint, extractSnapshotPayloads } from '.';

function resetPayloadExtractorDom(): void {
  document.head.replaceChildren();
  document.body.replaceChildren();
}

function createPayloadScript(type: string, text: string, id = ''): HTMLScriptElement {
  const script = document.createElement('script');
  script.type = type;
  script.textContent = text;
  if (id) {
    script.id = id;
  }
  return script;
}

beforeEach(() => {
  resetPayloadExtractorDom();
});

afterEach(() => {
  resetPayloadExtractorDom();
  vi.restoreAllMocks();
});

it('extracts json and json-ld payloads with stable ids and filtered empty payloads', () => {
  document.head.append(
    createPayloadScript('application/json', '  {"page":1}  ', '__NEXT_DATA__'),
    createPayloadScript('application/ld+json', '{"@type":"Article"}'),
    createPayloadScript('application/json', '   ')
  );

  expect(extractSnapshotPayloads()).toEqual([
    {
      id: '__NEXT_DATA__',
      kind: 'json',
      locator: 'script#__NEXT_DATA__',
      source: 'script-tag',
      textLength: 10,
    },
    {
      id: 'payload-2',
      kind: 'json-ld',
      locator: 'script[type="application/ld+json"]:nth-of-type(2)',
      source: 'script-tag',
      textLength: 19,
    },
  ]);
});

it('supports extracting from a narrowed parent root', () => {
  const nestedRoot = document.createElement('section');
  nestedRoot.append(
    createPayloadScript('application/json', '{"nested":true}'),
    createPayloadScript('application/ld+json', '{"@type":"Thing"}', 'schema-root')
  );

  const externalPayload = createPayloadScript('application/json', '{"external":true}', 'external');
  document.body.append(nestedRoot, externalPayload);

  expect(extractSnapshotPayloads(nestedRoot)).toEqual([
    {
      id: 'payload-1',
      kind: 'json',
      locator: 'script[type="application/json"]:nth-of-type(1)',
      source: 'script-tag',
      textLength: 15,
    },
    {
      id: 'schema-root',
      kind: 'json-ld',
      locator: 'script#schema-root',
      source: 'script-tag',
      textLength: 17,
    },
  ]);
});

it('extracts a schema text hint from json-ld payloads', () => {
  document.head.append(
    createPayloadScript(
      'application/ld+json',
      JSON.stringify({
        '@graph': [
          {
            '@type': 'WebPage',
          },
          {
            '@type': 'Article',
            articleBody: 'Canonical article body from schema payload.',
          },
        ],
      }),
      'schema-root'
    )
  );

  expect(extractSchemaTextHint(document)).toBe('Canonical article body from schema payload.');
});

it('skips oversized json-ld scripts before parsing and still reads later schema hints', () => {
  const parseSpy = vi.spyOn(JSON, 'parse');
  document.head.append(
    createPayloadScript('application/ld+json', JSON.stringify({ text: 'x'.repeat(256 * 1024) })),
    createPayloadScript(
      'application/ld+json',
      JSON.stringify({ articleBody: 'Bounded schema hint.' })
    )
  );

  expect(extractSchemaTextHint(document)).toBe('Bounded schema hint.');
  expect(parseSpy).toHaveBeenCalledTimes(1);
});

it('caps json-ld script count while searching for schema hints', () => {
  const parseSpy = vi.spyOn(JSON, 'parse');
  for (let index = 0; index < 25; index += 1) {
    document.head.append(createPayloadScript('application/ld+json', '{"@type":"Thing"}'));
  }
  document.head.append(
    createPayloadScript('application/ld+json', JSON.stringify({ articleBody: 'Too late.' }))
  );

  expect(extractSchemaTextHint(document)).toBeUndefined();
  expect(parseSpy).toHaveBeenCalledTimes(25);
});

it('caps total parsed json-ld characters while searching for schema hints', () => {
  const parseSpy = vi.spyOn(JSON, 'parse');
  const filler = JSON.stringify({ description: 'x'.repeat(200 * 1024) });
  document.head.append(
    createPayloadScript('application/ld+json', filler),
    createPayloadScript('application/ld+json', filler),
    createPayloadScript('application/ld+json', filler),
    createPayloadScript(
      'application/ld+json',
      JSON.stringify({ articleBody: 'Past total budget.' })
    )
  );

  expect(extractSchemaTextHint(document)).toBeUndefined();
  expect(parseSpy).toHaveBeenCalledTimes(2);
});
