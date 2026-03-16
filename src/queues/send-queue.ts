import { Queue } from 'bullmq';
import { getRedisConnectionOpts } from './index.js';

export interface SendJobData {
	messageId: string;
	domainId: string;
}

let _sendQueue: Queue<SendJobData, void, 'send'> | null = null;

export function getSendQueue(): Queue<SendJobData, void, 'send'> {
	if (!_sendQueue) {
		_sendQueue = new Queue<SendJobData, void, 'send'>('send-email', {
			connection: getRedisConnectionOpts(),
			defaultJobOptions: {
				attempts: 3,
				backoff: {
					type: 'exponential',
					delay: 5000,
				},
				removeOnComplete: { count: 1000 },
				removeOnFail: { count: 5000 },
			},
		});
	}
	return _sendQueue;
}
