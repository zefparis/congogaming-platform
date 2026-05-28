import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = url && anon ? createClient(url, anon) : null;

export type DBUser = {
  id: string;
  phone: string;
  pin_hash: string;
  balance_cdf: number;
  created_at: string;
};

export type DBTransaction = {
  id: string;
  user_id: string;
  order_id: string;
  type: 'deposit' | 'withdrawal';
  amount: number;
  currency: string;
  provider_id: number;
  status: number;
  transaction_id: string | null;
  created_at: string;
};
