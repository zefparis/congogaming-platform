import { motion } from 'framer-motion';
import { Delete } from 'lucide-react';

type Props = {
  onDigit: (d: string) => void;
  onDelete: () => void;
  variant?: 'pin' | 'amount';
};

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

export default function NumPad({ onDigit, onDelete, variant = 'pin' }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3 w-full">
      {KEYS.map((k, i) => {
        if (k === '') return <div key={i} />;
        if (k === 'del') {
          return (
            <motion.button
              key={i}
              whileTap={{ scale: 0.92 }}
              onClick={onDelete}
              className="h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-gold active:bg-zinc-800"
              aria-label="Effacer"
            >
              <Delete className="w-7 h-7" />
            </motion.button>
          );
        }
        return (
          <motion.button
            key={i}
            whileTap={{ scale: 0.92 }}
            onClick={() => onDigit(k)}
            className={`h-16 rounded-2xl font-display text-3xl tracking-wider flex items-center justify-center
              ${variant === 'pin'
                ? 'bg-gradient-to-b from-zinc-800 to-zinc-900 text-gold border border-zinc-700'
                : 'bg-gradient-to-b from-zinc-800 to-zinc-900 text-white border border-zinc-700'}`}
          >
            {k}
          </motion.button>
        );
      })}
    </div>
  );
}
