# slack-lists-cli

CLI for agentic coding workflows using Linear + Slack. Commands return JSON for agent consumption.

## Why This Exists

This CLI is built specifically for AI coding agents (Claude, GPT, Codex, etc.) to manage tasks in Linear while communicating in Slack. Unlike general-purpose tools, every design decision prioritizes machine readability and agent workflows.

## Design Principles for Agentic Coding

- JSON-only output with stable shapes for parsing.
- Predictable error format: `{"ok": false, "error": "...", "details": {...}}` on stderr with exit code 1.
- No interactive prompts or confirmations.
- Favors Slack IDs (stable references) over display names.
- Minimal dependencies for fast startup in agent loops.

## Requirements

- Node.js >= 18
- Slack token with messaging scopes
- Linear API key
- Paid Slack workspace
- Playwright (optional, for screenshot commands)

## Installation

```bash
npm install -g slack-lists-cli
```

### Screenshot setup (optional)

The `screenshot` commands use Playwright. Install a browser once:
```bash
npx playwright install chromium
```

### Local development install (recommended)

If `npm link slack-lists-cli` hangs from another repo, use one of these instead:

Option A (single-step link):
```bash
npm link /absolute/path/to/slack-lists-cli
```

Option B (file dependency):
```bash
npm install --save-dev /absolute/path/to/slack-lists-cli
```

After linking/installing, the bin name is `slack-lists`:
```bash
slack-lists help
# or
npx slack-lists help
```

### No-install dev option

You can always run the CLI directly:
```bash
node /absolute/path/to/slack-lists-cli/dist/index.js <command>
```

## Quickstart (Linear + Slack)

1) Create a Slack app from `slack-app-manifest.yaml`, then install it to your workspace.
2) Copy the Bot User OAuth Token (`xoxb-...`) and place it in `.env.local`:
   ```
   SLACK_TOKEN=xoxb-...
   ```
3) Create a Linear API key and add it to your project config:
   ```
   .slack-lists.config.json
   ```
4) Invite the bot to the channel where you want updates:
   ```
   /invite @lists-cli
   ```
5) Verify the CLI:
   ```
   node dist/index.js linear auth status
   node dist/index.js linear teams
   node dist/index.js issues list
   ```

## Environment

- `SLACK_TOKEN` (default)
- `SLACK_BOT_TOKEN` or `SLACK_USER_TOKEN` (optional)
- `LINEAR_API_KEY`
- `LINEAR_TEAM_ID` (optional default)
- `LINEAR_CYCLE_ID` (optional default)
- `SLACK_LIST_SCHEMA_PATH` (optional default schema file)
- `SLACK_LIST_DEFAULT_CHANNEL` (optional default channel for comment threads)
- `SLACK_LIST_CONFIG_PATH` (optional path to config.json for per-list defaults)
- `SLACK_LIST_THREAD_MAP_PATH` (optional path to threads.json for item → thread mapping)
- `.env.local` or `.env` files are loaded automatically if present

## Project Config (recommended)

Create `.slack-lists.config.json` in your project root:

```json
{
  "linear": {
    "api_key": "lin_api_...",
    "team_id": "TEAM_ID",
    "cycle_id": "CYCLE_ID"
  },
  "slack": {
    "default_channel": "C12345678"
  }
}
```

This file is ignored by git by default.

## Global Options

- `--token <token>` override token
- `--as-user` use `SLACK_USER_TOKEN`
- `--schema <path>` schema JSON file
- `--refresh-schema` bypass cached schema and refresh from Slack
- `--verbose` include Slack error payloads

## Required OAuth Scopes (Slack)

- `lists:read` (only if using Slack Lists legacy commands)
- `lists:write` (only if using Slack Lists legacy commands)
- `chat:write`
- `users:read`
- `users:read.email`
- `channels:read`
- `groups:read`
- `files:write`

Optional (for comment history via `comments`):
- `channels:history`
- `groups:history`
- `im:history`
- `mpim:history`

Optional (for thread cleanup via `threads cleanup`):
- `channels:history`
- `groups:history`
- `im:history`
- `mpim:history`

## Notes

