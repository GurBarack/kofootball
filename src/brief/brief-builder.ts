import { config } from '../config.js';
import type { ScoredStory } from '../detection/detector.js';
import type { PublishableStory } from '../selection/selector.js';
import type { NewsSignals, TeamBuzz } from '../news/signals.js';

// ── Brief types ─────────────────────────────────────────────────────────

export interface KeyFact {
  fact: string;
  source: 'standings' | 'fixture' | 'form' | 'streak' | 'gap';
}

export interface SourceSignal {
  team: string;
  articleCount: number;
  buzzScore: number;
  headlines: string[];
  events: string[];
}

export interface StoryBrief {
  storyId?: number;
  entity: string;
  competition: string;
  storyType: string;
  headline: string;
  summary: string;
  whatHappened: string;
  whyItMatters: string;
  keyFacts: KeyFact[];
  mainAngle: string;
  tension: string;
  discussionHook: string;
  fanReactionPotential: 'low' | 'medium' | 'high';
  contentRecommendation: 'short_post' | 'thread';
  storyConfidence: 'low' | 'medium' | 'high';
  sourceSignals: SourceSignal[];
}

// ── Entity extraction ───────────────────────────────────────────────────

function extractEntity(story: ScoredStory): string {
  const p = story.payload as Record<string, unknown>;

  const teams = p.teams as Array<{ name: string }> | undefined;
  if (teams && teams.length > 0) {
    return teams.map(t => t.name).join(' vs ');
  }

  const fixture = p.fixture as { home?: string; away?: string } | undefined;
  if (fixture) {
    return [fixture.home, fixture.away].filter(Boolean).join(' vs ');
  }

  const team = p.team as string | undefined;
  if (team) return team;

  return 'Unknown';
}

// ── Key facts extraction ────────────────────────────────────────────────

function extractKeyFacts(story: ScoredStory): KeyFact[] {
  const p = story.payload as Record<string, unknown>;
  const facts: KeyFact[] = [];

  const teams = p.teams as Array<Record<string, unknown>> | undefined;
  if (teams) {
    for (const t of teams) {
      const parts: string[] = [`${t.name}: ${t.points}pts`];
      if (t.rank) parts[0] = `${t.name}: #${t.rank}, ${t.points}pts`;
      if (t.form) parts.push(`form ${t.form}`);
      if (t.goal_diff !== undefined && t.goal_diff !== 'N/A') {
        parts.push(`GD ${Number(t.goal_diff) > 0 ? '+' : ''}${t.goal_diff}`);
      }
      facts.push({ fact: parts.join(', '), source: 'standings' });
    }
  }

  if (p.gamesLeft !== undefined) {
    facts.push({ fact: `${p.gamesLeft} games remaining`, source: 'standings' });
  }

  if (p.pointGap !== undefined) {
    facts.push({ fact: `${p.pointGap}-point gap between contenders`, source: 'gap' });
  }

  if (p.gapAtCutoff !== undefined) {
    facts.push({ fact: `${p.gapAtCutoff}-point gap at qualification cutoff`, source: 'gap' });
  }

  if (p.cutoffRank) {
    facts.push({ fact: `Relegation line at position ${p.cutoffRank}`, source: 'standings' });
  }

  if (p.streakType) {
    const direction = p.streakType === 'hot' ? 'winning' : 'losing';
    facts.push({ fact: `${p.team} on a ${direction} streak (form: ${p.form})`, source: 'streak' });
    if (p.winsInLast5) facts.push({ fact: `${p.winsInLast5} wins in last 5`, source: 'form' });
    if (p.lossesInLast5) facts.push({ fact: `${p.lossesInLast5} losses in last 5`, source: 'form' });
    if (p.rank) facts.push({ fact: `Currently ranked #${p.rank} with ${p.points}pts`, source: 'standings' });
  }

  const fixture = p.fixture as Record<string, unknown> | undefined;
  if (fixture) {
    let fixFact = `${fixture.home} vs ${fixture.away}`;
    if (fixture.round) fixFact += ` (${fixture.round})`;
    facts.push({ fact: fixFact, source: 'fixture' });

    const hs = p.homeStanding as Record<string, unknown> | undefined;
    const as_ = p.awayStanding as Record<string, unknown> | undefined;
    if (hs) facts.push({ fact: `${fixture.home}: #${hs.rank}, ${hs.points}pts, form ${hs.form}`, source: 'standings' });
    if (as_) facts.push({ fact: `${fixture.away}: #${as_.rank}, ${as_.points}pts, form ${as_.form}`, source: 'standings' });

    if (p.pointGap !== undefined) {
      facts.push({ fact: `${p.pointGap}-point gap between the two sides`, source: 'gap' });
    }
  }

  return facts;
}

// ── Narrative components ────────────────────────────────────────────────

