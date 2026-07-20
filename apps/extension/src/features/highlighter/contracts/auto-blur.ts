import type { BlurSettings } from './index';

export const AUTO_BLUR_CATEGORIES = {
  bankCard: 'bank-card',
  documentNumber: 'document-number',
  email: 'email',
  ipAddress: 'ip-address',
  phone: 'phone',
  urlOrLogin: 'url-or-login',
} as const;

export type AutoBlurCategory = (typeof AUTO_BLUR_CATEGORIES)[keyof typeof AUTO_BLUR_CATEGORIES];

export const AUTO_BLUR_CATEGORY_ORDER = [
  AUTO_BLUR_CATEGORIES.email,
  AUTO_BLUR_CATEGORIES.phone,
  AUTO_BLUR_CATEGORIES.urlOrLogin,
  AUTO_BLUR_CATEGORIES.ipAddress,
  AUTO_BLUR_CATEGORIES.bankCard,
  AUTO_BLUR_CATEGORIES.documentNumber,
] as const satisfies readonly AutoBlurCategory[];

export interface AutoBlurSettings {
  autoApplyEnabled: boolean;
  selectedCategories: AutoBlurCategory[];
  blurSettings: BlurSettings;
}

export interface AutoBlurTextSource {
  element: HTMLElement;
  text: string;
}

interface AutoBlurDetectorInput {
  sources: AutoBlurTextSource[];
}

export interface AutoBlurDetection {
  category: AutoBlurCategory;
  confidence: number;
  end: number;
  start: number;
  source: AutoBlurTextSource;
  value: string;
}

export interface AutoBlurDetector {
  detect(input: AutoBlurDetectorInput): AutoBlurDetection[];
}
