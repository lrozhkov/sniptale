import { describe, expect, it } from 'vitest';
import {
  PAGE_STYLE_INSPECTOR_TABS,
  PAGE_STYLE_SCOPE_TYPES,
} from '@sniptale/runtime-contracts/page-style';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  parseBackgroundRuntimeMessage,
  parseContentTabMessage,
  parseRuntimeResponseForMessage,
} from '../../../parsers/boundary';

describe('page style runtime message contracts', () => {
  registerCurrentRuleSummaryTests();
  registerInspectorOpenTests();
});

function registerCurrentRuleSummaryTests() {
  it('parses current-page rule summary requests and responses', () => {
    expect(
      parseBackgroundRuntimeMessage({
        pageDomain: 'example.com',
        pageUrl: 'https://example.com/a',
        tabId: 7,
        type: MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY,
      })
    ).toEqual({
      pageDomain: 'example.com',
      pageUrl: 'https://example.com/a',
      tabId: 7,
      type: MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY,
    });

    expect(
      parseRuntimeResponseForMessage(MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY, {
        success: true,
        summary: {
          activeAppliedCount: 1,
          matchedRules: [
            {
              enabled: true,
              id: 'rule-1',
              name: 'Rule',
              propertySummary: ['color'],
              scope: {
                active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
                exactAddress: 'https://example.com/a',
              },
            },
          ],
          pageDomain: 'example.com',
          pageUrl: 'https://example.com/a',
        },
      })
    ).toEqual(
      expect.objectContaining({
        success: true,
        summary: expect.objectContaining({ activeAppliedCount: 1 }),
      })
    );
  });
}

function registerInspectorOpenTests() {
  it('parses inspector open requests across runtime and content tab boundaries', () => {
    const message = {
      targetTab: PAGE_STYLE_INSPECTOR_TABS.RULES,
      tabId: 7,
      type: MessageType.OPEN_PAGE_STYLE_INSPECTOR,
    };

    expect(parseBackgroundRuntimeMessage(message)).toEqual(message);
    expect(parseContentTabMessage(message)).toEqual(message);
    expect(() =>
      parseBackgroundRuntimeMessage({
        targetTab: 'unknown',
        type: MessageType.OPEN_PAGE_STYLE_INSPECTOR,
      })
    ).toThrow('Invalid runtime OPEN_PAGE_STYLE_INSPECTOR message');
  });
}
