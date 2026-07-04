type Props = {
  name: string;
  logoUrl?: string;
  size?: number;
};

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function TeamLogo({ name, logoUrl, size = 32 }: Props) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        width={size}
        height={size}
        style={{ objectFit: 'contain', borderRadius: 2 }}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = 'none';
          const fallback = (e.currentTarget.nextElementSibling as HTMLElement | null);
          if (fallback) fallback.style.display = 'flex';
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        background: 'rgba(255,255,255,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.4,
        fontWeight: 800,
        color: 'rgba(255,255,255,0.6)',
      }}
    >
      {getInitials(name)}
    </div>
  );
}

export default TeamLogo;
