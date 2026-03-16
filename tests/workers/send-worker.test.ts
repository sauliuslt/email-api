import { describe, expect, it } from 'vitest';
import { getSmtpFailureOutcome } from '../../src/workers/send-worker.js';

describe('getSmtpFailureOutcome', () => {
	it('does not retry permanent bounces', () => {
		expect(getSmtpFailureOutcome('550 5.1.1 user unknown', 0, 3)).toEqual({
			status: 'bounced',
			shouldRetry: false,
			eventType: 'bounced',
		});
	});

	it('requeues temporary failures while retries remain', () => {
		expect(getSmtpFailureOutcome('421 4.4.2 connection dropped', 0, 3)).toEqual({
			status: 'queued',
			shouldRetry: true,
		});
	});

	it('marks the final temporary failure as failed', () => {
		expect(getSmtpFailureOutcome('421 4.4.2 connection dropped', 2, 3)).toEqual({
			status: 'failed',
			shouldRetry: false,
			eventType: 'failed',
		});
	});
});
