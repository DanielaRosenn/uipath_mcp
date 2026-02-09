// UiPath API Types

export interface UiPathConfig {
  baseUrl: string
  tenantName: string
  clientId: string
  clientSecret: string
  defaultFolderId?: number
  disableSslVerify?: boolean
}

export interface TokenResponse {
  access_token: string
  expires_in: number
  token_type: string
  scope: string
}

export interface ODataResponse<T> {
  "@odata.context"?: string
  "@odata.count"?: number
  value: T[]
}

// Folder / Robot / Machine / Asset / Log Types
export interface Folder {
  Id: number
  DisplayName: string
  FullyQualifiedName: string | null
  ParentId: number | null
  Description: string | null
  IsPersonal: boolean
  ProvisionType: string | null
  CreationTime: string
}

export interface Robot {
  Id: number
  Name: string
  Type: string
  Username: string | null
  MachineName: string | null
  MachineId: number | null
  HostingType: string | null
  IsEnabled: boolean
  Version: string | null
}

export interface Machine {
  Id: number
  Name: string
  Type: string | null
  IsOnline: boolean | null
  Description: string | null
  Key: string | null
  LicenseKey: string | null
  Version: string | null
}

export interface AssetValue {
  Id: number
  Name: string
  ValueType: string
  StringValue: string | null
  BoolValue: boolean | null
  IntValue: number | null
  Sensitive: boolean
  Description: string | null
}

export interface RobotLog {
  Id: number
  TimeStamp: string
  Level: string
  Message: string
  ProcessName: string | null
  JobKey: string | null
  RobotName: string | null
  MachineName: string | null
}

// Queue Types
export interface QueueDefinition {
  Id: number
  Name: string
  Description: string | null
  MaxNumberOfRetries: number
  AcceptAutomaticallyRetry: boolean
  EnforceUniqueReference: boolean
  CreationTime: string
  SpecificDataJsonSchema?: string
}

export type QueueItemStatus = 
  | "New" 
  | "InProgress" 
  | "Successful" 
  | "Failed" 
  | "Abandoned" 
  | "Retried" 
  | "Deleted"

export interface QueueItem {
  Id: number
  QueueDefinitionId: number
  Status: QueueItemStatus
  Reference: string | null
  SpecificContent: Record<string, unknown> | null
  Output: Record<string, unknown> | null
  CreationTime: string
  StartProcessing: string | null
  EndProcessing: string | null
  RetryNumber: number
  Progress: string | null
  Priority: "Low" | "Normal" | "High"
  DeferDate: string | null
  DueDate: string | null
  ExceptionType: string | null
  ExceptionReason: string | null
}

export interface AddQueueItemRequest {
  itemData: {
    Name: string
    Priority?: "Low" | "Normal" | "High"
    SpecificContent: Record<string, unknown>
    Reference?: string
    DeferDate?: string
    DueDate?: string
  }
}

// Job Types
export type JobState = 
  | "Pending" 
  | "Running" 
  | "Successful" 
  | "Faulted" 
  | "Stopping" 
  | "Terminated" 
  | "Stopped" 
  | "Suspended" 
  | "Resumed"

export interface Job {
  Id: number
  Key: string
  State: JobState
  Source: string
  SourceType: string
  BatchExecutionKey: string | null
  Info: string | null
  JobError: string | null
  CreationTime: string
  StartTime: string | null
  EndTime: string | null
  ReleaseName: string
  ReleaseVersionId: number
  HostMachineName: string | null
  InputArguments: string | null
  OutputArguments: string | null
}

export interface StartJobRequest {
  startInfo: {
    ReleaseKey: string
    Strategy: "ModernJobsCount" | "Specific" | "JobsCount"
    JobsCount?: number
    RobotIds?: number[]
    InputArguments?: string
  }
}

export interface StopJobRequest {
  strategy: "SoftStop" | "Kill"
}

// Release Types
export interface Release {
  Key: string
  ProcessKey: string
  ProcessVersion: string
  Name: string
  Description: string | null
  IsLatestVersion: boolean
}

// Session Types
export interface Session {
  Id: number
  MachineId: number | null
  MachineName: string | null
  HostMachineName: string | null
  RobotId: number | null
  RobotName: string | null
  State: "Available" | "Busy" | "Disconnected" | "Unresponsive" | string
  IsUnresponsive: boolean
  ReportingTime: string | null
  ServiceUserName: string | null
  RuntimeType: string | null
  FolderId: number | null
}

