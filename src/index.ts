import { logger } from './utils/logger.js';
import { runPipeline } from './pipeline.js';
import { startScheduler } from './scheduler/cron.js';

const isOnce = process.argv.includes('--once');

async function main() {
  logger.info({ mode: isOnce ? 'once' : 'scheduled' }, 'kofootball starting');

  if (isOnce) {
    const result = await runPipeline();
    logger.info(result, 'Single run complete');
    process.exit(result.errors.length > 0 ? 1 : 0);
  } else {
    startScheduler();
    // Run once immediately on startup, then cron takes over
    logger.info('Running initial pipeline...');
    const result = await runPipeline();
    logger.info(result, 'Initial run complete');
    logger.info('Scheduler active. Waiting for next cron trigger...');
  }
}

main().catch(err => {
  logger.error({ err }, 'Fatal error');
  process.exit(1);
});
