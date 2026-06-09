interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * TheGamesDB MCP — wraps TheGamesDB API (thegamesdb.net), a community
 * video-game metadata database (titles, platforms, genres, release dates,
 * artwork/boxart).
 *
 * Tools:
 * - search_games: search games by title
 * - get_game: full metadata for a single game id (with boxart URL)
 * - list_platforms: all known gaming platforms
 * - list_genres: all known genres
 *
 * Dual-key model: _apiKey is OPTIONAL. Pass your own TheGamesDB key for your
 * own monthly allowance, or omit it to use the shared Pipeworx platform key.
 * Auth is sent via the `apikey` query param on every request.
 *
 * NOTE: TheGamesDB's free tier is limited (~1000 calls/month). Each response
 * carries `remaining_monthly_allowance`.
 */


const BASE_URL = 'https://api.thegamesdb.net/v1';
const UA = 'pipeworx/1.0 (+https://pipeworx.io)';

const tools: McpToolExport['tools'] = [
  {
    name: 'search_games',
    description:
      'Search the TheGamesDB video-game database by title. Returns matching games with platform name, release date, players, rating, and a short overview. Example: search_games({ name: "zelda", limit: 10 })',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Game title or keyword to search for, e.g. "zelda", "halo", "final fantasy"',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default 15)',
        },
        _apiKey: {
          type: 'string',
          description: 'Optional TheGamesDB API key. Omit to use the shared Pipeworx platform key.',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_game',
    description:
      'Get full metadata for a single game by its TheGamesDB id, including the front boxart image URL. Example: get_game({ id: 108139 })',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: ['number', 'string'],
          description: 'TheGamesDB game id, e.g. 108139',
        },
        _apiKey: {
          type: 'string',
          description: 'Optional TheGamesDB API key. Omit to use the shared Pipeworx platform key.',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_platforms',
    description:
      'List all gaming platforms known to TheGamesDB (id, name, alias). Useful for resolving platform ids. Example: list_platforms({})',
    inputSchema: {
      type: 'object',
      properties: {
        _apiKey: {
          type: 'string',
          description: 'Optional TheGamesDB API key. Omit to use the shared Pipeworx platform key.',
        },
      },
      required: [],
    },
  },
  {
    name: 'list_genres',
    description:
      'List all game genres known to TheGamesDB (id, name). Useful for resolving genre ids. Example: list_genres({})',
    inputSchema: {
      type: 'object',
      properties: {
        _apiKey: {
          type: 'string',
          description: 'Optional TheGamesDB API key. Omit to use the shared Pipeworx platform key.',
        },
      },
      required: [],
    },
  },
];

const NO_KEY = { error: 'TheGamesDB requires an API key via _apiKey or the platform key' };

// Map a TheGamesDB API `code` to a friendly error, or null if the code is OK.
function codeError(code: number | undefined): { error: string } | null {
  if (code === undefined || code === 200) return null;
  if (code === 401) return { error: 'TheGamesDB auth error (check key)' };
  if (code === 403 || code === 429) {
    return { error: 'TheGamesDB rate/allowance error (free tier ~1000/mo)' };
  }
  return { error: `TheGamesDB error (code ${code})` };
}

interface GameRaw {
  id: number;
  game_title: string;
  release_date?: string | null;
  platform?: number | null;
  players?: number | null;
  overview?: string | null;
  rating?: string | null;
  genres?: number[] | null;
}

interface PlatformEntry {
  id: number;
  name: string;
  alias?: string;
}

interface BoxartImage {
  type?: string;
  side?: string;
  filename?: string;
}

interface Envelope {
  code?: number;
  status?: string;
  data?: {
    count?: number;
    games?: GameRaw[];
    platforms?: Record<string, PlatformEntry>;
    genres?: Record<string, { id: number; name: string }>;
  };
  include?: {
    platform?: { data?: Record<string, PlatformEntry> };
    boxart?: {
      base_url?: Record<string, string>;
      data?: Record<string, BoxartImage[]>;
    };
  };
  remaining_monthly_allowance?: number;
}

