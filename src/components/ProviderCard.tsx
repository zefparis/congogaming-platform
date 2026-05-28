import { motion } from 'framer-motion';

export type Provider = {
  id: number;
  name: string;
  short: string;
  color: string;
  ring: string;
  logo: string;
};

export const PROVIDERS: Provider[] = [
  { id: 10, name: 'Orange Money',   short: 'Money', color: '#FF7900', ring: 'ring-orange-300', logo: '/images/logo/Orange.png' },
  { id: 17, name: 'Airtel Money',   short: 'Money', color: '#CC0000', ring: 'ring-red-400',    logo: '/images/logo/Airtel.png' },
  { id: 19, name: 'Africell Money', short: 'Money', color: '#0066CC', ring: 'ring-blue-400',   logo: '/images/logo/afrimoney.png' },
];

type Props = {
  provider: Provider;
  selected: boolean;
  autoDetected?: boolean;
  onClick: () => void;
};

export default function ProviderCard({ provider, selected, autoDetected, onClick }: Props) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      style={{
        backgroundColor: provider.color,
        border: selected ? '3px solid #FFD700' : '3px solid transparent',
        filter: selected ? 'brightness(1.2)' : 'brightness(0.7) opacity(0.85)',
      }}
      className="relative aspect-square w-full rounded-2xl overflow-hidden shadow-lg p-0"
    >
      <img
        src={provider.logo}
        alt={provider.name}
        className="absolute inset-0 w-full h-full object-cover"
      />
      {selected && (
        <span className="absolute top-2 right-2 bg-congogreen text-white rounded-full w-6 h-6 text-xs flex items-center justify-center font-black shadow">✓</span>
      )}
      {selected && autoDetected && (
        <span className="absolute bottom-2 left-2 bg-white/90 text-black text-[10px] font-bold px-2 py-0.5 rounded-full shadow">Détecté</span>
      )}
    </motion.button>
  );
}
