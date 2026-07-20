import type { FieldNode, SectionNode } from '@sniptale/runtime-contracts/dom-tree';
import type { ParserResult, TraversalContext } from '../../types';
import {
  buildPortalField,
  createPortalSection,
  getElementText,
  resolvePortalSectionTitle,
} from './homepage.helpers';

function collectPortalFields(
  ctx: TraversalContext,
  section: SectionNode,
  fields: Array<FieldNode | null>
): ParserResult {
  const normalizedFields = fields.filter((field): field is FieldNode => field !== null);
  if (normalizedFields.length === 0) {
    ctx.result.structure = ctx.result.structure.filter((candidate) => candidate.id !== section.id);
    if (ctx.currentSection?.id === section.id) {
      ctx.currentSection = null;
    }
    return { skipChildren: true };
  }

  section.children.push(...normalizedFields);
  return { fields: normalizedFields, newSection: section, skipChildren: true };
}

function parseSearchBlock(
  element: HTMLElement,
  ctx: TraversalContext,
  section: SectionNode
): ParserResult {
  const titleData = getElementText(element.querySelector('.SearchBlock__headerTitle'), element);
  const commentData = getElementText(element.querySelector('.SearchBlock__headerComment'), element);
  const actionData = getElementText(element.querySelector('.CreateServiceCall__block'), element);

  return collectPortalFields(ctx, section, [
    buildPortalField(ctx, 'Заголовок', titleData.value, titleData.sourceElement),
    buildPortalField(ctx, 'Комментарий', commentData.value, commentData.sourceElement),
    buildPortalField(ctx, 'Основное действие', actionData.value, actionData.sourceElement),
  ]);
}

function getServiceCallRequestMeta(cardElement: HTMLElement, index: number) {
  const requestNumberElement = cardElement.querySelector('.ServiceCall__serviceCallTitle');
  const requestNumber =
    requestNumberElement instanceof HTMLElement
      ? requestNumberElement.textContent?.trim() || ''
      : '';

  return {
    prefix: requestNumber || `Запрос ${index + 1}`,
    requestSource: requestNumberElement instanceof HTMLElement ? requestNumberElement : cardElement,
  };
}

function getServiceCallCardData(cardElement: HTMLElement) {
  return {
    serviceData: getElementText(
      cardElement.querySelector('.ServiceCall__serviceAndComponent'),
      cardElement
    ),
    dateData: getElementText(cardElement.querySelector('.ServiceCall__specificDate'), cardElement),
    typeData: getElementText(
      cardElement.querySelector('.ServiceCall__serviceCallType'),
      cardElement
    ),
    statusData: getElementText(
      cardElement.querySelector('.ServiceCall__statusContainer'),
      cardElement
    ),
    descriptionData: getElementText(
      cardElement.querySelector('.ServiceCall__propertyValueMultiline'),
      cardElement
    ),
  };
}

function buildServiceCallCardFields(
  cardElement: HTMLElement,
  ctx: TraversalContext,
  index: number
): Array<FieldNode | null> {
  const { prefix, requestSource } = getServiceCallRequestMeta(cardElement, index);
  const { serviceData, dateData, typeData, statusData, descriptionData } =
    getServiceCallCardData(cardElement);

  return [
    buildPortalField(ctx, `${prefix} / Услуга`, serviceData.value, serviceData.sourceElement),
    buildPortalField(ctx, `${prefix} / Номер запроса`, prefix, requestSource),
    buildPortalField(
      ctx,
      `${prefix} / Плановое время выполнения`,
      dateData.value,
      dateData.sourceElement
    ),
    buildPortalField(ctx, `${prefix} / Вид запроса`, typeData.value, typeData.sourceElement),
    buildPortalField(ctx, `${prefix} / Статус`, statusData.value, statusData.sourceElement),
    buildPortalField(
      ctx,
      `${prefix} / Описание`,
      descriptionData.value,
      descriptionData.sourceElement
    ),
  ];
}