- Linear is now the primary task backend. Slack Lists commands are retained for legacy/testing use.
- Slack does **not** expose a list discovery API as of January 2026. `slack-lists lists` will return an informative error unless Slack adds this method.
- Items create/update use schema to map friendly flags (`--name`, `--status`, etc). The CLI auto-caches schemas from list/item reads.
- If a list has no items (or columns never populated), Slack won’t expose those columns. Provide `--schema` or use `--field` with `column_id` in that case.
- The CLI caches schemas per list ID at `~/.config/slack-lists-cli/schemas/<list-id>.json` (or `$XDG_CONFIG_HOME`).
- `lists info` will try `slackLists.info`; if unavailable, it infers schema from existing items (limited; no select options or empty columns).
- Schema cache is updated in the background on list/item reads (best-effort) to keep columns in sync.

## Help (LLM-friendly)

```
slack-lists help
```

This returns JSON describing all commands, options, and environment variables for agentic coding.

## Usage

### Auth

```
slack-lists auth status
slack-lists linear auth status
```

### Linear Tasks

```
slack-lists linear teams
slack-lists linear states --team <team-id>
slack-lists issues list
slack-lists issues list --state "In Progress"
slack-lists issues get <issue-id>
slack-lists issues create --title "Task" --team <team-id>
slack-lists issues update <issue-id> --state "In Progress"
```

### Linear Slack Threads

```
slack-lists linear comment <issue-id> "Question for the author"
slack-lists linear comments <issue-id> --compact
```

### Lists

```
slack-lists lists
slack-lists lists id <list-url>
slack-lists lists info <list-id>
slack-lists schema <list-id>
slack-lists schema <list-id> --for-update
slack-lists lists export <list-id> --out ./export.bin
```

### Access

```
slack-lists access set <list-id> --channels C123 --level write
slack-lists access delete <list-id> --channels C123
```

### Items

```
slack-lists items list <list-id>
slack-lists items list <list-id> --compact
slack-lists items get <list-id> <item-id>
slack-lists items create <list-id> --name "Task" --priority high
slack-lists items create <list-id> --name "Task" --agent-state needs_input
slack-lists items update <list-id> <item-id> --status completed
slack-lists items update <list-id> <item-id> --agent-state ready_for_test
slack-lists items update <list-id> <item-id> --field "ColumnKey=value"
```

### Comments & Messaging

```
slack-lists comment <list-id> <item-id> "Comment text" --message-url <url>
slack-lists comments <list-id> <item-id> --compact
slack-lists comment-edit <channel> <ts> "Revised comment text"
slack-lists threads set <list-id> <item-id> --message-url <url>
slack-lists threads get <list-id> <item-id>
slack-lists threads cleanup <list-id> <item-id> --message-url <url> --root-only
slack-lists threads edit <list-id> <item-id> "Updated thread comment" --ts <message-ts>
slack-lists ask <channel> "Question text?" --user @someone
slack-lists post <channel> "Message text"
```

If a list item doesn’t have a Message link yet, `SLACK_LIST_DEFAULT_CHANNEL` is used to
create a thread and attach the permalink automatically.

### Evidence

```
slack-lists evidence upload <list-id> <item-id> ./file.png
slack-lists evidence upload <list-id> <item-id> ./file.png --column Evidence --column-type attachment
slack-lists evidence link <list-id> <item-id> https://example.com
slack-lists evidence list <list-id> <item-id>
```

### Screenshots (UI evidence)

```
slack-lists screenshot capture https://example.com --out ./ui.png --full
slack-lists screenshot capture http://localhost:3000 --selector ".hero"
slack-lists screenshot post https://example.com --channel C123 --comment "UI after change"
slack-lists screenshot post https://example.com --list-id F123 --item-id I456 --channel C123 --comment "UI attached"
slack-lists screenshot post https://example.com --message-url <thread-url> --comment "Updated UI"
```

Screenshots are captured headlessly via Playwright. Use `--wait-for` to wait on a selector
or `--wait` to pause before capture if the UI needs time to settle.

## Schema File Format

Provide a schema file when the CLI can’t infer one (e.g., empty lists). It should contain a `schema` or `columns` array (from Slack list metadata or exports) with `id`, `key`, `name`, `type`, and `options.choices` for selects. Example:

```json
{
  "list_id": "F123",
  "schema": [
    {
      "id": "ColumnId123",
      "key": "priority",
      "name": "Priority",
      "type": "select",
      "options": {
        "choices": [
          { "value": "high", "label": "High" },
          { "value": "medium", "label": "Medium" }
        ]
      }
    }
  ]
}
```

## Agent State (recommended)

Map agent workflow to Linear workflow states. Pick a small, stable set of Linear states
that represent your agent lifecycle (e.g. `Needs Input`, `In Progress`, `Blocked`,
`Ready for Review`, `Ready for Test`) and update issues directly:

