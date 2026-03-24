// Raw API-Football response types

export interface ApiStandingRow {
  rank: number;
  team: { id: number; name: string; logo: string };
  points: number;
  goalsDiff: number;
  form: string | null;
  all: { played: number; win: number; draw: number; lose: number };
}

export interface ApiStandingsResponse {
  response: Array<{
    league: {
      id: number;
      name: string;
      season: number;
      standings: ApiStandingRow[][];
    };
  }>;
}

export interface ApiFixture {
  fixture: { id: number; date: string; status: { short: string } };
  league: { id: number; round: string };
  teams: {
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
  };
  goals: { home: number | null; away: number | null };
}

export interface ApiFixturesResponse {
  response: ApiFixture[];
}
