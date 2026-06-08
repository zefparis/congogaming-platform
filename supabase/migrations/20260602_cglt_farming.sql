-- CGLT Farming — XP accumulation + automatic tier rewards
-- Each bet grants XP (1% of stake). Crossing a tier threshold credits CGLT
-- into the player's UniPay wallet. State + reward history live here.

-- Table XP et paliers joueurs
CREATE TABLE IF NOT EXISTS player_farming (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  phone text NOT NULL,
  total_xp numeric(20,2) DEFAULT 0,
  total_cglt_earned numeric(20,8) DEFAULT 0,
  current_tier text DEFAULT 'debutant',
  last_tier_claimed text DEFAULT 'none',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index sur phone pour lookup rapide. Unique: one farming row per phone so
-- concurrent bets converge on the same record instead of duplicating XP.
CREATE UNIQUE INDEX IF NOT EXISTS idx_player_farming_phone ON player_farming(phone);

-- Table historique des récompenses CGLT
CREATE TABLE IF NOT EXISTS farming_rewards (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  player_farming_id uuid REFERENCES player_farming(id),
  phone text NOT NULL,
  tier text NOT NULL,
  xp_at_reward numeric(20,2),
  cglt_amount numeric(20,8),
  unipay_tx_ref text,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_farming_rewards_phone ON farming_rewards(phone);
