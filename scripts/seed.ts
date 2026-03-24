/**
 * Seed script — fetches initial standings + fixtures for all enabled leagues.
 * Run with: npm run seed
 */
import { config } from '../src/config.js';
import { getDb } from '../src/storage/db.js';
import { fetchStandings, fetchRecentFixtures, fetchUpcomingFixtures, getRequestCount } from '../src/fetcher/football-data.js';
import { saveStandings } from '../src/storage/standings-repo.js';
import { saveFixtures } from '../src/storage/fixtures-repo.js';
import { logger } from '../src/utils/logger.js';

async function seed() {
  logger.info('Starting seed — fetching data for enabled leagues');

  // Initialize database (creates tables if needed)
  getDb();

  const currentSeason = new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const leagues = config.enabledLeagues;

  for (const leagueId of leagues) {
    const leagueName = config.leagues[leagueId] || `League ${leagueId}`;
    logger.info({ leagueId, leagueName }, 'Fetching league data');

    try {
      // Fetch standings
      const standings = await fetchStandings(leagueId);
      if (standings.length > 0) {
        saveStandings(leagueId, currentSeason, standings);
        logger.info({ leagueId, teams: standings.length }, 'Saved standings');
      } else {
        logger.warn({ leagueId }, 'No standings data returned');
      }

      // Fetch recent fixtures
      const recent = await fetchRecentFixtures(leagueId);
      if (recent.length > 0) {
        saveFixtures(leagueId, recent);
        logger.info({ leagueId, fixtures: recent.length }, 'Saved recent fixtures');
      }

      // Fetch upcoming fixtures
      const upcoming = await fetchUpcomingFixtures(leagueId);
      if (upcoming.length > 0) {
        saveFixtures(leagueId, upcoming);
        logger.info({ leagueId, fixtures: upcoming.length }, 'Saved upcoming fixtures');
      }
    } catch (err) {
      logger.error({ leagueId, err }, 'Failed to fetch league data');
    }
  }

  logger.info({ totalRequests: getRequestCount() }, 'Seed complete');
}

seed().catch((err) => {
  logger.fatal({ err }, 'Seed failed');
  process.exit(1);
});
