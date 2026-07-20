import React from 'react';
import { tokenizeJsonForPreview } from './tokenizer';

function decodePreviewToken(value: string): string {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

export function renderHighlightedJSON(json: string): React.ReactNode[] {
  return tokenizeJsonForPreview(json).map((token, index) => {
    const match = token.match(
      /^<span class="sniptale-json-(key|string|number|boolean|null)">(.*)<\/span>$/
    );
    if (!match) {
      return token;
    }

    const tokenType = match[1];
    const tokenValue = match[2];
    if (!tokenType || tokenValue === undefined) {
      return token;
    }

    return React.createElement(
      'span',
      { className: `sniptale-json-${tokenType}`, key: `json-token-${index}` },
      decodePreviewToken(tokenValue)
    );
  });
}
