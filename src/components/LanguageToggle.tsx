import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  { code: 'fr', label: 'FR' },
  { code: 'ln', label: 'LN' },
  { code: 'sw', label: 'SW' },
  // future: { code: 'kg', label: 'KG' },
];

const VALID_CODES = new Set(LANGUAGES.map(l => l.code));

export function LanguageToggle() {
  const { i18n } = useTranslation();
  const current = VALID_CODES.has(i18n.language) ? i18n.language : 'fr';

  return (
    <div style={{
      display: 'flex',
      background: '#1a1a1a',
      border: '1px solid #2a2a2a',
      borderRadius: 20,
      padding: '2px 4px',
      gap: 2,
    }}>
      {LANGUAGES.map(({ code, label }) => (
        <button
          key={code}
          onClick={() => i18n.changeLanguage(code)}
          style={{
            background: current === code ? '#F5A623' : 'transparent',
            color: current === code ? '#000' : '#555',
            fontWeight: current === code ? 700 : 400,
            fontSize: 11,
            border: 'none',
            borderRadius: 16,
            padding: '3px 10px',
            cursor: 'pointer',
            transition: 'all 0.15s',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
