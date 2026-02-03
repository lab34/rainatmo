import cron from 'node-cron';
import { tokenRefreshJob } from './token-refresh.job.js';
import { hourlyUpdateJob } from './hourly-update.job.js';
import { dailyUpdateJob } from './daily-update.job.js';

export function startScheduler(fastify) {
  console.log('[Scheduler] Starting cron jobs...');

  // Token refresh every 2.5 hours (150 minutes)
  cron.schedule('*/150 * * * *', async () => {
    console.log('[Scheduler] Running token refresh job...');
    try {
      await tokenRefreshJob(fastify);
    } catch (error) {
      fastify.log.error('[Scheduler] Token refresh job failed:', error);
    }
  });

  // Hourly update (small periods)
  cron.schedule('0 * * * *', async () => {
    console.log('[Scheduler] Running hourly update job...');
    try {
      await hourlyUpdateJob(fastify);
    } catch (error) {
      fastify.log.error('[Scheduler] Hourly update job failed:', error);
    }
  });

  // Daily update (aggregates) at 1:00 AM
  cron.schedule('0 1 * * *', async () => {
    console.log('[Scheduler] Running daily update job...');
    try {
      await dailyUpdateJob(fastify);
    } catch (error) {
      fastify.log.error('[Scheduler] Daily update job failed:', error);
    }
  });

  console.log('[Scheduler] Cron jobs started');
  console.log('  - Token refresh: Every 2.5 hours');
  console.log('  - Hourly update: Every hour at :00');
  console.log('  - Daily update: Every day at 1:00 AM');
}
