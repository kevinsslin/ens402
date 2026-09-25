CREATE TABLE IF NOT EXISTS owners (
  id uuid PRIMARY KEY,
  issuer text NOT NULL,
  subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, subject)
);
CREATE TABLE IF NOT EXISTS agents (
  wallet text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (wallet = lower(wallet))
);
CREATE TABLE IF NOT EXISTS approvers (
  owner_id uuid NOT NULL REFERENCES owners(id),
  issuer text NOT NULL,
  subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, issuer, subject)
);
CREATE TABLE IF NOT EXISTS world_flows (
  state uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('enroll', 'approve', 'deny')),
  agent_wallet text,
  owner_id uuid REFERENCES owners(id),
  approval_id uuid,
  challenge text,
  pkce_verifier text NOT NULL,
  nonce text NOT NULL,
  redirect_path text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE TABLE IF NOT EXISTS grants (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id),
  agent_wallet text NOT NULL REFERENCES agents(wallet),
  service_name text NOT NULL,
  network text NOT NULL,
  pay_to text NOT NULL,
  daily_cap_atomic numeric(78,0) NOT NULL CHECK (daily_cap_atomic > 0),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  approved_by_issuer text NOT NULL,
  approved_by_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS grants_lookup ON grants(agent_wallet, service_name, network, pay_to, expires_at);
CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id),
  agent_wallet text NOT NULL REFERENCES agents(wallet),
  service_name text NOT NULL,
  resource_url text NOT NULL,
  network text NOT NULL,
  pay_to text NOT NULL,
  amount_atomic numeric(78,0) NOT NULL CHECK (amount_atomic > 0),
  daily_cap_atomic numeric(78,0) NOT NULL CHECK (daily_cap_atomic > 0),
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
  requires_second_person boolean NOT NULL DEFAULT false,
  first_subject text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS risk_results (
  address text PRIMARY KEY,
  tier text NOT NULL CHECK (tier IN ('low', 'medium', 'high')),
  toxic_score numeric,
  reasons text[] NOT NULL,
  raw jsonb NOT NULL,
  interpretation_version integer NOT NULL,
  scanned_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS reservations (
  id uuid PRIMARY KEY,
  attempt_id uuid NOT NULL UNIQUE,
  owner_id uuid NOT NULL REFERENCES owners(id),
  agent_wallet text NOT NULL REFERENCES agents(wallet),
  service_name text NOT NULL,
  pay_to text NOT NULL,
  amount_atomic numeric(78,0) NOT NULL CHECK (amount_atomic > 0),
  spend_day date NOT NULL,
  status text NOT NULL CHECK (status IN ('reserved', 'settled', 'uncertain', 'released')),
  transaction_hash text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reservations_daily ON reservations(owner_id, spend_day, status);
CREATE TABLE IF NOT EXISTS payee_observations (
  service_name text PRIMARY KEY,
  pay_to text NOT NULL,
  changed_at timestamptz NOT NULL,
  observed_at timestamptz NOT NULL
);
ALTER TABLE world_flows ADD COLUMN IF NOT EXISTS signature_verified_at timestamptz;
ALTER TABLE world_flows ADD COLUMN IF NOT EXISTS second_person boolean NOT NULL DEFAULT false;
ALTER TABLE world_flows ADD COLUMN IF NOT EXISTS invite_token uuid;
ALTER TABLE world_flows ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS second_invite_token uuid;
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS attempt_id uuid;
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS intent_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS approvals_attempt_unique ON approvals(attempt_id) WHERE attempt_id IS NOT NULL;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS intent_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS reservations_settled_transaction_unique ON reservations(transaction_hash)
  WHERE transaction_hash IS NOT NULL AND status='settled';
