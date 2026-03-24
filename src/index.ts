import { logger } from './utils/logger.js';
import { runPipeline } from './pipeline.js';
import { startScheduler } from './scheduler/cron.js';

const isOnce = process.argv.includes('--once');
const isDev = process.argv.includes('--dev');

async function main() {
  logger.info({ mode: isOnce ? 'once' : 'scheduled', dev: isDev }, 'kofootball starting');

  if (isOnce) {
    const result = await runPipeline();
    logger.info(result, 'Single run complete');
    process.exit(result.errors.length > 0 ? 1 : 0);
  } else {
    startScheduler();

    if (isDev) {
      logger.info('Dev mode: running initial pipeline...');
      const result = await runPipeline();
      logger.info(result, 'Initial run complete');
    }

    logger.info('Scheduler active. Waiting for next cron trigger...');
  }
}

main().catch(err => {
  logger.error({ err }, 'Fatal error');
  process.exit(1);
});