function buildWhatHappened(story: ScoredStory): string {
  const p = story.payload as Record<string, unknown>;

  switch (story.type) {
    case 'title_race': {
      const teams = (p.teams as Array<{ name: string; points: number }>) ?? [];
      const names = teams.map(t => t.name).join(', ');
      return `${names} are separated by ${p.pointGap ?? '?'} points with ${p.gamesLeft ?? '?'} games left in the title race.`;
    }
    case 'relegation': {
      const teams = (p.teams as Array<{ name: string }>) ?? [];
      const names = teams.map(t => t.name).join(', ');
      return `${names} are in the relegation zone or within touching distance with ${p.gamesLeft ?? '?'} games remaining.`;
    }
    case 'momentum': {
      const direction = p.streakType === 'hot' ? 'strong run of form' : 'poor run of form';
      return `${p.team} are on a ${direction} (${p.form}), currently sitting #${p.rank} with ${p.points} points.`;
    }
    case 'qualification': {
      const teams = (p.teams as Array<{ name: string }>) ?? [];
      const names = teams.map(t => t.name).join(', ');
      return `${names} are battling for European qualification spots, separated by ${p.gapAtCutoff ?? '?'} points at the cutoff with ${p.gamesLeft ?? '?'} games left.`;
    }
    case 'critical_fixture': {
      const fix = p.fixture as { home: string; away: string; round?: string };
      return `${fix.home} host ${fix.away} in a fixture with direct implications on the ${(p as Record<string, unknown>).context ?? 'table'}.`;
    }
    default:
      return story.headline;
  }
}

function buildWhyItMatters(story: ScoredStory): string {
  const p = story.payload as Record<string, unknown>;
  const gamesLeft = p.gamesLeft as number | undefined;

  switch (story.type) {
    case 'title_race':
      return gamesLeft && gamesLeft <= 5
        ? `With only ${gamesLeft} games left, every point is decisive. The margin for error is nearly gone.`
        : `The title race remains tight enough that form over the next few weeks will be defining.`;
    case 'relegation':
      return gamesLeft && gamesLeft <= 5
        ? `Survival is on the line. At this stage, one result can change a club's entire trajectory.`
        : `The bottom of the table is congested enough that form swings could shuffle the relegation picture.`;
    case 'momentum': {
      const rank = p.rank as number | undefined;
      const streakType = p.streakType as string;
      if (streakType === 'cold' && rank && rank <= 6)
        return `A top-six side losing momentum at this stage raises serious questions about their ability to hold position.`;
      if (streakType === 'hot' && rank && rank >= 15)
        return `A side in the lower half finding form now could pull themselves out of danger entirely.`;
      return `Sustained form like this reshapes expectations and affects the wider table around them.`;
    }
    case 'qualification':
      return `European places bring revenue, prestige, and better transfer windows. Missing out changes a club's summer plans entirely.`;
    case 'critical_fixture':
      return `A direct meeting between sides close in the table means points swing twice — one gains what the other loses.`;
    default:
      return `This is a story worth watching closely.`;
  }
}

function buildMainAngle(story: ScoredStory): string {
  const p = story.payload as Record<string, unknown>;

  switch (story.type) {
    case 'title_race': {
      const teams = (p.teams as Array<{ name: string; form?: string }>) ?? [];
      const bestForm = teams.reduce<{ name: string; fs: number }>((best, t) => {
        const fs = formScore(t.form ?? '');
        return fs > best.fs ? { name: t.name, fs } : best;
      }, { name: '', fs: -Infinity });
      return bestForm.name
        ? `${bestForm.name}'s form makes them the most dangerous contender right now.`
        : `The title race is wide open with no clear frontrunner on form.`;
    }
    case 'relegation': {
      const teams = (p.teams as Array<{ name: string; form?: string }>) ?? [];
      const worstForm = teams.reduce<{ name: string; fs: number }>((worst, t) => {
        const fs = formScore(t.form ?? '');
        return fs < worst.fs ? { name: t.name, fs } : worst;
      }, { name: '', fs: Infinity });
      return worstForm.name
        ? `${worstForm.name}'s form suggests they are the most likely to go down.`
        : `The relegation picture remains unclear — form alone isn't separating anyone.`;
    }
    case 'momentum':
      return p.streakType === 'hot'
        ? `${p.team}'s recent surge is the kind of run that changes season narratives.`
        : `${p.team}'s slide is alarming and raises pressure on the manager and squad.`;
    case 'qualification':
      return `The race for European spots is tighter than the table suggests — form is the real differentiator.`;
    case 'critical_fixture':
      return `This is effectively a six-pointer — the result will reshape the standings for both sides.`;
    default:
      return `The data points to a story the table alone doesn't tell.`;
  }
}

