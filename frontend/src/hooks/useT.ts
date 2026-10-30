import korean from '@/locales/ko-components.json';
import { useTranslation } from 'react-i18next';

type NestedRecord = Record<string, unknown>;

type Translations = {
  zh: NestedRecord;
  en: NestedRecord;
};

/**
 * Get the value of the embedded object, support the point number path
 * For example：：getNestedValue(obj, 'home.title') Access obj.home.title
 */
function getNestedValue(obj: NestedRecord, path: string): string | undefined {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as NestedRecord)[key];
    } else {
      return undefined;
    }
  }

  return typeof current === 'string' ? current : undefined;
}

/**
 * Component Level i18n hook - Smart fallback（Programme B）
 *
 * Select translation search from component, no automatics found fallback To global translation。
 * It’ll only take one. t()，The mode of call is completely unchanged.！
 *
 * Usage：
 * ```tsx
 * const homeI18n = {
 *   zh: {
 *     home: {
 *       title: 'Banana Slides',
 *       messages: { success: 'Success' }
 *     }
 *   },
 *   en: {
 *     home: {
 *       title: 'Banana Slides',
 *       messages: { success: 'Success' }
 *     }
 *   }
 * };
 *
 * const t = useT(homeI18n);
 *
 * t('home.title')     // Can not open message: "Banana Slides"
 * t('common.save')    // Not in component, automatic fallback To Global: "Save"
 * ```
 *
 * Put translation and components together like this.，AI I can see all the contexts at once.！
 */
export function useT<T extends Translations>(translations: T) {
  const { t: globalT, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('zh') ? 'zh' : 'en';
  const dict = translations[lang] || translations['zh'];

  // Compatibility react-i18next Multiple ways of calling：
  // t('key') / t('key', 'Default value') / t('key', { param: value })
  return (key: string, defaultOrParams?: string | Record<string, string | number>): string => {
    // Parsing Second Parameter
    const params = typeof defaultOrParams === 'object' ? defaultOrParams : undefined;

    // Prioritize translation from component
    const localValue = i18n.language?.startsWith('ko')
      ? (korean as Record<string, string>)[key] ?? getNestedValue(dict, key)
      : getNestedValue(dict, key);

    if (localValue !== undefined) {
      // Found in component. Processing plugs.
      let text = localValue;
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          text = text.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
        });
      }
      return text;
    }

    // It’s not found in the component.，fallback To global translation (maintenance of original parameter transfer)）
    return String(globalT(key, defaultOrParams as any));
  };
}
