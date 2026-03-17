import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	out: './src/db/migrations',
	schema: './src/db/schema/index.ts',
	dialect: 'mysql',
	dbCredentials: {
		url: process.env.DATABASE_URL!,
	},
});
