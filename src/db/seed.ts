import 'dotenv/config';
import { loadEnv } from '../config/env.js';
import { closeDb, getDb } from './connection.js';
import { warmupSchedules } from './schema/index.js';

loadEnv();

const WARMUP_SCHEDULE = [
	{ day: 1, dailyLimit: 50 },
	{ day: 2, dailyLimit: 75 },
	{ day: 3, dailyLimit: 100 },
	{ day: 4, dailyLimit: 150 },
	{ day: 5, dailyLimit: 200 },
	{ day: 6, dailyLimit: 300 },
	{ day: 7, dailyLimit: 400 },
	{ day: 8, dailyLimit: 500 },
	{ day: 9, dailyLimit: 700 },
	{ day: 10, dailyLimit: 1000 },
	{ day: 11, dailyLimit: 1500 },
	{ day: 12, dailyLimit: 2000 },
	{ day: 13, dailyLimit: 3000 },
	{ day: 14, dailyLimit: 4000 },
	{ day: 15, dailyLimit: 5000 },
	{ day: 16, dailyLimit: 7000 },
	{ day: 17, dailyLimit: 10000 },
	{ day: 18, dailyLimit: 15000 },
	{ day: 19, dailyLimit: 20000 },
	{ day: 20, dailyLimit: 30000 },
	{ day: 21, dailyLimit: 40000 },
	{ day: 22, dailyLimit: 50000 },
	{ day: 23, dailyLimit: 65000 },
	{ day: 24, dailyLimit: 80000 },
	{ day: 25, dailyLimit: 100000 },
	{ day: 26, dailyLimit: 130000 },
	{ day: 27, dailyLimit: 170000 },
	{ day: 28, dailyLimit: 220000 },
	{ day: 29, dailyLimit: 300000 },
	{ day: 30, dailyLimit: 0 }, // 0 = unlimited
];

async function seed() {
	const db = getDb();

	console.log('Seeding warmup schedules...');
	for (const entry of WARMUP_SCHEDULE) {
		await db
			.insert(warmupSchedules)
			.values(entry)
			.onDuplicateKeyUpdate({
				set: { dailyLimit: entry.dailyLimit },
			});
	}
	console.log(`Inserted ${WARMUP_SCHEDULE.length} warmup schedule entries.`);

	await closeDb();
	console.log('Seed complete.');
}

seed().catch((err) => {
	console.error('Seed failed:', err);
	process.exit(1);
});
