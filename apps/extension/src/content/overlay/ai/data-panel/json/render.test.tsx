// @vitest-environment jsdom

import React from 'react';
import { describe, expect, it, vi } from 'vitest';

const { tokenizeJsonForPreviewMock } = vi.hoisted(() => ({
  tokenizeJsonForPreviewMock: vi.fn(),
}));

vi.mock('./tokenizer', () => ({
  tokenizeJsonForPreview: tokenizeJsonForPreviewMock,
}));

import { renderHighlightedJSON } from './render';

function isReactElement(
  value: React.ReactNode
): value is React.ReactElement<{ children?: React.ReactNode; className?: string }> {
  return React.isValidElement(value);
}

describe('renderHighlightedJSON', () => {
  it('projects tokenized preview html markers into React nodes and decodes entities', () => {
    tokenizeJsonForPreviewMock.mockReturnValue([
      '{',
      '<span class="sniptale-json-key">"name"</span>',
      ':',
      '<span class="sniptale-json-string">&lt;Alice&gt;&amp;</span>',
      '}',
    ]);

    const nodes = renderHighlightedJSON('{"name":"<Alice>&"}');
    const spans = nodes.filter(isReactElement);

    expect(tokenizeJsonForPreviewMock).toHaveBeenCalledWith('{"name":"<Alice>&"}');
    expect(nodes[0]).toBe('{');
    expect(nodes[2]).toBe(':');
    expect(nodes[4]).toBe('}');
    expect(spans).toHaveLength(2);
    expect(spans[0]?.props.className).toBe('sniptale-json-key');
    expect(spans[0]?.props.children).toBe('"name"');
    expect(spans[1]?.props.className).toBe('sniptale-json-string');
    expect(spans[1]?.props.children).toBe('<Alice>&');
  });

  it('passes through non-wrapped tokens unchanged', () => {
    tokenizeJsonForPreviewMock.mockReturnValue(['plain']);

    expect(renderHighlightedJSON('plain')).toEqual(['plain']);
  });
});
