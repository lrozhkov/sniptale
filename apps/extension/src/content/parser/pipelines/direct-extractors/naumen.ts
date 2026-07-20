import type { PageProfile } from '@sniptale/runtime-contracts/dom-tree';
import { initContext } from '../../dom-tree-parser/traversal';
import { parseDynamicFieldsEmbeddedAppElement } from '../../parsers/generic/forms/dynamic-fields-app';
import { parseMvsEmbeddedAppElement } from '../../parsers/generic/mvs/embedded-app';
import { extractPortalHomepageSections } from '../../parsers/generic/portal/homepage';
import { parseServiceCallSummaryElement } from '../../parsers/generic/portal/service-call-summary';
import {
  parseGwtAttrListElement,
  parseGwtCommentsElement,
  GWT_SECTION_SELECTOR,
  parseGwtSectionElement,
  parseGwtTableElement,
} from '../../parsers/gwt';
import type {
  DirectExtractionPageContext,
  DirectExtractionResult,
} from '../registry/direct-extractor-routes';
import { normalizeDirectSections } from './normalize';

export function extractNaumenPortalSections(
  root: HTMLElement,
  profile: PageProfile,
  pageContext: DirectExtractionPageContext
): DirectExtractionResult {
  const ctx = initContext(profile, undefined, {
    pageHostname: pageContext.pageHostname,
    pageTitle: pageContext.pageTitle,
    pageUrl: pageContext.pageUrl,
  });

  if (profile.pageKind === 'homepage') {
    return normalizeDirectSections(extractPortalHomepageSections(root, ctx), profile, pageContext);
  }

  const serviceCallRoot = (
    root.matches('#serviceCall') ? root : root.querySelector('#serviceCall')
  ) as HTMLElement | null;
  if (!serviceCallRoot) {
    return { sections: [] };
  }

  parseServiceCallSummaryElement(serviceCallRoot, ctx);
  return normalizeDirectSections(ctx.result.structure, profile, pageContext);
}

export function extractNaumenSdSections(
  root: HTMLElement,
  profile: PageProfile,
  pageContext: DirectExtractionPageContext
): DirectExtractionResult {
  const ctx = initContext(profile, undefined, {
    pageHostname: pageContext.pageHostname,
    pageTitle: pageContext.pageTitle,
    pageUrl: pageContext.pageUrl,
  });
  const sectionRoots = [
    ...(root.matches(GWT_SECTION_SELECTOR) ? [root] : []),
    ...Array.from(root.querySelectorAll<HTMLElement>(GWT_SECTION_SELECTOR)).filter((element) => {
      return element.parentElement?.closest(GWT_SECTION_SELECTOR) === null;
    }),
  ];

  sectionRoots.forEach((sectionRoot) => {
    parseGwtSectionContent(sectionRoot, ctx);
  });

  parseRemainingRootComments(root, ctx);
  parseEmbeddedApps(root, ctx);

  return normalizeDirectSections(ctx.result.structure, profile, pageContext);
}

function parseGwtSectionContent(root: HTMLElement, ctx: ReturnType<typeof initContext>): void {
  parseGwtSectionElement(root, ctx);

  root.querySelectorAll<HTMLTableElement>('table.attrList').forEach((table) => {
    parseGwtAttrListElement(table, ctx);
  });

  root.querySelectorAll<HTMLTableElement>('table.cellTableWidget').forEach((table) => {
    parseGwtTableElement(table, ctx);
  });

  root
    .querySelectorAll<HTMLElement>('[id*="CommentList"], [id="comments"]')
    .forEach((commentContainer) => {
      parseGwtCommentsElement(commentContainer, ctx);
    });
}

function parseRemainingRootComments(root: HTMLElement, ctx: ReturnType<typeof initContext>): void {
  root
    .querySelectorAll<HTMLElement>('[id*="CommentList"], [id="comments"]')
    .forEach((commentContainer) => {
      if (ctx.processedCommentContainers.has(commentContainer)) {
        return;
      }

      parseGwtCommentsElement(commentContainer, ctx);
    });
}

function parseEmbeddedApps(root: HTMLElement, ctx: ReturnType<typeof initContext>): void {
  const embeddedApps = Array.from(
    root.querySelectorAll<HTMLElement>(
      [
        '[data-virtual-iframe="true"][data-application-code="dynamicFields"]',
        '[data-virtual-iframe="true"][data-application-code="mvs"]',
      ].join(', ')
    )
  );

  embeddedApps.forEach((element) => {
    if (element.getAttribute('data-application-code') === 'mvs') {
      parseMvsEmbeddedAppElement(element, ctx);
      return;
    }

    parseDynamicFieldsEmbeddedAppElement(element, ctx);
  });
}
