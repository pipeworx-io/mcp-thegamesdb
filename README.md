# mcp-thegamesdb

TheGamesDB MCP — wraps TheGamesDB API (thegamesdb.net), a community

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `search_games` | Search the TheGamesDB video-game database by title. Returns matching games with platform name, release date, players, rating, and a short overview. Example: search_games({ name: "zelda", limit: 10 }) |
| `get_game` | Get full metadata for a single game by its TheGamesDB id, including the front boxart image URL. Example: get_game({ id: 108139 }) |
| `list_platforms` | List all gaming platforms known to TheGamesDB (id, name, alias). Useful for resolving platform ids. Example: list_platforms({}) |
| `list_genres` | List all game genres known to TheGamesDB (id, name). Useful for resolving genre ids. Example: list_genres({}) |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "thegamesdb": {
      "url": "https://gateway.pipeworx.io/thegamesdb/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Thegamesdb data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
