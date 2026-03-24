import type Database from 'better-sqlite3';

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS standings_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      league_id INTEGER NOT NULL,
      season INTEGER NOT NULL,
      team_id INTEGER NOT NULL,
      team_name TEXT NOT NULL,
      team_logo TEXT,
      rank INTEGER NOT NULL,
      points INTEGER NOT NULL,
      played INTEGER NOT NULL,
      won INTEGER NOT NULL,
      drawn INTEGER NOT NULL,
      lost INTEGER NOT NULL,
      goal_diff INTEGER NOT NULL,
      form TEXT,
      fetched_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_standings_league_fetched
      ON standings_snapshots(league_id, fetched_at);

    CREATE TABLE IF NOT EXISTS fixtures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      league_id INTEGER NOT NULL,
      fixture_id INTEGER UNIQUE NOT NULL,
      home_team TEXT NOT NULL,
      home_team_id INTEGER,
      home_logo TEXT,
      away_team TEXT NOT NULL,
      away_team_id INTEGER,
      away_logo TEXT,
      home_goals INTEGER,
      away_goals INTEGER,
      status TEXT NOT NULL,
      date TEXT NOT NULL,
      round TEXT,
      fetched_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_fixtures_league_date
      ON fixtures(league_id, date);

    CREATE TABLE IF NOT EXISTS stories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      league_id INTEGER NOT NULL,
      headline TEXT NOT NULL,
      score INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      content_variants TEXT,
      media_suggestion TEXT DEFAULT 'text_only',
      status TEXT DEFAULT 'pending',
      feedback TEXT,
      delivered_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_stories_league_created
      ON stories(league_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_stories_type
      ON stories(type);
  `);
}