function truncate(s: string | null | undefined, max = 300): string | null {
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

// Resolve a numeric platform id to its human name via the `include.platform`
// block when present; otherwise fall back to the raw id.
function resolvePlatform(
  platformId: number | null | undefined,
  include: Envelope['include'],
): string | number | null {
  if (platformId === null || platformId === undefined) return null;
  const entry = include?.platform?.data?.[String(platformId)];
  return entry?.name ?? platformId;
}

function mapGame(g: GameRaw, include: Envelope['include']) {
  return {
    id: g.id,
    title: g.game_title,
    release_date: g.release_date ?? null,
    platform: resolvePlatform(g.platform, include),
    players: g.players ?? null,
    rating: g.rating ?? null,
    overview: truncate(g.overview),
  };
}

async function tgdbFetch(path: string, apiKey: string): Promise<Envelope> {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${BASE_URL}${path}${sep}apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (res.status === 401) {
    return { code: 401 };
  }
  if (res.status === 403 || res.status === 429) {
    return { code: 403 };
  }
  return (await res.json()) as Envelope;
}

async function searchGames(name: string, limit: number, apiKey: string) {
  const params = new URLSearchParams({
    name,
    fields: 'players,platform,genres,overview,rating,release_date',
    include: 'platform',
  });
  const env = await tgdbFetch(`/Games/ByGameName?${params}`, apiKey);
  const err = codeError(env.code);
  if (err) return err;

  const games = env.data?.games ?? [];
  const capped = games.slice(0, limit).map((g) => mapGame(g, env.include));
  return {
    count: env.data?.count ?? games.length,
    games: capped,
  };
}

async function getGame(id: string, apiKey: string) {
  const params = new URLSearchParams({
    id,
    fields: 'players,platform,genres,overview,rating,release_date',
    include: 'boxart,platform',
  });
  const env = await tgdbFetch(`/Games/ByGameID?${params}`, apiKey);
  const err = codeError(env.code);
  if (err) return err;

  const games = env.data?.games ?? [];
  if (games.length === 0) {
    return { error: 'game not found', id };
  }
  const game = games[0];
  const mapped = mapGame(game, env.include);

  // Build the first front boxart URL from the include block, if present.
  let boxart: string | null = null;
  const boxartList = env.include?.boxart?.data?.[String(game.id)];
  const baseOriginal = env.include?.boxart?.base_url?.original;
  if (boxartList && boxartList.length > 0 && baseOriginal) {
    const front = boxartList.find((b) => b.side === 'front') ?? boxartList[0];
    if (front?.filename) {
      boxart = `${baseOriginal}${front.filename}`;
    }
  }

  return { ...mapped, boxart };
}

async function listPlatforms(apiKey: string) {
  const env = await tgdbFetch('/Platforms', apiKey);
  const err = codeError(env.code);
  if (err) return err;

  const platforms = Object.values(env.data?.platforms ?? {}).map((p) => ({
    id: p.id,
    name: p.name,
    alias: p.alias ?? null,
  }));
  return { count: platforms.length, platforms };
}

async function listGenres(apiKey: string) {
  const env = await tgdbFetch('/Genres', apiKey);
  const err = codeError(env.code);
  if (err) return err;

  const genres = Object.values(env.data?.genres ?? {}).map((g) => ({
    id: g.id,
    name: g.name,
  }));
  return { count: genres.length, genres };
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const apiKey = args._apiKey as string | undefined;
  delete args._apiKey;

  try {
    if (!apiKey) return NO_KEY;

    switch (name) {
      case 'search_games': {
        const q = String(args.name ?? '');
        const limit =
          typeof args.limit === 'number' && args.limit > 0 ? Math.floor(args.limit) : 15;
        return await searchGames(q, limit, apiKey);
      }
      case 'get_game':
        return await getGame(String(args.id ?? ''), apiKey);
      case 'list_platforms':
        return await listPlatforms(apiKey);
      case 'list_genres':
        return await listGenres(apiKey);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
