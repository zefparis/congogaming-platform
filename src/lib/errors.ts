import type { TFunction } from 'i18next';

/**
 * Translate a server error code. Falls back to rawMessage if the code has no
 * translation, then to the generic UNKNOWN_ERROR key.
 */
export function displayError(t: TFunction, code?: string, rawMessage?: string): string {
  if (!code) return rawMessage ?? t('errors.UNKNOWN_ERROR');
  const translated = t(`errors.${code}`, { defaultValue: '' });
  return translated || rawMessage || t('errors.UNKNOWN_ERROR');
}