// Asset Types
export interface Asset {
  Id: number
  Name: string
  ValueType: "Text" | "Integer" | "Boolean" | "Credential" | "WindowsCredential" | "KeyValueList" | string
  StringValue: string | null
  BoolValue: boolean | null
  IntValue: number | null
  Value: string | null
  ValueScope: "Global" | "PerRobot" | string
  HasDefaultValue: boolean
  Description: string | null
  CanBeDeleted: boolean
  FolderId: number | null
}

// ProcessSchedule Types
export interface ProcessSchedule {
  Id: number
  Name: string
  ReleaseId: number | null
  ReleaseName: string | null
  ReleaseKey: string | null
  StartProcessCron: string | null
  StartProcessCronDetails: string | null
  StartStrategy: number | null
  StopStrategy: string | null
  StopAfterMinutes: number | null
  Enabled: boolean
  TimeZoneId: string | null
  NextExecutionTime: string | null
  CalendarId: number | null
  CalendarName: string | null
  InputArguments: string | null
}

// AuditLog Types
export interface AuditLog {
  Id: number
  ServiceName: string | null
  MethodName: string | null
  Parameters: string | null
  ExecutionTime: string
  UserName: string | null
  Action: string | null
  Component: string | null
  EntityId: number | null
  EntityName: string | null
}

// Licensing & Consumption Types
export interface ConsumptionLicenseStatsModel {
  type: string
  used: number
  total: number
  timestamp: string
}

export interface LicenseStatsModel {
  robotType: string
  count: number
  timestamp: string
}

export interface LicenseNamedUserDto {
  Key: string
  UserName: string
  LastLoginDate: string
  MachinesCount: number
  IsLicensed: boolean
  IsExternalLicensed: boolean
  ActiveRobotId: number
  MachineNames: string[]
  ActiveMachineNames: string[]
}

export interface LicenseRuntimeDto {
  Key: string
  MachineId: number
  MachineName: string
  HostMachineName: string
  ServiceUserName: string
  MachineType: "Standard" | "Template"
  Runtimes: number
  RobotsCount: number
  ExecutingCount: number
  IsOnline: boolean
  IsLicensed: boolean
  Enabled: boolean
  MachineScope: string
}

export interface CountStats {
  title: string
  count: number
  hasPermissions: boolean
}

export type RobotType =
  | "NonProduction"
  | "Attended"
  | "Unattended"
  | "Development"
  | "Studio"
  | "RpaDeveloper"
  | "StudioX"
  | "CitizenDeveloper"
  | "Headless"
  | "StudioPro"
  | "RpaDeveloperPro"
  | "TestAutomation"
  | "AutomationCloud"
  | "Serverless"
  | "AutomationKit"
  | "ServerlessTestAutomation"
  | "AutomationCloudTestAutomation"
  | "AttendedStudioWeb"
  | "Hosting"
  | "AssistantWeb"
  | "ProcessOrchestration"
  | "AgentService"
  | "AppTest"
  | "PerformanceTest"
  | "BusinessRule"
  | "CaseManagement"

// Stats Types
export interface QueueStats {
  queueId: number
  queueName: string
  totalItems: number
  newItems: number
  inProgressItems: number
  successfulItems: number
  failedItems: number
  abandonedItems: number
  successRate: number | null
}

export interface JobStats {
  totalJobs: number
  pendingJobs: number
  runningJobs: number
  successfulJobs: number
  faultedJobs: number
  stoppedJobs: number
  successRate: number | null
}

// Composite Analytics Types
export interface FaultedJobSummary {
  Id: number
  Key: string
  ReleaseName: string
  State: string
  Info: string | null
  JobError: string | null
  CreationTime: string
  StartTime: string | null
  EndTime: string | null
  HostMachineName: string | null
  durationSeconds: number | null
}

export interface ProcessPerformance {
  processName: string
  totalExecutions: number
  successful: number
  faulted: number
  stopped: number
  running: number
  pending: number
  successRate: number | null
  avgDurationSeconds: number | null
  minDurationSeconds: number | null
  maxDurationSeconds: number | null
  recentJobs: Job[]
}

export interface FolderOverview {
  folderId: number
  folderName: string
  jobCounts: Record<string, number>
  totalJobs: number
  queueCount: number
  releaseCount: number
  robotCount: number
}