function parseServiceCallCards(
  element: HTMLElement,
  ctx: TraversalContext,
  section: SectionNode
): ParserResult {
  const cards = Array.from(element.querySelectorAll('.ServiceCall__serviceCall'));
  const fields = cards.flatMap((card, index) => {
    return buildServiceCallCardFields(card as HTMLElement, ctx, index);
  });

  return collectPortalFields(ctx, section, fields);
}

function parseCategoryCards(
  element: HTMLElement,
  ctx: TraversalContext,
  section: SectionNode
): ParserResult {
  const categories = Array.from(element.querySelectorAll('.Category__category'));
  const fields = categories.flatMap((category, index) => {
    const categoryElement = category as HTMLElement;
    const titleElement = categoryElement.querySelector('.Category__titleText');
    const title =
      titleElement instanceof HTMLElement
        ? titleElement.textContent?.trim() || ''
        : `Категория ${index + 1}`;
    const services = Array.from(
      categoryElement.querySelectorAll('.Category__serviceLink, .Category__more')
    )
      .map((item) => (item as HTMLElement).textContent?.trim() || '')
      .filter(Boolean)
      .join(', ');

    return [
      buildPortalField(
        ctx,
        `Категория ${index + 1}`,
        title,
        titleElement instanceof HTMLElement ? titleElement : categoryElement
      ),
      buildPortalField(ctx, `${title} / Услуги`, services, categoryElement),
    ];
  });

  return collectPortalFields(ctx, section, fields);
}

function parsePollCards(
  element: HTMLElement,
  ctx: TraversalContext,
  section: SectionNode
): ParserResult {
  const polls = Array.from(element.querySelectorAll('.Poll__pollCard'));
  const fields = polls.flatMap((poll, index) => {
    const pollElement = poll as HTMLElement;
    const titleElement = pollElement.querySelector('.Poll__titleText');
    const title =
      titleElement instanceof HTMLElement
        ? titleElement.textContent?.trim() || ''
        : `Опрос ${index + 1}`;
    const options = Array.from(pollElement.querySelectorAll('.PollControl__option'))
      .map((item) => (item as HTMLElement).textContent?.trim() || '')
      .filter(Boolean)
      .join(', ');

    return [
      buildPortalField(
        ctx,
        `Опрос ${index + 1}`,
        title,
        titleElement instanceof HTMLElement ? titleElement : pollElement
      ),
      buildPortalField(ctx, `${title} / Варианты`, options, pollElement),
    ];
  });

  return collectPortalFields(ctx, section, fields);
}

function parseFooterBlock(
  element: HTMLElement,
  ctx: TraversalContext,
  section: SectionNode
): ParserResult {
  const fields = Array.from(element.querySelectorAll('a')).map((link, index) => {
    return buildPortalField(
      ctx,
      `Ссылка ${index + 1}`,
      (link as HTMLElement).textContent?.trim() || '',
      link as HTMLElement
    );
  });

  return collectPortalFields(ctx, section, fields);
}

export function parsePortalHomepageSection(
  element: HTMLElement,
  ctx: TraversalContext
): ParserResult {
  const section = createPortalSection(ctx, resolvePortalSectionTitle(element));

  if (element.matches('.SearchBlock__root')) {
    return parseSearchBlock(element, ctx, section);
  }

  if (element.matches('.Footer__footerBlock')) {
    return parseFooterBlock(element, ctx, section);
  }

  if (element.querySelector('.ServiceCall__serviceCall')) {
    return parseServiceCallCards(element, ctx, section);
  }

  if (element.querySelector('.Category__category')) {
    return parseCategoryCards(element, ctx, section);
  }

  if (element.querySelector('.Poll__pollCard')) {
    return parsePollCards(element, ctx, section);
  }

  return collectPortalFields(ctx, section, []);
}
