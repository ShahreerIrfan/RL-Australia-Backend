-- RL Australia - Custom Auth Tables
-- Run this SQL on your PostgreSQL database: rlaustralia-rlaustralia
-- Connection: postgresql://postgres:RlAustralia@187.127.141.36:5436/rlaustralia-rlaustralia

-- Create customers table
CREATE TABLE IF NOT EXISTS rl_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on email for fast lookups
CREATE INDEX IF NOT EXISTS idx_rl_customers_email ON rl_customers(email);

-- Create sessions table (optional - for token tracking)
CREATE TABLE IF NOT EXISTS rl_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES rl_customers(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rl_sessions_customer ON rl_sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_rl_sessions_expires ON rl_sessions(expires_at);

-- Verify tables created
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'rl_%';
