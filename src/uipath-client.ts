import type {
  UiPathConfig,
  TokenResponse,
  ODataResponse,
  QueueDefinition,
  QueueItem,
  QueueItemStatus,
  AddQueueItemRequest,
  Folder,
  Robot,
  Machine,
  AssetValue,
  RobotLog,
  Job,
  JobState,
  StartJobRequest,
  StopJobRequest,
  Release,
  QueueStats,
  JobStats,
  Session,
  Asset,
  ProcessSchedule,
  AuditLog,
  FaultedJobSummary,
  ProcessPerformance,
  FolderOverview,
  ConsumptionLicenseStatsModel,
  LicenseStatsModel,
  LicenseNamedUserDto,
  LicenseRuntimeDto,
  CountStats,
  RobotType,
} from "./types.js"

/**
 * Client for the UiPath Orchestrator REST API.
 *
 * Handles OAuth 2.0 client-credentials authentication, automatic token
 * refresh, OData query building, and folder-scoped requests. All public
 * methods correspond to Orchestrator API endpoints and return typed results.
 */
export class UiPathClient {
  private config: UiPathConfig
  private accessToken: string | null = null
  private tokenExpiresAt: Date | null = null
  private baseUrl: string
  private defaultFolderId?: number

  constructor(config: UiPathConfig) {
    this.config = config
    if (this.config.disableSslVerify) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
    }
    this.defaultFolderId = config.defaultFolderId
    this.baseUrl = this.buildOrchestratorUrl()
  }

  private getFolderId(folderId?: number): number | undefined {
    return folderId ?? this.defaultFolderId
  }

  private escapeODataString(value: string): string {
    return value.replace(/'/g, "''")
  }

  private buildOrchestratorUrl(): string {
    let base = this.config.baseUrl
    const tenant = this.config.tenantName

    if (!base.includes("orchestrator_")) {
      base = base.replace(/\/$/, "")
      if (base.toLowerCase().endsWith(`/${tenant.toLowerCase()}`)) {
        return `${base}/orchestrator_`
      }
      return `${base}/${tenant}/orchestrator_`
    }
    return base
  }

  private getIdentityUrl(): string {
    const url = new URL(this.config.baseUrl)
    // Extract organization path from the URL pathname
    const pathParts = url.pathname.split('/').filter(p => p)
    const orgPath = pathParts.length > 0 ? `/${pathParts[0]}` : ''
    return `${url.protocol}//${url.host}${orgPath}/identity_/connect/token`
  }

  private async ensureToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiresAt) {
      const now = new Date()
      const buffer = 5 * 60 * 1000 // 5 minutes buffer
      if (now.getTime() < this.tokenExpiresAt.getTime() - buffer) {
        return this.accessToken
      }
    }

    const identityUrl = this.getIdentityUrl()
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      scope: "OR.Execution OR.Queues OR.Folders OR.Jobs OR.Assets OR.Robots OR.Machines OR.Monitoring OR.Settings OR.Audit OR.License",
    })

    // Debug logging without leaking secrets
    if (process.env.DEBUG_AUTH) {
      console.error("DEBUG: Identity URL:", identityUrl)
      console.error("DEBUG: Client ID length:", this.config.clientId.length)
      console.error("DEBUG: Client Secret length:", this.config.clientSecret.length)
    }

    const response = await fetch(identityUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    })

    if (!response.ok) {
      const error = await response.text()
      if (process.env.DEBUG_AUTH) {
        console.error('DEBUG: Auth failed. Response status:', response.status)
        console.error('DEBUG: Error:', error)
      }
      throw new Error(`Failed to obtain access token: ${error}`)
    }

    const data = (await response.json()) as TokenResponse
    this.accessToken = data.access_token
    this.tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000)

    return this.accessToken
  }

  private getHeaders(token: string, folderId?: number): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    }
    if (folderId !== undefined) {
      headers["X-UIPATH-OrganizationUnitId"] = String(folderId)
    }
    return headers
  }

  private async request<T>(
    method: string,
    endpoint: string,
    params?: Record<string, string>,
    body?: unknown,
    folderId?: number
  ): Promise<T> {
    const token = await this.ensureToken()
    const headers = this.getHeaders(token, folderId)

    let url = `${this.baseUrl}${endpoint}`
    if (params) {
      const searchParams = new URLSearchParams(params)
      const query = searchParams.toString().replace(/\+/g, "%20")
      url += `?${query}`
    }

    const options: RequestInit = {
      method,
      headers,
    }

    if (body) {
      options.body = JSON.stringify(body)
    }

    const response = await fetch(url, options)

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`API request failed (${response.status}): ${error}`)
    }

    return response.json() as T
  }

  // ============ Queue Operations ============

  /**
   * List all queue definitions in the given folder.
   * @param folderId - Folder to scope the request to. Falls back to defaultFolderId.
   * @returns Array of queue definitions.
   */
  async getQueueDefinitions(folderId?: number): Promise<QueueDefinition[]> {
    const effectiveFolderId = this.getFolderId(folderId)
    const data = await this.request<ODataResponse<QueueDefinition>>(
      "GET",
      "/odata/QueueDefinitions",
      undefined,
      undefined,
      effectiveFolderId
    )
    return data.value
  }

  /**
   * Find a single queue definition by its exact name.
   * @param name - Queue name to search for.
   * @param folderId - Optional folder scope.
   * @returns The matching queue definition, or null if not found.
   */
  async getQueueDefinitionByName(name: string, folderId?: number): Promise<QueueDefinition | null> {
    const effectiveFolderId = this.getFolderId(folderId)
    const data = await this.request<ODataResponse<QueueDefinition>>(
      "GET",
      "/odata/QueueDefinitions",
      { $filter: `Name eq '${encodeURIComponent(name)}'` },
      undefined,
      effectiveFolderId
    )
    return data.value[0] || null
  }

  /**
   * Query queue items with optional filters for queue, status, and pagination.
   * Falls back to a simpler OData query if the server rejects $count or $orderby.
   * @param options.queueId - Filter by queue definition ID.
   * @param options.status - Filter by item status (New, InProgress, Successful, Failed, Abandoned, Retried).
   * @param options.folderId - Folder scope.
   * @param options.top - Maximum items to return (default 100).
   * @param options.skip - Items to skip for pagination.
   * @param options.orderBy - OData $orderby expression.
   * @returns Items array and total count (null when server does not support $count).
   */
  async getQueueItems(options: {
    queueId?: number
    status?: QueueItemStatus
    folderId?: number
    top?: number
    skip?: number
    orderBy?: string
  } = {}): Promise<{ items: QueueItem[]; count: number | null }> {
    const effectiveFolderId = this.getFolderId(options.folderId)
    const buildParams = (includeCount: boolean, orderBy?: string) => {
      const params: Record<string, string> = {
        $top: String(options.top || 100),
        $skip: String(options.skip || 0),
      }
      if (orderBy) {
        params.$orderby = orderBy
      }
      if (includeCount) {
        params.$count = "true"
      }

      const filters: string[] = []
      if (options.queueId !== undefined) {
        filters.push(`QueueDefinitionId eq ${options.queueId}`)
      }
      if (options.status) {
        filters.push(`Status eq '${options.status}'`)
      }
      if (filters.length > 0) {
        params.$filter = filters.join(" and ")
      }
      return params
    }

    let data: ODataResponse<QueueItem>
    try {
      data = await this.request<ODataResponse<QueueItem>>(
        "GET",
        "/odata/QueueItems",
        buildParams(true, options.orderBy || "CreationTime desc"),
        undefined,
        effectiveFolderId
      )
    } catch (error) {
      if (error instanceof Error && error.message.includes("Invalid OData query options")) {
        data = await this.request<ODataResponse<QueueItem>>(
          "GET",
          "/odata/QueueItems",
          buildParams(false, undefined),
          undefined,
          effectiveFolderId
        )
      } else {
        throw error
      }
    }
    return {
      items: data.value,
      count: data["@odata.count"] ?? null,
    }
  }

  /**
   * Add a new transaction item to a queue.
   * @param queueName - Name of the target queue.
   * @param specificContent - Business data for the item (key-value pairs).
   * @param options.reference - Optional unique reference string for tracking.
   * @param options.priority - Low, Normal (default), or High.
   * @param options.deferDate - Earliest processing time (ISO 8601).
   * @param options.dueDate - Deadline for processing (ISO 8601).
   * @param options.folderId - Folder scope.
   * @returns The created queue item.
   */
  async addQueueItem(
    queueName: string,
    specificContent: Record<string, unknown>,
    options: {
      reference?: string
      priority?: "Low" | "Normal" | "High"
      deferDate?: string
      dueDate?: string
      folderId?: number
    } = {}
  ): Promise<QueueItem> {
    const effectiveFolderId = this.getFolderId(options.folderId)
    const request: AddQueueItemRequest = {
      itemData: {
        Name: queueName,
        SpecificContent: specificContent,
        Priority: options.priority || "Normal",
        Reference: options.reference,
        DeferDate: options.deferDate,
        DueDate: options.dueDate,
      },
    }

    return this.request<QueueItem>(
      "POST",
      "/odata/Queues/UiPathODataSvc.AddQueueItem",
      undefined,
      request,
      effectiveFolderId
    )
  }

  /**
   * Compute statistics for a single queue by counting items in each status.
   * Issues one count query per status (New, InProgress, Successful, Failed, Abandoned).
   * @param queueId - Queue definition ID.
   * @param queueName - Queue name (included in the returned stats object).
   * @param folderId - Folder scope.
   * @returns Counts per status, total items, and success rate percentage.
   */
  async getQueueStats(queueId: number, queueName: string, folderId?: number): Promise<QueueStats> {
    const effectiveFolderId = this.getFolderId(folderId)
    const stats: QueueStats = {
      queueId,
      queueName,
      totalItems: 0,
      newItems: 0,
      inProgressItems: 0,
      successfulItems: 0,
      failedItems: 0,
      abandonedItems: 0,
      successRate: null,
    }

    const statuses: QueueItemStatus[] = [
      "New",
      "InProgress",
      "Successful",
      "Failed",
      "Abandoned",
    ]

    for (const status of statuses) {
      const { count } = await this.getQueueItems({
        queueId,
        status,
        folderId: effectiveFolderId,
        top: 1,
      })
      const itemCount = count || 0
      stats.totalItems += itemCount

      switch (status) {
        case "New":
          stats.newItems = itemCount
          break
        case "InProgress":
          stats.inProgressItems = itemCount
          break
        case "Successful":
          stats.successfulItems = itemCount
          break
        case "Failed":
          stats.failedItems = itemCount
          break
        case "Abandoned":
          stats.abandonedItems = itemCount
          break
      }
    }

    const completed = stats.successfulItems + stats.failedItems
    if (completed > 0) {
      stats.successRate = (stats.successfulItems / completed) * 100
    }

    return stats
  }

  // ============ Folder / Robot / Machine / Asset / Log Operations ============

  /**
   * List Orchestrator folders with pagination.
   * @param options.top - Maximum folders to return (default 100).
   * @param options.skip - Items to skip.
   * @param options.orderBy - OData $orderby expression (default DisplayName asc).
   * @returns Folders array and total count.
   */
  async getFolders(options: {
    top?: number
    skip?: number
    orderBy?: string
  } = {}): Promise<{ folders: Folder[]; count: number | null }> {
    const params: Record<string, string> = {
      $top: String(options.top || 100),
      $skip: String(options.skip || 0),
      $orderby: options.orderBy || "DisplayName asc",
      $count: "true",
    }

    const data = await this.request<ODataResponse<Folder>>("GET", "/odata/Folders", params)
    return {
      folders: data.value,
      count: data["@odata.count"] ?? null,
    }
  }

  /**
   * List robots, optionally filtered by folder.
   * When a folderId is provided the folder-specific endpoint is used.
   * @param options.folderId - Restrict to robots in this folder.
   * @param options.top - Max items (default 100).
   * @param options.skip - Pagination offset.
   * @returns Robots array and total count.
   */
  async getRobots(options: {
    folderId?: number
    top?: number
    skip?: number
    orderBy?: string
  } = {}): Promise<{ robots: Robot[]; count: number | null }> {
    const effectiveFolderId = this.getFolderId(options.folderId)
    const params: Record<string, string> = {
      $top: String(options.top || 100),
      $skip: String(options.skip || 0),
      $orderby: options.orderBy || "Name asc",
      $count: "true",
    }

    const endpoint = effectiveFolderId
      ? `/odata/Robots/UiPath.Server.Configuration.OData.GetRobotsFromFolder(folderId=${effectiveFolderId})`
      : "/odata/Robots"

    const data = await this.request<ODataResponse<Robot>>("GET", endpoint, params)
    return {
      robots: data.value,
      count: data["@odata.count"] ?? null,
    }
  }

  /**
   * List all registered machines.
   * @param options.top - Max items (default 100).
   * @param options.skip - Pagination offset.
   * @returns Machines array and total count.
   */
  async getMachines(options: {
    top?: number
    skip?: number
    orderBy?: string
  } = {}): Promise<{ machines: Machine[]; count: number | null }> {
    const params: Record<string, string> = {
      $top: String(options.top || 100),
      $skip: String(options.skip || 0),
      $orderby: options.orderBy || "Name asc",
      $count: "true",
    }

    const data = await this.request<ODataResponse<Machine>>(
      "GET",
      "/odata/Machines",
      params
    )
    return {
      machines: data.value,
      count: data["@odata.count"] ?? null,
    }
  }

  /**
   * Get the value of an asset scoped to a specific robot.
   * @param robotId - Robot ID.
   * @param assetName - Asset name.
   * @returns The resolved asset value.
   */
  async getRobotAsset(robotId: number, assetName: string): Promise<AssetValue> {
    const encodedName = encodeURIComponent(assetName)
    const endpoint = `/odata/Assets/UiPath.Server.Configuration.OData.GetRobotAssetByRobotId(robotId=${robotId},assetName='${encodedName}')`
    return this.request<AssetValue>("GET", endpoint)
  }

  /**
   * Query robot execution logs with optional filters.
   * @param options.folderId - Folder scope.
   * @param options.jobKey - Filter logs for a specific job.
   * @param options.startTime - Only logs after this time (ISO 8601).
   * @param options.endTime - Only logs before this time (ISO 8601).
   * @param options.level - Log level filter (Info, Warn, Error, etc.).
   * @param options.top - Max items (default 100).
   * @param options.skip - Pagination offset.
   * @returns Logs array and total count.
   */
  async getRobotLogs(options: {
    folderId?: number
    jobKey?: string
    startTime?: string
    endTime?: string
    level?: string
    top?: number
    skip?: number
    orderBy?: string
  } = {}): Promise<{ logs: RobotLog[]; count: number | null }> {
    const effectiveFolderId = this.getFolderId(options.folderId)
    const params: Record<string, string> = {
      $top: String(options.top || 100),
      $skip: String(options.skip || 0),
      $orderby: options.orderBy || "TimeStamp desc",
      $count: "true",
    }

    const filters: string[] = []
    if (options.jobKey) {
      filters.push(`JobKey eq '${encodeURIComponent(options.jobKey)}'`)
    }
    if (options.level) {
      filters.push(`Level eq '${encodeURIComponent(options.level)}'`)
    }
    if (options.startTime) {
      filters.push(`TimeStamp ge ${options.startTime}`)
    }
    if (options.endTime) {
      filters.push(`TimeStamp le ${options.endTime}`)
    }
    if (filters.length > 0) {
      params.$filter = filters.join(" and ")
    }

    const data = await this.request<ODataResponse<RobotLog>>(
      "GET",
      "/odata/RobotLogs",
      params,
      undefined,
      effectiveFolderId
    )
    return {
      logs: data.value,
      count: data["@odata.count"] ?? null,
    }
  }

  // ============ Session Operations ============

  /**
   * List active robot sessions showing connection state.
   * @param options.folderId - Folder scope.
   * @param options.state - Filter by state (Available, Busy, Disconnected).
   * @param options.top - Max items (default 100).
   * @param options.skip - Pagination offset.
   * @returns Sessions array and total count.
   */
  async getSessions(options: {
    folderId?: number
    state?: string
    top?: number
    skip?: number
  } = {}): Promise<{ sessions: Session[]; count: number | null }> {
    const effectiveFolderId = this.getFolderId(options.folderId)
    const params: Record<string, string> = {
      $top: String(options.top || 100),
      $skip: String(options.skip || 0),
    }

    const filters: string[] = []
    if (options.state) {
      filters.push(`State eq '${options.state}'`)
    }
    if (filters.length > 0) {
      params.$filter = filters.join(" and ")
    }

    try {
      params.$count = "true"
      const data = await this.request<ODataResponse<Session>>(
        "GET",
        "/odata/Sessions",
        params,
        undefined,
        effectiveFolderId
      )
      return { sessions: data.value, count: data["@odata.count"] ?? null }
    } catch (error) {
      if (error instanceof Error && error.message.includes("Invalid OData")) {
        delete params.$count
        const data = await this.request<ODataResponse<Session>>(
          "GET",
          "/odata/Sessions",
          params,
          undefined,
          effectiveFolderId
        )
        return { sessions: data.value, count: data.value.length }
      }
      throw error
    }
  }

  // ============ Asset Operations ============

  /**
   * List all assets in a folder. Assets store configuration values,
   * credentials, and other data consumed by automations.
   * @param options.folderId - Folder scope.
   * @param options.top - Max items (default 100).
   * @param options.skip - Pagination offset.
   * @returns Assets array and total count.
   */
  async getAssets(options: {
    folderId?: number
    top?: number
    skip?: number
  } = {}): Promise<{ assets: Asset[]; count: number | null }> {
    const effectiveFolderId = this.getFolderId(options.folderId)
    const params: Record<string, string> = {
      $top: String(options.top || 100),
      $skip: String(options.skip || 0),
      $orderby: "Name asc",
    }

    try {
      params.$count = "true"
      const data = await this.request<ODataResponse<Asset>>(
        "GET",
        "/odata/Assets",
        params,
        undefined,
        effectiveFolderId
      )
      return { assets: data.value, count: data["@odata.count"] ?? null }
    } catch (error) {
      if (error instanceof Error && error.message.includes("Invalid OData")) {
        delete params.$count
        const data = await this.request<ODataResponse<Asset>>(
          "GET",
          "/odata/Assets",
          params,
          undefined,
          effectiveFolderId
        )
        return { assets: data.value, count: data.value.length }
      }
      throw error
    }
  }

  // ============ Schedule Operations ============

  /**
   * List process schedules (triggers). Each schedule contains a cron
   * expression and next execution time.
   * @param options.folderId - Folder scope.
   * @param options.enabled - Filter by enabled/disabled.
   * @param options.top - Max items (default 100).
   * @param options.skip - Pagination offset.
   * @returns Schedules array and total count.
   */
  async getProcessSchedules(options: {
    folderId?: number
    enabled?: boolean
    top?: number
    skip?: number
  } = {}): Promise<{ schedules: ProcessSchedule[]; count: number | null }> {
    const effectiveFolderId = this.getFolderId(options.folderId)
    const params: Record<string, string> = {
      $top: String(options.top || 100),
      $skip: String(options.skip || 0),
    }

    const filters: string[] = []
    if (options.enabled !== undefined) {
      filters.push(`Enabled eq ${options.enabled}`)
    }
    if (filters.length > 0) {
      params.$filter = filters.join(" and ")
    }

    try {
      params.$count = "true"
      const data = await this.request<ODataResponse<ProcessSchedule>>(
        "GET",
        "/odata/ProcessSchedules",
        params,
        undefined,
        effectiveFolderId
      )
      return { schedules: data.value, count: data["@odata.count"] ?? null }
    } catch (error) {
      if (error instanceof Error && error.message.includes("Invalid OData")) {
        delete params.$count
        const data = await this.request<ODataResponse<ProcessSchedule>>(
          "GET",
          "/odata/ProcessSchedules",
          params,
          undefined,
          effectiveFolderId
        )
        return { schedules: data.value, count: data.value.length }
      }
      throw error
    }
  }

  // ============ Audit Log Operations ============

  /**
   * Query the audit trail. Records who performed which action and when.
   * @param options.action - Filter by action type (Create, Update, Delete, etc.).
   * @param options.userName - Filter by user name.
   * @param options.component - Filter by component (Jobs, Queues, Robots, etc.).
   * @param options.startTime - Only entries after this time (ISO 8601).
   * @param options.endTime - Only entries before this time (ISO 8601).
   * @param options.top - Max items (default 100).
   * @param options.skip - Pagination offset.
   * @returns Logs array and total count.
   */
  async getAuditLogs(options: {
    action?: string
    userName?: string
    component?: string
    startTime?: string
    endTime?: string
    top?: number
    skip?: number
  } = {}): Promise<{ logs: AuditLog[]; count: number | null }> {
    const params: Record<string, string> = {
      $top: String(options.top || 100),
      $skip: String(options.skip || 0),
      $orderby: "ExecutionTime desc",
    }

    const filters: string[] = []
    if (options.action) {
      filters.push(`Action eq '${this.escapeODataString(options.action)}'`)
    }
    if (options.userName) {
      filters.push(`UserName eq '${this.escapeODataString(options.userName)}'`)
    }
    if (options.component) {
      filters.push(`Component eq '${this.escapeODataString(options.component)}'`)
    }
    if (options.startTime) {
      filters.push(`ExecutionTime ge ${options.startTime}`)
    }
    if (options.endTime) {
      filters.push(`ExecutionTime le ${options.endTime}`)
    }
    if (filters.length > 0) {
      params.$filter = filters.join(" and ")
    }

    try {
      params.$count = "true"
      const data = await this.request<ODataResponse<AuditLog>>(
        "GET",
        "/odata/AuditLogs",
        params
      )
      return { logs: data.value, count: data["@odata.count"] ?? null }
    } catch (error) {
      if (error instanceof Error && error.message.includes("Invalid OData")) {
        delete params.$count
        delete params.$orderby
        const data = await this.request<ODataResponse<AuditLog>>(
          "GET",
          "/odata/AuditLogs",
          params
        )
        return { logs: data.value, count: data.value.length }
      }
      throw error
    }
  }

  // ============ Job Operations ============

  /**
   * List jobs with optional state and process filters.
   * Falls back to a simpler OData query if the server rejects $count or $orderby.
   * @param options.state - Filter by job state (Pending, Running, Successful, Faulted, Stopped, Terminated).
   * @param options.releaseName - Filter by process/release name.
   * @param options.folderId - Folder scope.
   * @param options.top - Max items (default 100).
   * @param options.skip - Pagination offset.
   * @returns Jobs array and total count.
   */
  async getJobs(options: {
    state?: JobState
    releaseName?: string
    folderId?: number
    top?: number
    skip?: number
    orderBy?: string
  } = {}): Promise<{ jobs: Job[]; count: number | null }> {
    const effectiveFolderId = this.getFolderId(options.folderId)
    const buildParams = (includeCount: boolean, orderBy?: string) => {
      const params: Record<string, string> = {
        $top: String(options.top || 100),
        $skip: String(options.skip || 0),
      }
      if (orderBy) {
        params.$orderby = orderBy
      }
      if (includeCount) {
        params.$count = "true"
      }

      const filters: string[] = []
      if (options.state) {
        filters.push(`State eq '${options.state}'`)
      }
      if (options.releaseName) {
        filters.push(`ReleaseName eq '${encodeURIComponent(options.releaseName)}'`)
      }
      if (filters.length > 0) {
        params.$filter = filters.join(" and ")
      }
      return params
    }

    let data: ODataResponse<Job>
    try {
      data = await this.request<ODataResponse<Job>>(
        "GET",
        "/odata/Jobs",
        buildParams(true, options.orderBy || "CreationTime desc"),
        undefined,
        effectiveFolderId
      )
    } catch (error) {
      if (error instanceof Error && error.message.includes("Invalid OData query options")) {
        data = await this.request<ODataResponse<Job>>(
          "GET",
          "/odata/Jobs",
          buildParams(false, undefined),
          undefined,
          effectiveFolderId
        )
      } else {
        throw error
      }
    }
    return {
      jobs: data.value,
      count: data["@odata.count"] ?? null,
    }
  }

  /**
   * Get full details for a single job by its numeric ID.
   * @param jobId - The job ID.
   * @param folderId - Folder scope.
   * @returns The job record.
   */
  async getJobById(jobId: number, folderId?: number): Promise<Job> {
    const effectiveFolderId = this.getFolderId(folderId)
    return this.request<Job>("GET", `/odata/Jobs(${jobId})`, undefined, undefined, effectiveFolderId)
  }

  /**
   * Start one or more jobs for a release.
   * @param releaseKey - The release key identifying the process to run.
   * @param options.inputArguments - Key-value input arguments passed to the process.
   * @param options.jobsCount - Number of jobs to create (default 1).
   * @param options.strategy - Allocation strategy (default ModernJobsCount).
   * @param options.folderId - Folder scope.
   * @returns Array of created job records.
   */
  async startJob(
    releaseKey: string,
    options: {
      inputArguments?: Record<string, unknown>
      jobsCount?: number
      strategy?: "ModernJobsCount" | "Specific" | "JobsCount"
      folderId?: number
    } = {}
  ): Promise<Job[]> {
    const effectiveFolderId = this.getFolderId(options.folderId)
    const request: StartJobRequest = {
      startInfo: {
        ReleaseKey: releaseKey,
        Strategy: options.strategy || "ModernJobsCount",
        JobsCount: options.jobsCount || 1,
      },
    }

    if (options.inputArguments) {
      request.startInfo.InputArguments = JSON.stringify(options.inputArguments)
    }

    const data = await this.request<ODataResponse<Job>>(
      "POST",
      "/odata/Jobs/UiPath.Server.Configuration.OData.StartJobs",
      undefined,
      request,
      effectiveFolderId
    )
    return data.value
  }

  /**
   * Request a running job to stop.
   * @param jobId - ID of the job to stop.
   * @param strategy - SoftStop (graceful) or Kill (immediate). Default SoftStop.
   * @param folderId - Folder scope.
   */
  async stopJob(jobId: number, strategy: "SoftStop" | "Kill" = "SoftStop", folderId?: number): Promise<void> {
    const effectiveFolderId = this.getFolderId(folderId)
    const request: StopJobRequest = { strategy }
    await this.request<void>(
      "POST",
      `/odata/Jobs(${jobId})/UiPath.Server.Configuration.OData.StopJob`,
      undefined,
      request,
      effectiveFolderId
    )
  }

  /**
   * Compute aggregate job statistics by counting jobs in each state.
   * Tries per-state $count queries first; if unsupported, fetches up to
   * 1000 jobs and counts locally.
   * @param folderId - Folder scope.
   * @returns Counts per state, total jobs, and success rate percentage.
   */
  async getJobStats(folderId?: number): Promise<JobStats> {
    const effectiveFolderId = this.getFolderId(folderId)
    const stats: JobStats = {
      totalJobs: 0,
      pendingJobs: 0,
      runningJobs: 0,
      successfulJobs: 0,
      faultedJobs: 0,
      stoppedJobs: 0,
      successRate: null,
    }

    // Strategy: try per-state count queries first, fall back to fetching all jobs
    let useFallback = false

    const states: JobState[] = [
      "Pending",
      "Running",
      "Successful",
      "Faulted",
      "Stopped",
      "Terminated",
    ]

    try {
      for (const state of states) {
        const { count } = await this.getJobs({ state, top: 1, folderId: effectiveFolderId })
        // If count came back as null, the OData $count isn't supported; use fallback
        if (count === null) {
          useFallback = true
          break
        }
        stats.totalJobs += count

        switch (state) {
          case "Pending":
            stats.pendingJobs = count
            break
          case "Running":
            stats.runningJobs = count
            break
          case "Successful":
            stats.successfulJobs = count
            break
          case "Faulted":
            stats.faultedJobs = count
            break
          case "Stopped":
          case "Terminated":
            stats.stoppedJobs += count
            break
        }
      }
    } catch {
      useFallback = true
    }

    if (useFallback) {
      // Reset and count from actual job records
      stats.totalJobs = 0
      stats.pendingJobs = 0
      stats.runningJobs = 0
      stats.successfulJobs = 0
      stats.faultedJobs = 0
      stats.stoppedJobs = 0

      const { jobs } = await this.getJobs({ top: 1000, folderId: effectiveFolderId })
      stats.totalJobs = jobs.length

      for (const job of jobs) {
        switch (job.State) {
          case "Pending":
            stats.pendingJobs += 1
            break
          case "Running":
            stats.runningJobs += 1
            break
          case "Successful":
            stats.successfulJobs += 1
            break
          case "Faulted":
            stats.faultedJobs += 1
            break
          case "Stopped":
          case "Terminated":
            stats.stoppedJobs += 1
            break
        }
      }
    }

    const completed = stats.successfulJobs + stats.faultedJobs
    if (completed > 0) {
      stats.successRate = (stats.successfulJobs / completed) * 100
    }

    return stats
  }

  // ============ Release Operations ============

  /**
   * List available releases (published processes).
   * @param processKey - Optional process key filter.
   * @param folderId - Folder scope.
   * @returns Array of release records.
   */
  async getReleases(processKey?: string, folderId?: number): Promise<Release[]> {
    const effectiveFolderId = this.getFolderId(folderId)
    const params: Record<string, string> = {}
    if (processKey) {
      params.$filter = `ProcessKey eq '${encodeURIComponent(processKey)}'`
    }

    const data = await this.request<ODataResponse<Release>>(
      "GET",
      "/odata/Releases",
      params,
      undefined,
      effectiveFolderId
    )
    return data.value
  }

  /**
   * Find a release by process key or exact name. Tries key first, then name.
   * @param nameOrKey - Process key or release name.
   * @param folderId - Folder scope.
   * @returns The matching release, or null if not found.
   */
  async findReleaseByNameOrKey(nameOrKey: string, folderId?: number): Promise<Release | null> {
    const effectiveFolderId = this.getFolderId(folderId)
    const releasesByKey = await this.getReleases(nameOrKey, effectiveFolderId)
    if (releasesByKey.length > 0) {
      return releasesByKey[0]
    }

    const params = {
      $filter: `Name eq '${this.escapeODataString(nameOrKey)}'`,
    }
    const data = await this.request<ODataResponse<Release>>(
      "GET",
      "/odata/Releases",
      params,
      undefined,
      effectiveFolderId
    )
    return data.value[0] || null
  }

  // ============ Dashboard ============

  /**
   * Build a composite dashboard summary combining queue and job statistics.
   * Aggregates stats for up to the first 5 queues and all job states.
   * @param folderId - Folder scope.
   * @returns Queue totals, job counts by state, active jobs, and success rates.
   */
  async getDashboardSummary(folderId?: number): Promise<{
    totalQueues: number
    totalQueueItems: number
    queueItemsByStatus: Record<string, number>
    totalJobs: number
    jobsByState: Record<string, number>
    activeJobs: number
    successRateJobs: number | null
    successRateQueues: number | null
  }> {
    const effectiveFolderId = this.getFolderId(folderId)
    const queues = await this.getQueueDefinitions(effectiveFolderId)
    const jobStats = await this.getJobStats(effectiveFolderId)

    let totalQueueItems = 0
    const queueItemsByStatus: Record<string, number> = {
      New: 0,
      InProgress: 0,
      Successful: 0,
      Failed: 0,
    }

    // Get stats for first few queues
    for (const queue of queues.slice(0, 5)) {
      const stats = await this.getQueueStats(queue.Id, queue.Name, effectiveFolderId)
      queueItemsByStatus.New += stats.newItems
      queueItemsByStatus.InProgress += stats.inProgressItems
      queueItemsByStatus.Successful += stats.successfulItems
      queueItemsByStatus.Failed += stats.failedItems
      totalQueueItems += stats.totalItems
    }

    const completedItems = queueItemsByStatus.Successful + queueItemsByStatus.Failed
    const successRateQueues =
      completedItems > 0
        ? (queueItemsByStatus.Successful / completedItems) * 100
        : null

    return {
      totalQueues: queues.length,
      totalQueueItems,
      queueItemsByStatus,
      totalJobs: jobStats.totalJobs,
      jobsByState: {
        Pending: jobStats.pendingJobs,
        Running: jobStats.runningJobs,
        Successful: jobStats.successfulJobs,
        Faulted: jobStats.faultedJobs,
        Stopped: jobStats.stoppedJobs,
      },
      activeJobs: jobStats.pendingJobs + jobStats.runningJobs,
      successRateJobs: jobStats.successRate,
      successRateQueues,
    }
  }

  // ============ Composite Analytics ============

  /**
   * Retrieve faulted (failed) jobs with error details and computed durations.
   * @param options.folderId - Folder scope.
   * @param options.top - Max items (default 50).
   * @param options.releaseName - Filter by process/release name.
   * @param options.startTime - Only failures after this time (ISO 8601).
   * @param options.endTime - Only failures before this time (ISO 8601).
   * @returns Array of faulted job summaries including error messages and durations.
   */
  async getFaultedJobs(options: {
    folderId?: number
    top?: number
    releaseName?: string
    startTime?: string
    endTime?: string
  } = {}): Promise<FaultedJobSummary[]> {
    const effectiveFolderId = this.getFolderId(options.folderId)
    const params: Record<string, string> = {
      $top: String(options.top || 50),
      $orderby: "CreationTime desc",
    }

    const filters: string[] = ["State eq 'Faulted'"]
    if (options.releaseName) {
      filters.push(`ReleaseName eq '${this.escapeODataString(options.releaseName)}'`)
    }
    if (options.startTime) {
      filters.push(`CreationTime ge ${options.startTime}`)
    }
    if (options.endTime) {
      filters.push(`CreationTime le ${options.endTime}`)
    }
    params.$filter = filters.join(" and ")

    let jobs: Job[]
    try {
      const data = await this.request<ODataResponse<Job>>(
        "GET",
        "/odata/Jobs",
        params,
        undefined,
        effectiveFolderId
      )
      jobs = data.value
    } catch (error) {
      if (error instanceof Error && error.message.includes("Invalid OData")) {
        delete params.$orderby
        const data = await this.request<ODataResponse<Job>>(
          "GET",
          "/odata/Jobs",
          params,
          undefined,
          effectiveFolderId
        )
        jobs = data.value
      } else {
        throw error
      }
    }

    return jobs.map(job => ({
      Id: job.Id,
      Key: job.Key,
      ReleaseName: job.ReleaseName,
      State: job.State,
      Info: job.Info,
      JobError: job.JobError,
      CreationTime: job.CreationTime,
      StartTime: job.StartTime,
      EndTime: job.EndTime,
      HostMachineName: job.HostMachineName,
      durationSeconds: this.computeDuration(job.StartTime, job.EndTime),
    }))
  }

  /**
   * Analyze execution performance for a specific process/release.
   * Computes success rate, average/min/max durations from recent jobs.
   * @param processName - Release name to analyze.
   * @param options.folderId - Folder scope.
   * @param options.top - Number of recent executions to consider (default 100).
   * @returns Performance metrics and the 10 most recent job records.
   */
  async getProcessPerformance(
    processName: string,
    options: {
      folderId?: number
      top?: number
    } = {}
  ): Promise<ProcessPerformance> {
    const effectiveFolderId = this.getFolderId(options.folderId)
    const { jobs } = await this.getJobs({
      releaseName: processName,
      folderId: effectiveFolderId,
      top: options.top || 100,
    })

    const successful = jobs.filter(j => j.State === "Successful")
    const faulted = jobs.filter(j => j.State === "Faulted")
    const stopped = jobs.filter(j => j.State === "Stopped" || j.State === "Terminated")
    const running = jobs.filter(j => j.State === "Running")
    const pending = jobs.filter(j => j.State === "Pending")

    const durations = successful
      .map(j => this.computeDuration(j.StartTime, j.EndTime))
      .filter((d): d is number => d !== null)

    const completed = successful.length + faulted.length
    const successRate = completed > 0 ? (successful.length / completed) * 100 : null

    return {
      processName,
      totalExecutions: jobs.length,
      successful: successful.length,
      faulted: faulted.length,
      stopped: stopped.length,
      running: running.length,
      pending: pending.length,
      successRate,
      avgDurationSeconds: durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null,
      minDurationSeconds: durations.length > 0 ? Math.min(...durations) : null,
      maxDurationSeconds: durations.length > 0 ? Math.max(...durations) : null,
      recentJobs: jobs.slice(0, 10),
    }
  }

  /**
   * Build a health overview for a folder: job counts by state, queue count,
   * release count, and robot count. Runs queries in parallel.
   * @param folderId - Folder to inspect.
   * @returns Folder name, job breakdown, and entity counts.
   */
  async getFolderOverview(folderId: number): Promise<FolderOverview> {
    const { folders } = await this.getFolders({ top: 1000 })
    const folder = folders.find(f => f.Id === folderId)
    const folderName = folder?.DisplayName || `Folder ${folderId}`

    const [jobsResult, queues, releases, robotsResult] = await Promise.all([
      this.getJobs({ folderId, top: 1000 }).catch(() => ({ jobs: [] as Job[], count: 0 })),
      this.getQueueDefinitions(folderId).catch(() => [] as QueueDefinition[]),
      this.getReleases(undefined, folderId).catch(() => [] as Release[]),
      this.getRobots({ folderId, top: 100 }).catch(() => ({ robots: [] as Robot[], count: 0 })),
    ])

    const jobCounts: Record<string, number> = {
      Pending: 0,
      Running: 0,
      Successful: 0,
      Faulted: 0,
      Stopped: 0,
    }
    for (const job of jobsResult.jobs) {
      const state = job.State
      if (state in jobCounts) {
        jobCounts[state] += 1
      } else if (state === "Terminated") {
        jobCounts.Stopped += 1
      }
    }

    return {
      folderId,
      folderName,
      jobCounts,
      totalJobs: jobsResult.jobs.length,
      queueCount: queues.length,
      releaseCount: releases.length,
      robotCount: robotsResult.robots.length,
    }
  }

  // ============ Licensing & Stats Operations ============

  /**
   * Get consumption (platform-unit) license usage statistics over time.
   * Requires License.View permission.
   * @param options.tenantId - Tenant ID when authenticated as Host.
   * @param options.days - Number of days of usage history.
   * @returns Array of consumption license stat records.
   */
  async getConsumptionLicenseStats(options: { tenantId?: number; days?: number } = {}): Promise<ConsumptionLicenseStatsModel[]> {
    const params: Record<string, string> = {}
    if (options.tenantId !== undefined) {
      params.tenantId = String(options.tenantId)
    }
    if (options.days !== undefined) {
      params.days = String(options.days)
    }
    return this.request<ConsumptionLicenseStatsModel[]>("GET", "/api/Stats/GetConsumptionLicenseStats", params)
  }

  /**
   * Get traditional license usage statistics (robot counts by type over time).
   * Requires License.View permission.
   * @param options.tenantId - Tenant ID when authenticated as Host.
   * @param options.days - Number of days of usage history.
   * @returns Array of license stat records.
   */
  async getLicenseStats(options: { tenantId?: number; days?: number } = {}): Promise<LicenseStatsModel[]> {
    const params: Record<string, string> = {}
    if (options.tenantId !== undefined) {
      params.tenantId = String(options.tenantId)
    }
    if (options.days !== undefined) {
      params.days = String(options.days)
    }
    return this.request<LicenseStatsModel[]>("GET", "/api/Stats/GetLicenseStats", params)
  }

  /**
   * Get runtime license details for a specific robot type.
   * Shows machine assignments, runtimes, and online status.
   * @param robotType - Robot type to filter by (e.g. Unattended, Attended).
   * @returns OData response with runtime license records.
   */
  async getLicensesRuntime(robotType: RobotType): Promise<ODataResponse<LicenseRuntimeDto>> {
    const encodedRobotType = encodeURIComponent(robotType)
    return this.request<ODataResponse<LicenseRuntimeDto>>(
      "GET",
      `/odata/LicensesRuntime/UiPath.Server.Configuration.OData.GetLicensesRuntime(robotType='${encodedRobotType}')`
    )
  }

  /**
   * Get named-user license details for a specific robot type.
   * Shows user assignments, last login dates, and machine associations.
   * @param robotType - Robot type to filter by.
   * @returns OData response with named-user license records.
   */
  async getLicensesNamedUser(robotType: RobotType): Promise<ODataResponse<LicenseNamedUserDto>> {
    const encodedRobotType = encodeURIComponent(robotType)
    return this.request<ODataResponse<LicenseNamedUserDto>>(
      "GET",
      `/odata/LicensesNamedUser/UiPath.Server.Configuration.OData.GetLicensesNamedUser(robotType='${encodedRobotType}')`
    )
  }

  /**
   * Get total counts of key Orchestrator entities (Processes, Assets, Queues, Schedules).
   * @returns Array of entity count records.
   */
  async getCountStats(): Promise<CountStats[]> {
    return this.request<CountStats[]>("GET", "/api/Stats/GetCountStats")
  }

  /**
   * Get robot counts aggregated by session state (Available, Busy, Disconnected, Unresponsive).
   * @returns Array of state count records.
   */
  async getSessionsStats(): Promise<CountStats[]> {
    return this.request<CountStats[]>("GET", "/api/Stats/GetSessionsStats")
  }

  private computeDuration(startTime: string | null, endTime: string | null): number | null {
    if (!startTime || !endTime) return null
    const start = new Date(startTime).getTime()
    const end = new Date(endTime).getTime()
    if (isNaN(start) || isNaN(end)) return null
    return Math.round((end - start) / 1000)
  }
}


