-- Pre-Mint Escrow Offers for unminted ChainRoll frames
CREATE TABLE IF NOT EXISTS public.pre_mint_offers (
  id TEXT PRIMARY KEY,
  photo_hash TEXT NOT NULL,
  bidder TEXT NOT NULL REFERENCES public.users(address) ON DELETE CASCADE,
  amount_kub NUMERIC(18, 6) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  tx_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pre_mint_offers_hash ON public.pre_mint_offers (photo_hash, amount_kub DESC);
