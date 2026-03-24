import cron from 'node-cron';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { runPipeline } from '../pipeline.js';

/**
 * Convert "HH:MM" to a cron expression.
 * e.g. "16:30" → "30 16 * * *"
 */
function timeToCron(time: string): string {
  const [hour, minute] = time.split(':');
  return `${minute} ${hour} * * *`;
}

export function startScheduler(): void {
  const allTimes = [config.schedule.baselineRunTime, ...config.schedule.activeRunTimes];

  for (const time of allTimes) {
    const expression = timeToCron(time);

    cron.schedule(expression, async () => {
      logger.info({ scheduledTime: time }, 'Scheduled run triggered');
      try {
        const result = await runPipeline();
        logger.info({ time, ...result }, 'Scheduled run complete');
      } catch (err) {
        logger.error({ time, err }, 'Scheduled run failed');
      }
    }, {
      timezone: config.schedule.timezone,
    });

    logger.info({ time, cron: expression, tz: config.schedule.timezone }, 'Cron job registered');
  }

  logger.info({ jobs: allTimes.length }, 'Scheduler started');
}