```
slack-lists issues update <issue-id> --state "Needs Input"
slack-lists issues update <issue-id> --state "Ready for Test"
```

## Output Format

All commands output JSON to stdout. Errors output JSON to stderr with exit code 1.

**Success**
```json
{
  "ok": true,
  "data": { "...": "..." }
}
```

**Error**
```json
{
  "ok": false,
  "error": "invalid_list_id",
  "details": { "list_id": "L123" }
}
```

## Agent Snippet (AGENTS.md / CLAUDE.md)

```md
## Slack Lists CLI (agentic coding)

You can use the `slack-lists` CLI for agentic coding workflows with Linear + Slack. It outputs JSON for machine parsing.

### How to discover capabilities
- Run `slack-lists help` for a JSON manifest of commands, flags, and env vars.

### Required env
- `SLACK_TOKEN` (or `SLACK_BOT_TOKEN` / `SLACK_USER_TOKEN` with `--as-user`)
- `LINEAR_API_KEY`
- `LINEAR_TEAM_ID` (optional default)
- `LINEAR_CYCLE_ID` (optional default)
- `SLACK_LIST_DEFAULT_CHANNEL` (optional, channel ID or #name for auto-threading)
- `SLACK_LIST_CONFIG_PATH` (optional config.json for per-list defaults)
- `SLACK_LIST_THREAD_MAP_PATH` (optional threads.json for item → thread mapping)

### Project config (recommended)
Create `.slack-lists.config.json` in the repo root with Linear + Slack defaults:

```json
{
  "linear": {
    "api_key": "lin_api_...",
    "team_id": "TEAM_ID",
    "cycle_id": "CYCLE_ID"
  },
  "slack": {
    "default_channel": "C12345678"
  }
}
```

### Schema handling (Slack Lists legacy)
- The CLI caches schemas per list ID at `~/.config/slack-lists-cli/schemas/<list-id>.json` (or `$XDG_CONFIG_HOME`).
- Cache is updated automatically on list/item reads; for empty lists, pass `--schema`.
- Use `--refresh-schema` if columns/options change.
- Use `slack-lists schema <list-id>` for compact, token-efficient schema output.
- Use `slack-lists schema <list-id> --for-update` for update hints and examples.

### Default channel for comments
- Set `SLACK_LIST_DEFAULT_CHANNEL` (e.g. `#team-channel` or `C12345678`) so the CLI can
  auto-create a thread and store its permalink when you post the first comment on an issue.

You can also set per-list defaults in `~/.config/slack-lists-cli/config.json`:
```json
{
  "default_channel": "C12345678",
  "lists": {
    "F123456789": { "channel": "C12345678" }
  }
}
```

Thread mappings are stored in `~/.config/slack-lists-cli/threads.json` and can be managed
via `slack-lists threads set/get`.

To clean up duplicate threads created by accident:
- Preferred (requires history scopes):  
  `slack-lists threads cleanup <list-id> <item-id> --message-url <url>`
- Without history scopes (root only):  
  `slack-lists threads cleanup <list-id> <item-id> --message-url <url> --root-only`

### Common commands
- `slack-lists auth status`
- `slack-lists linear auth status`
- `slack-lists linear teams`
- `slack-lists linear states --team <team-id>`
- `slack-lists issues list`
- `slack-lists issues get <issue-id>`
- `slack-lists issues update <issue-id> --state "In Progress"`
- `slack-lists linear comment <issue-id> "Question"`
- `slack-lists linear comments <issue-id> --compact`
- `slack-lists lists info <list-id>`
- `slack-lists lists id <list-url>`
- `slack-lists schema <list-id>`
- `slack-lists schema <list-id> --for-update`
- `slack-lists items list <list-id>`
- `slack-lists items list <list-id> --compact`
- `slack-lists items create <list-id> --name "Task" --priority high`
- `slack-lists items update <list-id> <item-id> --agent-state needs_input`
- `slack-lists items update <list-id> <item-id> --status completed`
- `slack-lists comments <list-id> <item-id> --compact`
- `slack-lists evidence upload <list-id> <item-id> ./file.png`
- `slack-lists screenshot capture https://example.com --out ./ui.png`
- `slack-lists screenshot post https://example.com --channel C123 --comment "UI update"`
```

## Scripts

- `npm run build`
- `npm run dev`
- `npm run typecheck`
- `npm run prepare` (auto-builds dist for linking)
