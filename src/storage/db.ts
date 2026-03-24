import Database from 'better-sqlite3';
import { config } from '../config.js';
import { runMigrations } from './migrations.js';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(config.db.path);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    runMigrations(_db);
  }
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