function buildTension(story: ScoredStory): string {
  const p = story.payload as Record<string, unknown>;

  switch (story.type) {
    case 'title_race': {
      const teams = (p.teams as Array<{ name: string; form?: string }>) ?? [];
      if (teams.length >= 2) {
        const forms = teams.map(t => ({ name: t.name, score: formScore(t.form ?? '') }));
        forms.sort((a, b) => b.score - a.score);
        if (forms[0].score !== forms[forms.length - 1].score) {
          return `${forms[0].name} have the form but ${forms[forms.length - 1].name} may have the points. Something has to give.`;
        }
      }
      return `The gap is small enough that a single bad weekend changes the leader.`;
    }
    case 'relegation':
      return `Teams at the bottom know every fixture from now on carries the weight of the entire season.`;
    case 'momentum':
      return p.streakType === 'hot'
        ? `Can ${p.team} sustain this, or is this a false dawn?`
        : `How much longer before something changes — tactically or on the touchline?`;
    case 'qualification':
      return `The margins are thin enough that one dropped result could cost a European place.`;
    case 'critical_fixture':
      return `Both sides need the points. Only one can have them. The pressure falls heaviest on the home side.`;
    default:
      return `The outcome of the next few matches will determine whether this story escalates or fades.`;
  }
}

function buildDiscussionHook(story: ScoredStory): string {
  const p = story.payload as Record<string, unknown>;

  switch (story.type) {
    case 'title_race': {
      const teams = (p.teams as Array<{ name: string }>) ?? [];
      if (teams.length >= 2) return `Who do you trust more in the final stretch — ${teams[0].name} or ${teams[1].name}?`;
      return `Can anyone close the gap, or is it already decided?`;
    }
    case 'relegation':
      return `Which side looks most doomed based on what you've seen this season?`;
    case 'momentum':
      return p.streakType === 'hot'
        ? `Is ${p.team}'s form real, or will it collapse under pressure?`
        : `What needs to change at ${p.team} — the players, the system, or the manager?`;
    case 'qualification':
      return `Who deserves a European place — and who has been flattering to deceive?`;
    case 'critical_fixture':
      return `Who needs this result more?`;
    default:
      return `What's your take on how this plays out?`;
  }
}

// ── Confidence & reaction ───────────────────────────────────────────────

function assessConfidence(story: PublishableStory): 'low' | 'medium' | 'high' {
  if (story.score >= 75 && story.narrativeStrength >= 60) return 'high';
  if (story.score >= 60 || story.narrativeStrength >= 50) return 'medium';
  return 'low';
}

function assessFanReaction(story: PublishableStory): 'low' | 'medium' | 'high' {
  const p = story.payload as Record<string, unknown>;
  const gamesLeft = (p.gamesLeft as number) ?? 20;

  // Late-season high-stakes = high reaction
  if (gamesLeft <= 5 && (story.type === 'title_race' || story.type === 'relegation')) return 'high';
  if (story.narrativeStrength >= 65) return 'high';
  if (story.score >= 70) return 'medium';
  return 'low';
}

// ── Source signals ──────────────────────────────────────────────────────

function extractSourceSignals(story: ScoredStory, newsSignals?: NewsSignals): SourceSignal[] {
  if (!newsSignals) return [];

  const teamNames = extractTeamNamesForSignals(story);
  const signals: SourceSignal[] = [];

  for (const name of teamNames) {
    const buzz = newsSignals.teamBuzz.get(name);
    if (!buzz || buzz.articleCount === 0) continue;
    signals.push({
      team: buzz.team,
      articleCount: buzz.articleCount,
      buzzScore: buzz.buzzScore,
      headlines: [...buzz.headlines],
      events: buzz.signals.map(s => `${s.type} (strength: ${s.strength})`),
    });
  }

  return signals;
}

function extractTeamNamesForSignals(story: ScoredStory): string[] {
  const p = story.payload as Record<string, unknown>;

  const teams = p.teams as Array<{ name: string }> | undefined;
  if (teams && teams.length > 0) return teams.map(t => t.name.toLowerCase());

  const fixture = p.fixture as { home?: string; away?: string } | undefined;
  if (fixture) {
    const names: string[] = [];
    if (fixture.home) names.push(fixture.home.toLowerCase());
    if (fixture.away) names.push(fixture.away.toLowerCase());
    return names;
  }

  const team = p.team as string | undefined;
  if (team) return [team.toLowerCase()];

  return [];
}

// ── Helpers ─────────────────────────────────────────────────────────────

function formScore(form: string): number {
  let s = 0;
  for (const c of form) {
    if (c === 'W') s += 1;
    else if (c === 'L') s -= 1;
  }
  return s;
}

// ── Main builder ────────────────────────────────────────────────────────

export function buildBrief(
  story: PublishableStory,
  newsSignals?: NewsSignals,
  storyId?: number,
): StoryBrief {
  const competition = config.leagues[story.league_id] || `League ${story.league_id}`;

  return {
    storyId,
    entity: extractEntity(story),
    competition,
    storyType: story.type,
    headline: story.headline,
    summary: `${buildWhatHappened(story)} ${buildWhyItMatters(story)}`,
    whatHappened: buildWhatHappened(story),
    whyItMatters: buildWhyItMatters(story),
    keyFacts: extractKeyFacts(story),
    mainAngle: buildMainAngle(story),
    tension: buildTension(story),
    discussionHook: buildDiscussionHook(story),
    fanReactionPotential: assessFanReaction(story),
    contentRecommendation: story.contentMode,
    storyConfidence: assessConfidence(story),
    sourceSignals: extractSourceSignals(story, newsSignals),
  };
}
