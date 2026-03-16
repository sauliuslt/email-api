-- Create the emailapi role if it doesn't exist (handles cases where
-- POSTGRES_USER isn't picked up by the entrypoint script).
DO $$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = current_setting('app.db_user', true)) THEN
      -- Fallback: use hardcoded name when the setting isn't available
      NULL;
   END IF;
END
$$;

-- Idempotent: create role only if missing
SELECT 'CREATE ROLE emailapi WITH LOGIN PASSWORD ''emailapi'''
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'emailapi')\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE emailapi TO emailapi;
