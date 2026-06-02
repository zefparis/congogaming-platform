import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import fr from '../public/locales/fr/translation.json';
import ln from '../public/locales/ln/translation.json';
import sw from '../public/locales/sw/translation.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { fr: { translation: fr }, ln: { translation: ln }, sw: { translation: sw } },
    fallbackLng: 'fr',
    interpolation: { escapeValue: false },
  });

export default i18n;
