import { describe, it, expect } from 'vitest';
import { parseVariants } from '../../src/content/formatter.js';

describe('parseVariants', () => {
  it('parses MAIN/DATA/EDGE sections from LLM output', () => {
    const raw = `MAIN: Arsenal are running away with it. Two points clear, six to go.
DATA: Arsenal 76pts | Man City 74pts | Liverpool 73pts. Tightest since 2014.
EDGE: City are cooked. Arsenal smell blood.`;

    const result = parseVariants(raw);
    expect(result.main).toContain('Arsenal are running away');
    expect(result.data).toContain('Arsenal 76pts');
    expect(result.edge).toContain('City are cooked');
  });

  it('handles multiline MAIN section', () => {
    const raw = `MAIN: First line of the main take.
Second line continues here.
DATA: Supporting data line.
EDGE: Sharp take.`;

    const result = parseVariants(raw);
    expect(result.main).toContain('First line');
    expect(result.main).toContain('Second line');
    expect(result.data).toContain('Supporting data');
  });

  it('returns null edge when edge is too short', () => {
    const raw = `MAIN: Arsenal dominate the league with ruthless efficiency. Nobody can stop them right now.
DATA: Arsenal have won 10 of their last 12 league matches.
EDGE: Short.`;

    const result = parseVariants(raw);
    expect(result.edge).toBeNull(); // "Short." is < 15 chars
  });

  it('returns null edge when edge overlaps heavily with main', () => {
    const raw = `MAIN: Arsenal are running away with it in the Premier League title race.
DATA: Arsenal lead by two points with six games remaining.
EDGE: Arsenal are running away with it in the league race this season.`;

    const result = parseVariants(raw);
    // High word overlap → edge should be null
    expect(result.edge).toBeNull();
  });

  it('handles missing sections gracefully', () => {
    const raw = `MAIN: Just the main content here.`;

    const result = parseVariants(raw);
    expect(result.main).toContain('Just the main');
    expect(result.data).toBe('');
    expect(result.edge).toBeNull();
  });

  it('handles empty input', () => {
    const result = parseVariants('');
    expect(result.main).toBe('');
    expect(result.data).toBe('');
    expect(result.edge).toBeNull();
  });

  it('is case-insensitive for section labels', () => {
    const raw = `main: Lower case main section with enough content to pass.
data: Lower case data section here.
edge: A unique sharp edge take that differs from main.`;

    const result = parseVariants(raw);
    expect(result.main).toContain('Lower case main');
    expect(result.data).toContain('Lower case data');
  });
});
