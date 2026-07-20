import {
  AUTO_BLUR_CATEGORIES,
  type AutoBlurCategory,
  type AutoBlurDetection,
  type AutoBlurDetector,
} from '../../../../features/highlighter/contracts/auto-blur';

type RuleDefinition = {
  category: AutoBlurCategory;
  confidence: number;
  pattern: RegExp;
  validate?: (value: string) => boolean;
};

const EMAIL_PATTERN = /(?<![\w.+-])[\w.+-]{1,64}@[\w.-]{2,255}\.[A-Za-z]{2,24}(?![\w.-])/gu;
const URL_OR_LOGIN_PATTERN =
  /\b(?:https?:\/\/[^\s<>"']{3,}|(?:login|user|username|account|uid|id)\s*[:=]\s*[\w.@+-]{3,})/giu;
const IP_PATTERN = /\b\d[\d.]{6,15}\d\b/gu;
const BANK_CARD_PATTERN = /\b\d[\d -]{11,25}\d\b/gu;
const SNILS_PATTERN = /(?<!\d)\d{3}[- ]?\d{3}[- ]?\d{3}[- ]?\d{2}(?!\d)/gu;
const INN_PATTERN = /(?<!\d)(?:\d{10}|\d{12})(?!\d)/gu;
const PASSPORT_PATTERN = /(?<!\d)(?:\d{2}\s?\d{2}\s?\d{6})(?!\d)/gu;
const PHONE_PATTERN = /(?:\+?\d[\d ()-]{8,22}\d)/gu;

function digitsOnly(value: string): string {
  return value.replace(/\D/gu, '');
}

function hasLuhnChecksum(value: string): boolean {
  const digits = digitsOnly(value);
  if (digits.length < 13 || digits.length > 19 || /^(\d)\1+$/u.test(digits)) {
    return false;
  }

  let sum = 0;
  let shouldDouble = false;
  for (let index = digits.length - 1; index >= 0; index--) {
    let digit = Number(digits[index]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

function isLikelyPhone(value: string): boolean {
  const digits = digitsOnly(value);
  if (digits.length === 11) {
    return digits.startsWith('7') || digits.startsWith('8');
  }

  return digits.length === 10 && digits.startsWith('9');
}

function isLikelyIp(value: string): boolean {
  const parts = value.split('.');
  return (
    parts.length === 4 &&
    parts.every((part) => part.length > 0 && part.length <= 3 && Number(part) <= 255)
  );
}

function hasSnilsChecksum(value: string): boolean {
  const digits = digitsOnly(value);
  if (digits.length !== 11) {
    return false;
  }

  const control = Number(digits.slice(9));
  const sum = digits
    .slice(0, 9)
    .split('')
    .reduce((total, digit, index) => total + Number(digit) * (9 - index), 0);
  const expected = sum < 100 ? sum : sum === 100 || sum === 101 ? 0 : sum % 101;

  return control === (expected === 100 ? 0 : expected);
}

function isLikelyInn(value: string): boolean {
  const digits = digitsOnly(value);
  return digits.length === 10 || digits.length === 12;
}

function isLikelyPassport(value: string): boolean {
  const digits = digitsOnly(value);
  return digits.length === 10;
}

const RULES: RuleDefinition[] = [
  { category: AUTO_BLUR_CATEGORIES.email, confidence: 0.96, pattern: EMAIL_PATTERN },
  {
    category: AUTO_BLUR_CATEGORIES.phone,
    confidence: 0.88,
    pattern: PHONE_PATTERN,
    validate: isLikelyPhone,
  },
  { category: AUTO_BLUR_CATEGORIES.urlOrLogin, confidence: 0.78, pattern: URL_OR_LOGIN_PATTERN },
  {
    category: AUTO_BLUR_CATEGORIES.ipAddress,
    confidence: 0.9,
    pattern: IP_PATTERN,
    validate: isLikelyIp,
  },
  {
    category: AUTO_BLUR_CATEGORIES.bankCard,
    confidence: 0.93,
    pattern: BANK_CARD_PATTERN,
    validate: hasLuhnChecksum,
  },
  {
    category: AUTO_BLUR_CATEGORIES.documentNumber,
    confidence: 0.91,
    pattern: SNILS_PATTERN,
    validate: hasSnilsChecksum,
  },
  {
    category: AUTO_BLUR_CATEGORIES.documentNumber,
    confidence: 0.75,
    pattern: INN_PATTERN,
    validate: isLikelyInn,
  },
  {
    category: AUTO_BLUR_CATEGORIES.documentNumber,
    confidence: 0.72,
    pattern: PASSPORT_PATTERN,
    validate: isLikelyPassport,
  },
];

function collectRuleDetections(rule: RuleDefinition, source: AutoBlurDetection['source']) {
  const detections: AutoBlurDetection[] = [];

  for (const match of source.text.matchAll(rule.pattern)) {
    const value = match[0];
    const isValid = rule.validate?.(value) ?? true;
    if (typeof match.index === 'undefined' || !isValid) {
      continue;
    }

    detections.push({
      category: rule.category,
      confidence: rule.confidence,
      end: match.index + value.length,
      source,
      start: match.index,
      value,
    });
  }

  return detections;
}

export const ruleAutoBlurDetector: AutoBlurDetector = {
  detect(input) {
    return input.sources.flatMap((source) =>
      RULES.flatMap((rule) => collectRuleDetections(rule, source))
    );
  },
};
