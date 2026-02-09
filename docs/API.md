# UiPath MCP Server - API Documentation

This document provides technical details about the UiPath MCP Server API, including architecture, authentication, and integration patterns.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Authentication](#authentication)
- [Transport Modes](#transport-modes)
- [API Client](#api-client)
- [Request Handling](#request-handling)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [Best Practices](#best-practices)

---

## Architecture Overview

The UiPath MCP Server is built on three main components:

```
┌─────────────────────────────────────────────────────────┐
│                    MCP Client                           │
│              (Claude Desktop, Cursor, etc.)             │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ MCP Protocol
                     │
┌────────────────────▼────────────────────────────────────┐
│                 MCP Server (index.ts)                   │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Tool Handlers (executeTool)                      │  │
│  │  Resource Handlers (ReadResourceRequest)          │  │
│  └───────────────────┬───────────────────────────────┘  │
└────────────────────┬─┴──────────────────────────────────┘
                     │
                     │ API Calls
                     │
┌────────────────────▼────────────────────────────────────┐
│            UiPath Client (uipath-client.ts)             │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Authentication (OAuth 2.0 Client Credentials)    │  │
│  │  Token Management (Automatic Refresh)             │  │
│  │  API Request Builder                              │  │
│  │  Error Handling                                   │  │
│  └───────────────────┬───────────────────────────────┘  │
└────────────────────┬─┴──────────────────────────────────┘
                     │
                     │ HTTPS
                     │
┌────────────────────▼────────────────────────────────────┐
│           UiPath Orchestrator API                       │
│  (OData endpoints, REST API, WebSocket)                 │
└─────────────────────────────────────────────────────────┘
```

### Components

1. **MCP Server** (`src/index.ts`)
   - Implements Model Context Protocol
   - Handles tool and resource requests
   - Manages server lifecycle and transport

2. **UiPath Client** (`src/uipath-client.ts`)
   - Wraps UiPath Orchestrator API
   - Handles authentication and token refresh
   - Provides type-safe API methods

3. **Type Definitions** (`src/types.ts`)
   - TypeScript interfaces for all UiPath entities
   - Configuration types
   - Request/response schemas

---

## Authentication

### OAuth 2.0 Client Credentials Flow

The server uses OAuth 2.0 Client Credentials flow for authentication:

```typescript
// Authentication flow
1. Client sends credentials (clientId, clientSecret)
2. Server requests token from UiPath Identity Server
3. Token is cached with expiration time
4. Token is automatically refreshed before expiry
5. All API requests include Bearer token
```

### Configuration

```typescript
interface UiPathConfig {
  baseUrl: string              // Orchestrator URL
  tenantName: string           // Tenant name (default: "Default")
  clientId: string             // OAuth client ID
  clientSecret: string         // OAuth client secret
  defaultFolderId?: number     // Default folder for operations
  disableSslVerify?: boolean   // SSL verification (default: false)
}
```

### Scopes

The following OAuth scopes are requested:

- `OR.Execution` - Execute jobs and processes
- `OR.Queues` - Queue management
- `OR.Folders` - Folder access
- `OR.Jobs` - Job operations
- `OR.Assets` - Asset access
- `OR.Robots` - Robot management
- `OR.Machines` - Machine management
- `OR.Monitoring` - Monitoring and logs
- `OR.Settings` - Settings access
- `OR.Audit` - Audit log access
- `OR.License` - License information

### Token Management

Tokens are automatically managed:

```typescript
class UiPathClient {
  private accessToken: string | null = null
  private tokenExpiresAt: Date | null = null

  private async ensureToken(): Promise<string> {
    // Check if token is valid (with 5-minute buffer)
    if (this.accessToken && this.tokenExpiresAt) {
      const now = new Date()
      const buffer = 5 * 60 * 1000 // 5 minutes
      if (now.getTime() < this.tokenExpiresAt.getTime() - buffer) {
        return this.accessToken
      }
    }

    // Request new token
    const response = await fetch(identityUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        scope: "OR.Execution OR.Queues ..."
      })
    })

    // Cache token and expiration
    const data = await response.json()
    this.accessToken = data.access_token
    this.tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000)

    return this.accessToken
  }
}
```

---

## Transport Modes

The server supports two transport modes:

### 1. STDIO Transport (Default)

Used for local integrations (Claude Desktop, Cursor):

```typescript
// Start in STDIO mode
const transport = new StdioServerTransport()
await server.connect(transport)
```

**Characteristics:**
- Process-based communication
- Single-user
- Credentials via environment variables
- Ideal for desktop applications

### 2. SSE Transport (HTTP Mode)

Used for remote/multi-user integrations:

```typescript
// Start in SSE mode
const app = express()
app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res)
  await server.connect(transport)
})
```

**Characteristics:**
- HTTP-based communication
- Multi-user support
- Credentials via HTTP headers
- Ideal for web applications and services

**HTTP Endpoints:**

```
GET  /health              # Health check
GET  /sse                 # SSE endpoint (requires auth headers)
POST /messages?sessionId  # Message handling
POST /tools/:toolName     # Direct tool invocation
```

**Authentication Headers:**
```
X-UiPath-Url: https://cloud.uipath.com/org/tenant
X-UiPath-Client-Id: your-client-id
X-UiPath-Client-Secret: your-client-secret
X-UiPath-Tenant-Name: Default (optional)
```

---

## API Client

### Request Method

The UiPath client provides a unified request method:

```typescript
private async request<T>(
  method: string,
  endpoint: string,
  params?: Record<string, string>,
  body?: unknown,
  folderId?: number
): Promise<T> {
  // 1. Ensure valid token
  const token = await this.ensureToken()

  // 2. Build headers (including folder header if needed)
  const headers = this.getHeaders(token, folderId)

  // 3. Build URL with query parameters
  let url = `${this.baseUrl}${endpoint}`
  if (params) {
    url += `?${new URLSearchParams(params)}`
  }

  // 4. Execute request
  const response = await fetch(url, { method, headers, body })

  // 5. Handle errors
  if (!response.ok) {
    throw new Error(`API request failed (${response.status})`)
  }

  // 6. Parse and return response
  return response.json() as T
}
```

### Folder Context

Operations are scoped to folders using the `X-UIPATH-OrganizationUnitId` header:

```typescript
private getHeaders(token: string, folderId?: number): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  }

  if (folderId !== undefined) {
    headers["X-UIPATH-OrganizationUnitId"] = String(folderId)
  }

  return headers
}
```

### OData Query Support

The client supports OData query parameters:

```typescript
// Example: Get jobs with filtering and pagination
const { jobs, count } = await client.getJobs({
  state: "Faulted",           // $filter=State eq 'Faulted'
  releaseName: "MyProcess",   // $filter=ReleaseName eq 'MyProcess'
  top: 50,                    // $top=50
  skip: 0,                    // $skip=0
  orderBy: "CreationTime desc" // $orderby=CreationTime desc
})
```

**Supported OData Parameters:**
- `$filter` - Filter results
- `$top` - Limit number of results
- `$skip` - Skip results for pagination
- `$orderby` - Sort results
- `$count` - Include total count

---

## Request Handling

### Tool Execution Flow

```typescript
// 1. MCP client sends tool request
{
  "name": "uipath_get_jobs",
  "arguments": {
    "state": "Running",
    "limit": 10
  }
}

// 2. Server validates arguments with Zod schema
const parsed = schemas.getJobs.parse(args)

// 3. Server executes tool via UiPath client
const result = await client.getJobs({
  state: parsed.state,
  top: parsed.limit
})

// 4. Server formats response
return {
  content: [{
    type: "text",
    text: JSON.stringify(result, null, 2)
  }]
}
```

### Resource Reading Flow

```typescript
// 1. MCP client reads resource
{
  "uri": "uipath://queues"
}

// 2. Server maps URI to client method
switch (uri) {
  case "uipath://queues":
    content = await client.getQueueDefinitions()
    break
}

// 3. Server formats response
return {
  contents: [{
    uri,
    mimeType: "application/json",
    text: JSON.stringify(content, null, 2)
  }]
}
```

---

## Error Handling

### Error Types

1. **Authentication Errors**
   ```typescript
   // Invalid credentials
   Error: Failed to obtain access token: invalid_client
   ```

2. **API Errors**
   ```typescript
   // Resource not found
   Error: API request failed (404): Queue not found

   // Permission denied
   Error: API request failed (403): Insufficient permissions
   ```

3. **Validation Errors**
   ```typescript
   // Invalid parameters
   ZodError: Invalid input: expected number at "jobId"
   ```

### Error Response Format

```typescript
{
  "error": {
    "message": "Detailed error message",
    "type": "uipath_mcp_error"
  }
}
```

### Retry Logic

The client includes automatic retry for certain errors:

```typescript
// Example: Fallback for unsupported OData features
try {
  // Try with $count and $orderby
  data = await this.request("GET", "/odata/Jobs", {
    $count: "true",
    $orderby: "CreationTime desc"
  })
} catch (error) {
  if (error.message.includes("Invalid OData")) {
    // Fallback to basic query
    data = await this.request("GET", "/odata/Jobs")
  } else {
    throw error
  }
}
```

---

## Rate Limiting

### UiPath Orchestrator Limits

UiPath Orchestrator applies rate limiting:

- **Cloud**: ~100 requests/minute per tenant
- **On-Premises**: Configurable (default: 1000 requests/minute)

### Mitigation Strategies

1. **Token Caching**
   - Tokens are cached and reused until expiry
   - Reduces authentication requests

2. **Batch Operations**
   - Use pagination instead of fetching all data
   - Combine related queries

3. **Conditional Requests**
   - Apply filters at API level
   - Use `$top` to limit results

4. **Request Queuing**
   - Implement request queue in your application
   - Throttle concurrent requests

### Example: Efficient Data Retrieval

```typescript
// BAD: Fetching all items
const allItems = await client.getQueueItems({ limit: 10000 })

// GOOD: Paginated fetching
async function* fetchItemsPage(queueId: number) {
  let skip = 0
  const limit = 100

  while (true) {
    const { items, count } = await client.getQueueItems({
      queueId,
      top: limit,
      skip
    })

    yield items

    if (skip + limit >= (count || 0)) break
    skip += limit

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}
```

---

## Best Practices

### 1. Connection Pooling

Keep connections alive for better performance:

```typescript
// Reuse UiPath client instance
const client = new UiPathClient(config)
const server = createServer(client)
```

### 2. Folder Scoping

Always specify folder ID when possible:

```typescript
// GOOD: Scoped to folder
const jobs = await client.getJobs({ folderId: 456 })

// AVOID: Tenant-wide query (slower, permission issues)
const jobs = await client.getJobs()
```

### 3. Pagination

Use pagination for large datasets:

```typescript
// GOOD: Paginated
const { items } = await client.getQueueItems({
  queueId: 123,
  top: 50,
  skip: 0
})

// BAD: Fetching everything
const { items } = await client.getQueueItems({
  queueId: 123,
  top: 10000
})
```

### 4. Error Handling

Implement comprehensive error handling:

```typescript
try {
  const jobs = await client.getJobs({ folderId: 456 })
} catch (error) {
  if (error.message.includes("401")) {
    // Handle authentication error
    console.error("Invalid credentials")
  } else if (error.message.includes("403")) {
    // Handle permission error
    console.error("Insufficient permissions")
  } else if (error.message.includes("404")) {
    // Handle not found
    console.error("Resource not found")
  } else {
    // Handle other errors
    console.error("API error:", error.message)
  }
}
```

### 5. Caching

Cache frequently accessed data:

```typescript
// Cache folders (rarely change)
const folders = await client.getFolders()
// Store in cache with TTL

// Cache releases (change infrequently)
const releases = await client.getReleases(undefined, folderId)
// Store in cache with TTL

// DON'T cache jobs or queue items (change frequently)
```

### 6. Security

- Never log credentials or tokens
- Use environment variables for sensitive config
- Enable SSL verification in production
- Rotate credentials regularly

```typescript
// GOOD
console.log("Connecting to:", config.baseUrl)

// BAD
console.log("Config:", config) // Exposes credentials
```

---

## Integration Examples

### Example 1: Job Monitoring Service

```typescript
import { UiPathClient } from '@uipath/mcp-server'

const client = new UiPathClient({
  baseUrl: process.env.UIPATH_URL!,
  clientId: process.env.UIPATH_CLIENT_ID!,
  clientSecret: process.env.UIPATH_CLIENT_SECRET!,
  tenantName: 'Default'
})

// Monitor faulted jobs every 5 minutes
setInterval(async () => {
  const faultedJobs = await client.getFaultedJobs({
    folderId: 456,
    startTime: new Date(Date.now() - 5 * 60 * 1000).toISOString()
  })

  if (faultedJobs.length > 0) {
    console.error(`${faultedJobs.length} jobs faulted:`)
    faultedJobs.forEach(job => {
      console.error(`- ${job.ReleaseName}: ${job.JobError}`)
    })
  }
}, 5 * 60 * 1000)
```

### Example 2: Queue Processing

```typescript
// Add items to queue
const items = [
  { InvoiceNumber: 'INV-001', Amount: 1500 },
  { InvoiceNumber: 'INV-002', Amount: 2500 },
  { InvoiceNumber: 'INV-003', Amount: 3500 }
]

for (const item of items) {
  await client.addQueueItem('InvoiceQueue', item, {
    reference: item.InvoiceNumber,
    priority: item.Amount > 2000 ? 'High' : 'Normal',
    folderId: 456
  })
}

// Monitor queue progress
const stats = await client.getQueueStats(123, 'InvoiceQueue', 456)
console.log(`Success rate: ${stats.successRate}%`)
```

### Example 3: Process Orchestration

```typescript
// Start multiple jobs with different inputs
const invoices = ['INV-001', 'INV-002', 'INV-003']

for (const invoiceId of invoices) {
  await client.startJob('InvoiceProcessor', {
    inputArguments: { InvoiceId: invoiceId },
    folderId: 456
  })
}

// Wait for completion
let allComplete = false
while (!allComplete) {
  const { jobs } = await client.getJobs({
    releaseName: 'InvoiceProcessor',
    state: 'Running',
    folderId: 456
  })

  allComplete = jobs.length === 0

  if (!allComplete) {
    await new Promise(resolve => setTimeout(resolve, 10000))
  }
}

// Get performance metrics
const performance = await client.getProcessPerformance('InvoiceProcessor', {
  folderId: 456,
  top: 100
})
console.log(`Success rate: ${performance.successRate}%`)
console.log(`Avg duration: ${performance.avgDurationSeconds}s`)
```

---

## API Reference

### UiPath Orchestrator API Documentation

- [API Guide](https://docs.uipath.com/orchestrator/automation-cloud/latest/api-guide/introduction)
- [OData Documentation](https://www.odata.org/documentation/)
- [Authentication](https://docs.uipath.com/orchestrator/automation-cloud/latest/api-guide/building-api-requests)

### Model Context Protocol

- [MCP Specification](https://modelcontextprotocol.io/)
- [MCP SDK](https://github.com/modelcontextprotocol/sdk)

---

For tool-specific documentation, see [TOOLS.md](TOOLS.md).

For general usage, see the [main README](../README.md).
