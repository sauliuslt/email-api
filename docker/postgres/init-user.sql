-- Create the emailapi role with password if it doesn't already exist.
-- Uses DO block with EXECUTE for reliable password quoting.
DO $$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'emailapi') THEN
      EXECUTE format('CREATE ROLE %I WITH LOGIN PASSWORD %L', 'emailapi', 'emailapi');
      RAISE NOTICE 'Created role emailapi';
   ELSE
      -- Role exists but may have wrong password; reset it
      EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', 'emailapi', 'emailapi');
      RAISE NOTICE 'Role emailapi already exists, password reset';
   END IF;
END
$$;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE emailapi TO emailapi;
