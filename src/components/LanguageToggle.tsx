import { useTranslation } from 'react-i18next';

export function LanguageToggle() {
  const { i18n } = useTranslation();
  const current = i18n.language === 'ln' ? 'ln' : 'fr';

  return (
    <div style={{
      display: 'flex',
      background: '#1a1a1a',
      border: '1px solid #333',
      borderRadius: 20,
      padding: '2px 4px',
      gap: 2,
      alignItems: 'center',
    }}>
      {(['fr', 'ln'] as const).map(lang => (
        <button
          key={lang}
          onClick={() => i18n.changeLanguage(lang)}
          style={{
            background: current === lang ? '#F5A623' : 'transparent',
            color: current === lang ? '#000' : '#666',
            fontWeight: current === lang ? 700 : 400,
            fontSize: 11,
            border: 'none',
            borderRadius: 16,
            padding: '3px 10px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {lang === 'fr' ? 'FR' : 'LN'}
        </button>
      ))}
    </div>
  );
}
