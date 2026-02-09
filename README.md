# UiPath MCP Server

Model Context Protocol server that gives AI assistants secure access to UiPath
Orchestrator data, queues, jobs, and automation analytics.

[![npm version](https://badge.fury.io/js/%40uipath%2Fmcp-server.svg)](https://www.npmjs.com/package/@uipath/mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

## Overview

UiPath MCP Server connects MCP-compatible assistants to UiPath Orchestrator
without custom integration code. It exposes orchestration capabilities as tools
so assistants can query queues, inspect jobs, start automations, and retrieve
logs with proper authentication and auditing.

This server is designed for teams that want faster operational insights and
automation control from within Claude Desktop, Cursor, or any MCP client. It
supports stdio for local usage and SSE for multi-user or service-to-service
deployments.

**Key Features:**
- Unified access to queues, jobs, robots, assets, and audit logs
- Secure configuration with environment variables and scoped credentials
- SSE transport for multi-user and service integrations
- Rich analytics, licensing, and performance insights

## Table of Contents

- [Getting Started](#getting-started)
- [Configuration Reference](#configuration-reference)
- [Available Tools](#available-tools)
- [Available Resources](#available-resources)
- [Usage Examples](#usage-examples)
- [Development](#development)
- [Known Limitations](#known-limitations)
- [Technical Shortcomings](#technical-shortcomings)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Getting Started

Follow these steps to clone the repo, configure credentials, build, and start
using the MCP server locally.

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or higher (run `node -v` to check)
- Git
- A UiPath Orchestrator instance (Cloud or On-Premises)
- UiPath External Application credentials (see [step 2](#step-2-create-uipath-credentials) below)

### Step 1: Clone and Install

```bash
git clone https://dev.azure.com/uipathcato/uipath/_git/uipath_mcp
cd uipath_mcp
npm install
```

### Step 2: Create UiPath Credentials

You need an External Application in UiPath Orchestrator to authenticate.
For the full walkthrough with screenshots, see the
[UiPath External Applications documentation](https://docs.uipath.com/automation-cloud/docs/managing-external-applications).

Summary:

1. Log in to your UiPath Orchestrator (e.g. `https://cloud.uipath.com`)
2. Navigate to **Admin > External Applications**
3. Click **Add Application**
4. Set **Application Type** to **Confidential**
5. Under **Scopes**, add the following:
   - `OR.Execution`
   - `OR.Queues`
   - `OR.Folders`
   - `OR.Jobs`
   - `OR.Assets`
   - `OR.Robots`
   - `OR.Machines`
   - `OR.Monitoring`
   - `OR.Settings`
   - `OR.Audit`
   - `OR.License`
6. Click **Add**
7. Copy the **App ID** (this is your Client ID) and **App Secret** (Client Secret)

### Step 3: Configure Environment

Copy the example file and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env`:

```bash
UIPATH_URL=https://cloud.uipath.com/your-org/your-tenant
UIPATH_CLIENT_ID=your-client-id
UIPATH_CLIENT_SECRET=your-client-secret
UIPATH_TENANT_NAME=Default
```

If your Orchestrator requires a specific folder context, also set:

```bash
UIPATH_FOLDER_ID=123
```

### Step 4: Build

```bash
npm run build
```

This compiles TypeScript into the `dist/` directory.

### Step 5: Verify

Run the tests to confirm everything is wired up:

```bash
npm test
```

Tests that require live credentials will skip automatically if `.env` is not
configured.

### Step 6: Connect to an MCP Client

Pick the client you use and follow the corresponding section.

#### Claude Desktop

Open the Claude Desktop configuration file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

Add this entry (replace the path with the absolute path to your clone):

```json
{
  "mcpServers": {
    "uipath": {
      "command": "node",
      "args": ["C:/Users/you/uipath_mcp/dist/index.js"],
      "env": {
        "UIPATH_URL": "https://cloud.uipath.com/your-org/your-tenant",
        "UIPATH_CLIENT_ID": "your-client-id",
        "UIPATH_CLIENT_SECRET": "your-client-secret",
        "UIPATH_TENANT_NAME": "Default"
      }
    }
  }
}
```

Restart Claude Desktop. You should see the UiPath tools available.

#### Cursor IDE

Create or edit `.cursor/mcp.json` in your project root (or globally at
`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "uipath": {
      "command": "node",
      "args": ["C:/Users/you/uipath_mcp/dist/index.js"],
      "env": {
        "UIPATH_URL": "https://cloud.uipath.com/your-org/your-tenant",
        "UIPATH_CLIENT_ID": "your-client-id",
        "UIPATH_CLIENT_SECRET": "your-client-secret",
        "UIPATH_TENANT_NAME": "Default"
      }
    }
  }
}
```

Restart Cursor. The UiPath tools will appear in the MCP tool list.

#### SSE / HTTP Mode (Multi-User)

Start the server in SSE mode:

**macOS / Linux:**
```bash
MCP_TRANSPORT=sse PORT=3000 npm start
```

**Windows (PowerShell):**
```powershell
$env:MCP_TRANSPORT="sse"; $env:PORT="3000"; npm start
```

The server listens on `http://localhost:3000` with these endpoints:

| Endpoint | Method | Description |
| --- | --- | --- |
| `/health` | GET | Health check |
| `/sse` | GET | SSE stream for MCP clients |
| `/messages` | POST | MCP message handler |
| `/tools/:toolName` | POST | Direct REST tool invocation |

Clients must send UiPath credentials via headers:

```bash
curl -X POST http://localhost:3000/tools/uipath_get_folders \
  -H "Content-Type: application/json" \
  -H "X-UiPath-Url: https://cloud.uipath.com/your-org/your-tenant" \
  -H "X-UiPath-Client-Id: your-client-id" \
  -H "X-UiPath-Client-Secret: your-client-secret" \
  -d '{"limit": 50}'
```

### Step 7: Try It Out

Once connected, try these prompts in your MCP client:

- "Show me all UiPath folders"
- "List running jobs"
- "What queues are available?"
- "Get the dashboard summary"
- "Show failed jobs from the last 24 hours"

## Configuration Reference

### Required Environment Variables

| Variable | Description | Required | Example |
| --- | --- | --- | --- |
| `UIPATH_URL` | UiPath Orchestrator base URL | Yes | `https://cloud.uipath.com/org/tenant` |
| `UIPATH_CLIENT_ID` | External Application client ID | Yes | `app-1234` |
| `UIPATH_CLIENT_SECRET` | External Application client secret | Yes | `secret-1234` |

### Optional Environment Variables

| Variable | Description | Default | Example |
| --- | --- | --- | --- |
| `UIPATH_TENANT_NAME` | Tenant name | `Default` | `Production` |
| `UIPATH_FOLDER_ID` | Default folder ID | none | `123` |
| `UIPATH_DISABLE_SSL_VERIFY` | Disable SSL verification | `0` | `1` |
| `MCP_TRANSPORT` | Transport mode | `stdio` | `sse` |
| `PORT` | HTTP port for SSE mode | `3000` | `8080` |

## Available Tools

The server exposes UiPath Orchestrator functionality as MCP tools. Full details
are in [TOOLS.md](docs/TOOLS.md).

### Queue Tools

- `uipath_get_queue_definitions` - List queue definitions
- `uipath_get_queue_items` - Query queue items with filters
- `uipath_add_queue_item` - Add items to queues
- `uipath_get_queue_stats` - Queue statistics

### Job Tools

- `uipath_get_jobs` - List jobs with filters
- `uipath_get_job_details` - Job details by ID
- `uipath_start_job` - Start a job by process name
- `uipath_stop_job` - Stop a running job
- `uipath_get_job_stats` - Job statistics

### Robot and Machine Tools

- `uipath_get_robots` - List robots with optional folder filter
- `uipath_get_sessions` - Active robot sessions
- `uipath_get_machines` - Machine inventory

### Asset, Log, and Audit Tools

- `uipath_get_assets` - List assets in a folder
- `uipath_get_robot_asset` - Get asset by robot ID and name
- `uipath_get_robot_logs` - Query robot logs
- `uipath_get_audit_logs` - Audit trail entries

### Analytics, Scheduling, and Licensing Tools

- `uipath_get_faulted_jobs` - Failed jobs with error details
- `uipath_get_process_performance` - Process performance analytics
- `uipath_get_folder_overview` - Folder health overview
- `uipath_get_dashboard_summary` - Dashboard summary
- `uipath_get_schedules` - Process schedules and triggers
- `uipath_get_consumption_license_stats` - Consumption license usage
- `uipath_get_license_stats` - Traditional license usage
- `uipath_get_licenses_runtime` - Runtime license details
- `uipath_get_licenses_named_user` - Named-user license details
- `uipath_get_count_stats` - Entity counts
- `uipath_get_sessions_stats` - Robot session statistics

## Available Resources

Read-only resources available via URIs:

- `uipath://folders`
- `uipath://robots`
- `uipath://machines`
- `uipath://queues`
- `uipath://jobs/recent`
- `uipath://releases`
- `uipath://dashboard`
- `uipath://sessions`
- `uipath://assets`
- `uipath://schedules`

## Usage Examples

### Example 1: Inspect Queue Items

**Scenario:** Review failed queue items for a specific queue.

**Tool Call:**
```json
{
  "tool": "uipath_get_queue_items",
  "arguments": {
    "queueName": "CustomerOrders",
    "status": "Failed",
    "limit": 25
  }
}
```

**Result:** A list of failed items with their payloads and error details.

### Example 2: Start a Job

**Scenario:** Launch a process with input arguments.

**Tool Call:**
```json
{
  "tool": "uipath_start_job",
  "arguments": {
    "processName": "InvoiceProcessor",
    "inputArguments": {
      "InvoiceId": "INV-10045"
    }
  }
}
```

**Result:** A job start response with the new job details.

### Example 3: Get Robot Logs

**Scenario:** Review logs for a specific time window.

**Tool Call:**
```json
{
  "tool": "uipath_get_robot_logs",
  "arguments": {
    "startTime": "2025-01-01T00:00:00Z",
    "endTime": "2025-01-01T02:00:00Z",
    "limit": 100
  }
}
```

**Result:** Log entries matching the time range and filters.

## Development

### Available Scripts

```bash
npm run dev          # Run in development mode (tsx, auto-reload)
npm run build        # Compile TypeScript to dist/
npm start            # Run compiled server (requires build first)
npm test             # Run test suite
npm run test:watch   # Re-run tests on file changes
npm run test:coverage # Tests with coverage report
npm run lint         # Run ESLint
npm run format       # Format with Prettier
npm run inspect      # Launch MCP Inspector for interactive testing
```

### Project Structure

```
uipath_mcp/
  src/
    index.ts           # MCP server, tool definitions, request routing
    uipath-client.ts   # UiPath Orchestrator API client
    types.ts           # TypeScript type definitions
  tests/               # Test suite (Vitest)
  docs/                # API and tool reference docs
  examples/            # Example config files for Claude Desktop / Cursor
  dist/                # Compiled output (generated by npm run build)
```

## Known Limitations

- SSE mode requires clients to send UiPath credentials on each connection
- Tool execution is synchronous; long-running UiPath jobs are not streamed
- No built-in retry/backoff for transient UiPath API failures
- Limited pagination control for some composite analytics endpoints
- Resource URIs return fixed-size snapshots rather than live streams

## Technical Shortcomings

- Token acquisition happens on-demand per client without shared caching
- No request throttling or circuit-breaking for bursty clients
- Error payloads are normalized but do not expose structured error codes
- SSE sessions are in-memory only and are lost on server restart
- No OpenTelemetry tracing or metrics export built in

## Troubleshooting

### Failed to Obtain Access Token

Verify your External Application has the required scopes:

- OR.Execution
- OR.Queues
- OR.Folders
- OR.Jobs
- OR.Assets
- OR.Robots
- OR.Machines
- OR.Monitoring
- OR.Settings
- OR.Audit
- OR.License

### SSL Verification Errors

For on-premises Orchestrator, set `UIPATH_DISABLE_SSL_VERIFY=1` if required.

### Folder Access Errors

Set `UIPATH_FOLDER_ID` or pass `folderId` to tools to target a specific folder.

### Debug Logging

```bash
export DEBUG=uipath-mcp:*
npm start
```

## Security

- Store credentials in environment variables
- Do not log or commit secrets
- Scope External Application permissions to least privilege

## License

MIT License - see [LICENSE](LICENSE) for details.
