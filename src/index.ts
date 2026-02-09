#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"
import express from "express"
import cors from "cors"
import { UiPathClient } from "./uipath-client.js"
import type { UiPathConfig, QueueItemStatus, JobState, RobotType } from "./types.js"

/**
 * Load UiPath configuration from environment variables.
 * Requires UIPATH_URL, UIPATH_CLIENT_ID, and UIPATH_CLIENT_SECRET.
 * @throws {Error} If any required variable is missing.
 */
export function loadConfig(): UiPathConfig {
  const requiredEnvVars = [
    "UIPATH_URL",
    "UIPATH_CLIENT_ID",
    "UIPATH_CLIENT_SECRET",
  ]

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`)
    }
  }

  const folderId = process.env.UIPATH_FOLDER_ID
    ? Number(process.env.UIPATH_FOLDER_ID)
    : undefined

  return {
    baseUrl: process.env.UIPATH_URL!,
    tenantName: process.env.UIPATH_TENANT_NAME || "Default",
    clientId: process.env.UIPATH_CLIENT_ID!,
    clientSecret: process.env.UIPATH_CLIENT_SECRET!,
    defaultFolderId: Number.isFinite(folderId) ? folderId : undefined,
    disableSslVerify: process.env.UIPATH_DISABLE_SSL_VERIFY === "1",
  }
}

/** Zod validation schemas for every MCP tool's input arguments. */
export const schemas = {
  // Folder tools
  getFolders: z.object({
    limit: z.number().optional().default(50).describe("Maximum items to return"),
    skip: z.number().optional().default(0).describe("Number of items to skip"),
  }),

  // Robot tools
  getRobots: z.object({
    folderId: z.number().optional().describe("Optional folder ID filter"),
    limit: z.number().optional().default(50).describe("Maximum items to return"),
    skip: z.number().optional().default(0).describe("Number of items to skip"),
  }),

  // Machine tools
  getMachines: z.object({
    limit: z.number().optional().default(50).describe("Maximum items to return"),
    skip: z.number().optional().default(0).describe("Number of items to skip"),
  }),

  // Asset tools
  getRobotAsset: z.object({
    robotId: z.number().describe("Robot ID"),
    assetName: z.string().describe("Asset name"),
  }),

  // Log tools
  getRobotLogs: z.object({
    folderId: z.number().optional().describe("Folder ID to filter robot logs"),
    jobKey: z.string().optional().describe("Filter by job key"),
    startTime: z.string().optional().describe("Filter by start time (ISO 8601)"),
    endTime: z.string().optional().describe("Filter by end time (ISO 8601)"),
    level: z.string().optional().describe("Filter by log level"),
    limit: z.number().optional().default(100).describe("Maximum items to return"),
    skip: z.number().optional().default(0).describe("Number of items to skip"),
  }),

  // Queue tools
  getQueueDefinitions: z.object({
    folderId: z.number().optional().describe("Folder ID to filter queue definitions"),
  }),
  
  getQueueItems: z.object({
    folderId: z.number().optional().describe("Folder ID to filter queue items"),
    queueName: z.string().optional().describe("Filter by queue name"),
    queueId: z.number().optional().describe("Filter by queue ID"),
    status: z.enum(["New", "InProgress", "Successful", "Failed", "Abandoned", "Retried"]).optional().describe("Filter by status"),
    limit: z.number().optional().default(50).describe("Maximum items to return"),
  }),
  
  addQueueItem: z.object({
    folderId: z.number().optional().describe("Folder ID where the queue exists"),
    queueName: z.string().describe("Name of the queue to add item to"),
    data: z.record(z.unknown()).describe("The specific content/data for the queue item"),
    reference: z.string().optional().describe("Optional unique reference for the item"),
    priority: z.enum(["Low", "Normal", "High"]).optional().default("Normal"),
  }),
  
  getQueueStats: z.object({
    folderId: z.number().optional().describe("Folder ID where the queue exists"),
    queueName: z.string().describe("Name of the queue to get statistics for"),
  }),

  // Job tools
  getJobs: z.object({
    folderId: z.number().optional().describe("Folder ID to filter jobs (required for most operations)"),
    state: z.enum(["Pending", "Running", "Successful", "Faulted", "Stopped", "Terminated"]).optional().describe("Filter by job state"),
    releaseName: z.string().optional().describe("Filter by release/process name"),
    limit: z.number().optional().default(50).describe("Maximum jobs to return"),
  }),
  
  getJobDetails: z.object({
    jobId: z.number().describe("The ID of the job to get details for"),
    folderId: z.number().optional().describe("Folder ID where the job exists"),
  }),
  
  startJob: z.object({
    processName: z.string().describe("Name of the process to start"),
    folderId: z.number().optional().describe("Folder ID where the process exists"),
    inputArguments: z.record(z.unknown()).optional().describe("Input arguments for the job"),
    jobsCount: z.number().optional().default(1).describe("Number of jobs to start"),
  }),
  
  stopJob: z.object({
    jobId: z.number().describe("The ID of the job to stop"),
    folderId: z.number().optional().describe("Folder ID where the job exists"),
    force: z.boolean().optional().default(false).describe("Force kill instead of soft stop"),
  }),
  
  getJobStats: z.object({
    folderId: z.number().optional().describe("Folder ID to get job statistics for"),
  }),

  // Release tools
  getReleases: z.object({
    folderId: z.number().optional().describe("Folder ID to filter releases"),
    processKey: z.string().optional().describe("Filter by process key"),
  }),

  // Dashboard tools
  getDashboardSummary: z.object({
    folderId: z.number().optional().describe("Folder ID to get dashboard summary for"),
  }),

  // Session tools
  getSessions: z.object({
    folderId: z.number().optional().describe("Folder ID to filter sessions"),
    state: z.string().optional().describe("Filter by session state (Available, Busy, Disconnected)"),
    limit: z.number().optional().default(50).describe("Maximum items to return"),
    skip: z.number().optional().default(0).describe("Number of items to skip"),
  }),

  // Asset tools (list all)
  getAssets: z.object({
    folderId: z.number().optional().describe("Folder ID to list assets for"),
    limit: z.number().optional().default(50).describe("Maximum items to return"),
    skip: z.number().optional().default(0).describe("Number of items to skip"),
  }),

  // Schedule tools
  getProcessSchedules: z.object({
    folderId: z.number().optional().describe("Folder ID to filter schedules"),
    enabled: z.boolean().optional().describe("Filter by enabled/disabled status"),
    limit: z.number().optional().default(50).describe("Maximum items to return"),
    skip: z.number().optional().default(0).describe("Number of items to skip"),
  }),

  // Audit log tools
  getAuditLogs: z.object({
    action: z.string().optional().describe("Filter by action type (e.g. 'Create', 'Update', 'Delete')"),
    userName: z.string().optional().describe("Filter by user name"),
    component: z.string().optional().describe("Filter by component (e.g. 'Jobs', 'Queues', 'Robots')"),
    startTime: z.string().optional().describe("Filter by start time (ISO 8601)"),
    endTime: z.string().optional().describe("Filter by end time (ISO 8601)"),
    limit: z.number().optional().default(50).describe("Maximum items to return"),
    skip: z.number().optional().default(0).describe("Number of items to skip"),
  }),

  // Composite analytics tools
  getFaultedJobs: z.object({
    folderId: z.number().optional().describe("Folder ID to filter faulted jobs"),
    releaseName: z.string().optional().describe("Filter by process/release name"),
    startTime: z.string().optional().describe("Only faulted jobs after this time (ISO 8601)"),
    endTime: z.string().optional().describe("Only faulted jobs before this time (ISO 8601)"),
    limit: z.number().optional().default(50).describe("Maximum items to return"),
  }),

  getProcessPerformance: z.object({
    processName: z.string().describe("Name of the process/release to analyze"),
    folderId: z.number().optional().describe("Folder ID where the process exists"),
    limit: z.number().optional().default(100).describe("Number of recent executions to analyze"),
  }),

  getFolderOverview: z.object({
    folderId: z.number().describe("Folder ID to get overview for"),
  }),

  // Licensing & consumption stats tools
  getConsumptionLicenseStats: z.object({
    tenantId: z.number().optional().describe("Tenant ID (used when authenticated as Host)"),
    days: z.number().optional().describe("Number of reported license usage days"),
  }),
  getLicenseStats: z.object({
    tenantId: z.number().optional().describe("Tenant ID (used when authenticated as Host)"),
    days: z.number().optional().describe("Number of reported license usage days"),
  }),
  getLicensesRuntime: z.object({
    robotType: z.enum([
      "NonProduction", "Attended", "Unattended", "Development", "Studio", "RpaDeveloper", "StudioX",
      "CitizenDeveloper", "Headless", "StudioPro", "RpaDeveloperPro", "TestAutomation", "AutomationCloud",
      "Serverless", "AutomationKit", "ServerlessTestAutomation", "AutomationCloudTestAutomation",
      "AttendedStudioWeb", "Hosting", "AssistantWeb", "ProcessOrchestration", "AgentService", "AppTest",
      "PerformanceTest", "BusinessRule", "CaseManagement",
    ]).describe("Type of robot to filter runtime licenses by"),
  }),
  getLicensesNamedUser: z.object({
    robotType: z.enum([
      "NonProduction", "Attended", "Unattended", "Development", "Studio", "RpaDeveloper", "StudioX",
      "CitizenDeveloper", "Headless", "StudioPro", "RpaDeveloperPro", "TestAutomation", "AutomationCloud",
      "Serverless", "AutomationKit", "ServerlessTestAutomation", "AutomationCloudTestAutomation",
      "AttendedStudioWeb", "Hosting", "AssistantWeb", "ProcessOrchestration", "AgentService", "AppTest",
      "PerformanceTest", "BusinessRule", "CaseManagement",
    ]).describe("Type of robot to filter named-user licenses by"),
  }),
  getCountStats: z.object({}),
  getSessionsStats: z.object({}),
}

/** MCP tool definitions exposed to clients (names, descriptions, JSON schemas). */
export const tools = [
  // Folder tools
  {
    name: "uipath_get_folders",
    description: "Get folders from UiPath Orchestrator.",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Maximum items to return (default 50)" },
        skip: { type: "number", description: "Number of items to skip (default 0)" },
      },
      required: [],
    },
  },

  // Robot tools
  {
    name: "uipath_get_robots",
    description: "Get robots from UiPath Orchestrator with optional folder filtering.",
    inputSchema: {
      type: "object" as const,
      properties: {
        folderId: { type: "number", description: "Optional folder ID filter" },
        limit: { type: "number", description: "Maximum items to return (default 50)" },
        skip: { type: "number", description: "Number of items to skip (default 0)" },
      },
      required: [],
    },
  },

  // Machine tools
  {
    name: "uipath_get_machines",
    description: "Get machines from UiPath Orchestrator.",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Maximum items to return (default 50)" },
        skip: { type: "number", description: "Number of items to skip (default 0)" },
      },
      required: [],
    },
  },

  // Asset tools
  {
    name: "uipath_get_robot_asset",
    description: "Get an asset value for a robot by ID and asset name.",
    inputSchema: {
      type: "object" as const,
      properties: {
        robotId: { type: "number", description: "Robot ID" },
        assetName: { type: "string", description: "Asset name" },
      },
      required: ["robotId", "assetName"],
    },
  },

  // Log tools
  {
    name: "uipath_get_robot_logs",
    description: "Get robot logs with optional filters.",
    inputSchema: {
      type: "object" as const,
      properties: {
        folderId: { type: "number", description: "Folder ID to filter robot logs" },
        jobKey: { type: "string", description: "Filter by job key" },
        startTime: { type: "string", description: "Filter by start time (ISO 8601)" },
        endTime: { type: "string", description: "Filter by end time (ISO 8601)" },
        level: { type: "string", description: "Filter by log level" },
        limit: { type: "number", description: "Maximum items to return (default 100)" },
        skip: { type: "number", description: "Number of items to skip (default 0)" },
      },
      required: [],
    },
  },

  // Queue tools
  {
    name: "uipath_get_queue_definitions",
    description: "Get all queue definitions from UiPath Orchestrator. Returns list of queues with their configuration.",
    inputSchema: {
      type: "object" as const,
      properties: {
        folderId: { type: "number", description: "Folder ID to filter queue definitions" },
      },
      required: [],
    },
  },
  {
    name: "uipath_get_queue_items",
    description: "Get queue items from UiPath Orchestrator with optional filtering by queue, status, etc.",
    inputSchema: {
      type: "object" as const,
      properties: {
        folderId: { type: "number", description: "Folder ID to filter queue items" },
        queueName: { type: "string", description: "Filter by queue name" },
        queueId: { type: "number", description: "Filter by queue ID" },
        status: {
          type: "string",
          enum: ["New", "InProgress", "Successful", "Failed", "Abandoned", "Retried"],
          description: "Filter by item status",
        },
        limit: { type: "number", description: "Maximum items to return (default 50)" },
      },
      required: [],
    },
  },
  {
    name: "uipath_add_queue_item",
    description: "Add a new item to a UiPath queue. The item will be processed by robots.",
    inputSchema: {
      type: "object" as const,
      properties: {
        folderId: { type: "number", description: "Folder ID where the queue exists" },
        queueName: { type: "string", description: "Name of the queue to add item to" },
        data: { type: "object", description: "The data/content for the queue item" },
        reference: { type: "string", description: "Optional unique reference for tracking" },
        priority: {
          type: "string",
          enum: ["Low", "Normal", "High"],
          description: "Item priority (default Normal)",
        },
      },
      required: ["queueName", "data"],
    },
  },
  {
    name: "uipath_get_queue_stats",
    description: "Get statistics for a specific queue including item counts by status and success rate.",
    inputSchema: {
      type: "object" as const,
      properties: {
        folderId: { type: "number", description: "Folder ID where the queue exists" },
        queueName: { type: "string", description: "Name of the queue" },
      },
      required: ["queueName"],
    },
  },

  // Job tools
  {
    name: "uipath_get_jobs",
    description: "Get jobs from UiPath Orchestrator with optional filtering by state or process name. Requires folderId for most operations.",
    inputSchema: {
      type: "object" as const,
      properties: {
        folderId: { type: "number", description: "Folder ID to filter jobs (required for most operations)" },
        state: {
          type: "string",
          enum: ["Pending", "Running", "Successful", "Faulted", "Stopped", "Terminated"],
          description: "Filter by job state",
        },
        releaseName: { type: "string", description: "Filter by release/process name" },
        limit: { type: "number", description: "Maximum jobs to return (default 50)" },
      },
      required: [],
    },
  },
  {
    name: "uipath_get_job_details",
    description: "Get detailed information about a specific job by its ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        jobId: { type: "number", description: "The ID of the job" },
        folderId: { type: "number", description: "Folder ID where the job exists" },
      },
      required: ["jobId"],
    },
  },
  {
    name: "uipath_start_job",
    description: "Start a new job for a process/release in UiPath Orchestrator.",
    inputSchema: {
      type: "object" as const,
      properties: {
        processName: { type: "string", description: "Name of the process to start" },
        folderId: { type: "number", description: "Folder ID where the process exists" },
        inputArguments: { type: "object", description: "Input arguments for the job" },
        jobsCount: { type: "number", description: "Number of jobs to start (default 1)" },
      },
      required: ["processName"],
    },
  },
  {
    name: "uipath_stop_job",
    description: "Stop a running job in UiPath Orchestrator.",
    inputSchema: {
      type: "object" as const,
      properties: {
        jobId: { type: "number", description: "The ID of the job to stop" },
        folderId: { type: "number", description: "Folder ID where the job exists" },
        force: { type: "boolean", description: "Force kill instead of soft stop (default false)" },
      },
      required: ["jobId"],
    },
  },
  {
    name: "uipath_get_job_stats",
    description: "Get overall job statistics including counts by state and success rate.",
    inputSchema: {
      type: "object" as const,
      properties: {
        folderId: { type: "number", description: "Folder ID to get job statistics for" },
      },
      required: [],
    },
  },

  // Release tools
  {
    name: "uipath_get_releases",
    description: "Get available releases/processes from UiPath Orchestrator.",
    inputSchema: {
      type: "object" as const,
      properties: {
        folderId: { type: "number", description: "Folder ID to filter releases" },
        processKey: { type: "string", description: "Filter by process key" },
      },
      required: [],
    },
  },

  // Dashboard tools
  {
    name: "uipath_get_dashboard_summary",
    description: "Get a comprehensive dashboard summary with queue and job statistics.",
    inputSchema: {
      type: "object" as const,
      properties: {
        folderId: { type: "number", description: "Folder ID to get dashboard summary for" },
      },
      required: [],
    },
  },

  // Session tools
  {
    name: "uipath_get_sessions",
    description: "Get active robot sessions from UiPath Orchestrator. Shows which robots are connected and their current state (Available, Busy, Disconnected).",
    inputSchema: {
      type: "object" as const,
      properties: {
        folderId: { type: "number", description: "Folder ID to filter sessions" },
        state: { type: "string", description: "Filter by session state (Available, Busy, Disconnected)" },
        limit: { type: "number", description: "Maximum items to return (default 50)" },
        skip: { type: "number", description: "Number of items to skip (default 0)" },
      },
      required: [],
    },
  },

  // Asset tools
  {
    name: "uipath_get_assets",
    description: "List all assets in a UiPath Orchestrator folder. Assets store configuration values, credentials, and other data used by automations.",
    inputSchema: {
      type: "object" as const,
      properties: {
        folderId: { type: "number", description: "Folder ID to list assets for" },
        limit: { type: "number", description: "Maximum items to return (default 50)" },
        skip: { type: "number", description: "Number of items to skip (default 0)" },
      },
      required: [],
    },
  },

  // Schedule tools
  {
    name: "uipath_get_schedules",
    description: "Get process schedules/triggers from UiPath Orchestrator. Shows when automations are scheduled to run, their cron expressions, and next execution times.",
    inputSchema: {
      type: "object" as const,
      properties: {
        folderId: { type: "number", description: "Folder ID to filter schedules" },
        enabled: { type: "boolean", description: "Filter by enabled/disabled status" },
        limit: { type: "number", description: "Maximum items to return (default 50)" },
        skip: { type: "number", description: "Number of items to skip (default 0)" },
      },
      required: [],
    },
  },

  // Audit log tools
  {
    name: "uipath_get_audit_logs",
    description: "Get audit log entries from UiPath Orchestrator. Tracks who did what and when - useful for compliance and debugging.",
    inputSchema: {
      type: "object" as const,
      properties: {
        action: { type: "string", description: "Filter by action type (e.g. 'Create', 'Update', 'Delete')" },
        userName: { type: "string", description: "Filter by user name" },
        component: { type: "string", description: "Filter by component (e.g. 'Jobs', 'Queues', 'Robots')" },
        startTime: { type: "string", description: "Filter by start time (ISO 8601)" },
        endTime: { type: "string", description: "Filter by end time (ISO 8601)" },
        limit: { type: "number", description: "Maximum items to return (default 50)" },
        skip: { type: "number", description: "Number of items to skip (default 0)" },
      },
      required: [],
    },
  },

  // Composite analytics tools
  {
    name: "uipath_get_faulted_jobs",
    description: "Get faulted/failed jobs with error details. Returns job errors, durations, and failure info for troubleshooting automation failures.",
    inputSchema: {
      type: "object" as const,
      properties: {
        folderId: { type: "number", description: "Folder ID to filter faulted jobs" },
        releaseName: { type: "string", description: "Filter by process/release name" },
        startTime: { type: "string", description: "Only faulted jobs after this time (ISO 8601)" },
        endTime: { type: "string", description: "Only faulted jobs before this time (ISO 8601)" },
        limit: { type: "number", description: "Maximum items to return (default 50)" },
      },
      required: [],
    },
  },
  {
    name: "uipath_get_process_performance",
    description: "Get performance analytics for a specific process/automation. Returns success rate, average execution duration, min/max times, and recent execution history.",
    inputSchema: {
      type: "object" as const,
      properties: {
        processName: { type: "string", description: "Name of the process/release to analyze" },
        folderId: { type: "number", description: "Folder ID where the process exists" },
        limit: { type: "number", description: "Number of recent executions to analyze (default 100)" },
      },
      required: ["processName"],
    },
  },
  {
    name: "uipath_get_folder_overview",
    description: "Get a comprehensive overview of a folder including job counts by state, queue count, release count, and robot count. Useful for understanding folder health at a glance.",
    inputSchema: {
      type: "object" as const,
      properties: {
        folderId: { type: "number", description: "Folder ID to get overview for" },
      },
      required: ["folderId"],
    },
  },

  // Licensing & consumption stats tools
  {
    name: "uipath_get_consumption_license_stats",
    description: "Gets consumption licensing usage statistics (platform units). Shows used vs total for each license type over time. Requires License.View permission.",
    inputSchema: {
      type: "object" as const,
      properties: {
        tenantId: { type: "number", description: "Tenant ID (used when authenticated as Host)" },
        days: { type: "number", description: "Number of reported license usage days" },
      },
      required: [],
    },
  },
  {
    name: "uipath_get_license_stats",
    description: "Gets traditional licensing usage statistics. Shows robot counts by type over time. Requires License.View permission.",
    inputSchema: {
      type: "object" as const,
      properties: {
        tenantId: { type: "number", description: "Tenant ID (used when authenticated as Host)" },
        days: { type: "number", description: "Number of reported license usage days" },
      },
      required: [],
    },
  },
  {
    name: "uipath_get_licenses_runtime",
    description: "Gets runtime license details for a specific robot type. Shows machine assignments, runtimes, and online status.",
    inputSchema: {
      type: "object" as const,
      properties: {
        robotType: {
          type: "string",
          enum: [
            "NonProduction", "Attended", "Unattended", "Development", "Studio", "RpaDeveloper", "StudioX",
            "CitizenDeveloper", "Headless", "StudioPro", "RpaDeveloperPro", "TestAutomation", "AutomationCloud",
            "Serverless", "AutomationKit", "ServerlessTestAutomation", "AutomationCloudTestAutomation",
            "AttendedStudioWeb", "Hosting", "AssistantWeb", "ProcessOrchestration", "AgentService", "AppTest",
            "PerformanceTest", "BusinessRule", "CaseManagement",
          ],
          description: "Type of robot to filter runtime licenses by",
        },
      },
      required: ["robotType"],
    },
  },
  {
    name: "uipath_get_licenses_named_user",
    description: "Gets named-user license details for a specific robot type. Shows user assignments, login dates, and machine associations.",
    inputSchema: {
      type: "object" as const,
      properties: {
        robotType: {
          type: "string",
          enum: [
            "NonProduction", "Attended", "Unattended", "Development", "Studio", "RpaDeveloper", "StudioX",
            "CitizenDeveloper", "Headless", "StudioPro", "RpaDeveloperPro", "TestAutomation", "AutomationCloud",
            "Serverless", "AutomationKit", "ServerlessTestAutomation", "AutomationCloudTestAutomation",
            "AttendedStudioWeb", "Hosting", "AssistantWeb", "ProcessOrchestration", "AgentService", "AppTest",
            "PerformanceTest", "BusinessRule", "CaseManagement",
          ],
          description: "Type of robot to filter named-user licenses by",
        },
      },
      required: ["robotType"],
    },
  },
  {
    name: "uipath_get_count_stats",
    description: "Gets the total number of various entities registered in Orchestrator (Processes, Assets, Queues, Schedules).",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "uipath_get_sessions_stats",
    description: "Gets the total number of robots aggregated by state (Available, Busy, Disconnected, Unresponsive).",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
]

/** MCP resource definitions (read-only URIs exposing Orchestrator data). */
export const resources = [
  {
    uri: "uipath://folders",
    name: "UiPath Folders",
    description: "List of all folders in UiPath Orchestrator",
    mimeType: "application/json",
  },
  {
    uri: "uipath://robots",
    name: "UiPath Robots",
    description: "List of robots in UiPath Orchestrator",
    mimeType: "application/json",
  },
  {
    uri: "uipath://machines",
    name: "UiPath Machines",
    description: "List of machines in UiPath Orchestrator",
    mimeType: "application/json",
  },
  {
    uri: "uipath://queues",
    name: "UiPath Queues",
    description: "List of all queue definitions in UiPath Orchestrator",
    mimeType: "application/json",
  },
  {
    uri: "uipath://jobs/recent",
    name: "Recent Jobs",
    description: "Recent jobs from UiPath Orchestrator",
    mimeType: "application/json",
  },
  {
    uri: "uipath://releases",
    name: "Releases",
    description: "Available releases/processes in UiPath Orchestrator",
    mimeType: "application/json",
  },
  {
    uri: "uipath://dashboard",
    name: "Dashboard Summary",
    description: "Overall dashboard statistics for queues and jobs",
    mimeType: "application/json",
  },
  {
    uri: "uipath://sessions",
    name: "UiPath Sessions",
    description: "Active robot sessions in UiPath Orchestrator",
    mimeType: "application/json",
  },
  {
    uri: "uipath://assets",
    name: "UiPath Assets",
    description: "Assets configured in UiPath Orchestrator",
    mimeType: "application/json",
  },
  {
    uri: "uipath://schedules",
    name: "Process Schedules",
    description: "Scheduled process triggers in UiPath Orchestrator",
    mimeType: "application/json",
  },
]

type ToolArgs = Record<string, unknown> | undefined

/** Normalize an error into a serializable object with message and type. */
function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error"
  return { error: { message, type: "uipath_mcp_error" } }
}

/**
 * Route a tool call to the corresponding UiPath client method.
 * Validates arguments with Zod, invokes the client, and returns the result.
 * @param name - MCP tool name (e.g. "uipath_get_jobs").
 * @param args - Raw arguments from the MCP request.
 * @param client - Authenticated UiPath client instance.
 * @throws {Error} For unknown tool names or API failures.
 */
async function executeTool(name: string, args: ToolArgs, client: UiPathClient) {
  switch (name) {
    // Folder tools
    case "uipath_get_folders": {
      const parsed = schemas.getFolders.parse(args)
      const { folders, count } = await client.getFolders({
        top: parsed.limit,
        skip: parsed.skip,
      })
      return { folders, totalCount: count }
    }

    // Robot tools
    case "uipath_get_robots": {
      const parsed = schemas.getRobots.parse(args)
      const { robots, count } = await client.getRobots({
        folderId: parsed.folderId,
        top: parsed.limit,
        skip: parsed.skip,
      })
      return { robots, totalCount: count }
    }

    // Machine tools
    case "uipath_get_machines": {
      const parsed = schemas.getMachines.parse(args)
      const { machines, count } = await client.getMachines({
        top: parsed.limit,
        skip: parsed.skip,
      })
      return { machines, totalCount: count }
    }

    // Asset tools
    case "uipath_get_robot_asset": {
      const parsed = schemas.getRobotAsset.parse(args)
      return client.getRobotAsset(parsed.robotId, parsed.assetName)
    }

    // Log tools
    case "uipath_get_robot_logs": {
      const parsed = schemas.getRobotLogs.parse(args)
      const { logs, count } = await client.getRobotLogs({
        folderId: parsed.folderId,
        jobKey: parsed.jobKey,
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        level: parsed.level,
        top: parsed.limit,
        skip: parsed.skip,
      })
      return { logs, totalCount: count }
    }

    // Queue tools
    case "uipath_get_queue_definitions": {
      const parsed = schemas.getQueueDefinitions.parse(args)
      return client.getQueueDefinitions(parsed.folderId)
    }

    case "uipath_get_queue_items": {
      const parsed = schemas.getQueueItems.parse(args)
      let queueId = parsed.queueId

      // If queueName provided, look up the ID
      if (parsed.queueName && !queueId) {
        const queue = await client.getQueueDefinitionByName(parsed.queueName, parsed.folderId)
        if (!queue) {
          throw new Error(`Queue not found: ${parsed.queueName}`)
        }
        queueId = queue.Id
      }

      const { items, count } = await client.getQueueItems({
        queueId,
        status: parsed.status as QueueItemStatus | undefined,
        folderId: parsed.folderId,
        top: parsed.limit,
      })
      return { items, totalCount: count }
    }

    case "uipath_add_queue_item": {
      const parsed = schemas.addQueueItem.parse(args)
      return client.addQueueItem(parsed.queueName, parsed.data, {
        reference: parsed.reference,
        priority: parsed.priority,
        folderId: parsed.folderId,
      })
    }

    case "uipath_get_queue_stats": {
      const parsed = schemas.getQueueStats.parse(args)
      const queue = await client.getQueueDefinitionByName(parsed.queueName, parsed.folderId)
      if (!queue) {
        throw new Error(`Queue not found: ${parsed.queueName}`)
      }
      return client.getQueueStats(queue.Id, queue.Name, parsed.folderId)
    }

    // Job tools
    case "uipath_get_jobs": {
      const parsed = schemas.getJobs.parse(args)
      const { jobs, count } = await client.getJobs({
        state: parsed.state as JobState | undefined,
        releaseName: parsed.releaseName,
        folderId: parsed.folderId,
        top: parsed.limit,
      })
      return { jobs, totalCount: count }
    }

    case "uipath_get_job_details": {
      const parsed = schemas.getJobDetails.parse(args)
      return client.getJobById(parsed.jobId, parsed.folderId)
    }

    case "uipath_start_job": {
      const parsed = schemas.startJob.parse(args)

      // Find the release key by process name
      const release = await client.findReleaseByNameOrKey(parsed.processName, parsed.folderId)
      if (!release) {
        throw new Error(`No release found for process: ${parsed.processName}`)
      }

      return client.startJob(release.Key, {
        inputArguments: parsed.inputArguments,
        jobsCount: parsed.jobsCount,
        folderId: parsed.folderId,
      })
    }

    case "uipath_stop_job": {
      const parsed = schemas.stopJob.parse(args)
      await client.stopJob(parsed.jobId, parsed.force ? "Kill" : "SoftStop", parsed.folderId)
      return { success: true, message: `Job ${parsed.jobId} stop requested` }
    }

    case "uipath_get_job_stats": {
      const parsed = schemas.getJobStats.parse(args)
      return client.getJobStats(parsed.folderId)
    }

    // Release tools
    case "uipath_get_releases": {
      const parsed = schemas.getReleases.parse(args)
      return client.getReleases(parsed.processKey, parsed.folderId)
    }

    // Dashboard tools
    case "uipath_get_dashboard_summary": {
      const parsed = schemas.getDashboardSummary.parse(args)
      return client.getDashboardSummary(parsed.folderId)
    }

    // Session tools
    case "uipath_get_sessions": {
      const parsed = schemas.getSessions.parse(args)
      const { sessions, count } = await client.getSessions({
        folderId: parsed.folderId,
        state: parsed.state,
        top: parsed.limit,
        skip: parsed.skip,
      })
      return { sessions, totalCount: count }
    }

    // Asset tools
    case "uipath_get_assets": {
      const parsed = schemas.getAssets.parse(args)
      const { assets, count } = await client.getAssets({
        folderId: parsed.folderId,
        top: parsed.limit,
        skip: parsed.skip,
      })
      return { assets, totalCount: count }
    }

    // Schedule tools
    case "uipath_get_schedules": {
      const parsed = schemas.getProcessSchedules.parse(args)
      const { schedules, count } = await client.getProcessSchedules({
        folderId: parsed.folderId,
        enabled: parsed.enabled,
        top: parsed.limit,
        skip: parsed.skip,
      })
      return { schedules, totalCount: count }
    }

    // Audit log tools
    case "uipath_get_audit_logs": {
      const parsed = schemas.getAuditLogs.parse(args)
      const { logs, count } = await client.getAuditLogs({
        action: parsed.action,
        userName: parsed.userName,
        component: parsed.component,
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        top: parsed.limit,
        skip: parsed.skip,
      })
      return { logs, totalCount: count }
    }

    // Composite analytics tools
    case "uipath_get_faulted_jobs": {
      const parsed = schemas.getFaultedJobs.parse(args)
      return client.getFaultedJobs({
        folderId: parsed.folderId,
        releaseName: parsed.releaseName,
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        top: parsed.limit,
      })
    }

    case "uipath_get_process_performance": {
      const parsed = schemas.getProcessPerformance.parse(args)
      return client.getProcessPerformance(parsed.processName, {
        folderId: parsed.folderId,
        top: parsed.limit,
      })
    }

    case "uipath_get_folder_overview": {
      const parsed = schemas.getFolderOverview.parse(args)
      return client.getFolderOverview(parsed.folderId)
    }

    // Licensing & consumption stats tools
    case "uipath_get_consumption_license_stats": {
      const parsed = schemas.getConsumptionLicenseStats.parse(args)
      return client.getConsumptionLicenseStats(parsed)
    }

    case "uipath_get_license_stats": {
      const parsed = schemas.getLicenseStats.parse(args)
      return client.getLicenseStats(parsed)
    }

    case "uipath_get_licenses_runtime": {
      const parsed = schemas.getLicensesRuntime.parse(args)
      return client.getLicensesRuntime(parsed.robotType as RobotType)
    }

    case "uipath_get_licenses_named_user": {
      const parsed = schemas.getLicensesNamedUser.parse(args)
      return client.getLicensesNamedUser(parsed.robotType as RobotType)
    }

    case "uipath_get_count_stats": {
      schemas.getCountStats.parse(args)
      return client.getCountStats()
    }

    case "uipath_get_sessions_stats": {
      schemas.getSessionsStats.parse(args)
      return client.getSessionsStats()
    }

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

/**
 * Create and configure the MCP server with tool and resource handlers.
 * @param client - Authenticated UiPath client to back all operations.
 * @returns Configured MCP Server instance (not yet connected to a transport).
 */
export function createServer(client: UiPathClient) {
  const server = new Server(
    {
      name: "uipath-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  )

  // Handle list tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }))

  // Handle list resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources,
  }))

  // Handle read resource
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params

    try {
      let content: unknown

      switch (uri) {
        case "uipath://folders":
          content = await client.getFolders({ top: 100 })
          break
        case "uipath://robots":
          content = await client.getRobots({ top: 100 })
          break
        case "uipath://machines":
          content = await client.getMachines({ top: 100 })
          break
        case "uipath://queues":
          content = await client.getQueueDefinitions()
          break
        case "uipath://jobs/recent":
          const { jobs } = await client.getJobs({ top: 20 })
          content = jobs
          break
        case "uipath://releases":
          content = await client.getReleases()
          break
        case "uipath://dashboard":
          content = await client.getDashboardSummary()
          break
        case "uipath://sessions":
          content = await client.getSessions({ top: 100 })
          break
        case "uipath://assets":
          content = await client.getAssets({ top: 100 })
          break
        case "uipath://schedules":
          content = await client.getProcessSchedules({ top: 100 })
          break
        default:
          throw new Error(`Unknown resource: ${uri}`)
      }

      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(content, null, 2),
          },
        ],
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      throw new Error(`Failed to read resource ${uri}: ${message}`)
    }
  })

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    try {
      const result = await executeTool(name, args, client)

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(formatError(error)),
          },
        ],
        isError: true,
      }
    }
  })

  return server
}

// Session storage for multi-user support
const sessions = new Map<string, { client: UiPathClient; server: Server; transport: SSEServerTransport }>()

function generateSessionId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

async function main() {
  // Check if running in SSE mode (via environment variable or argument)
  const isSSE = process.env.MCP_TRANSPORT === "sse" || process.argv.includes("--sse")

  if (isSSE) {
    const app = express()
    const port = process.env.PORT || 3000

    app.use(cors())
    app.use(express.json())

    const getClientFromRequest = (req: express.Request) => {
      const uipathUrl = req.headers["x-uipath-url"] as string | undefined
      const uipathClientId = req.headers["x-uipath-client-id"] as string | undefined
      const uipathClientSecret = req.headers["x-uipath-client-secret"] as string | undefined
      const uipathTenantName = (req.headers["x-uipath-tenant-name"] as string) || "Default"

      if (uipathUrl || uipathClientId || uipathClientSecret) {
        if (!uipathUrl || !uipathClientId || !uipathClientSecret) {
          throw new Error("Missing UiPath credentials")
        }

        const config: UiPathConfig = {
          baseUrl: uipathUrl,
          tenantName: uipathTenantName,
          clientId: uipathClientId,
          clientSecret: uipathClientSecret,
          disableSslVerify: false,
        }
        return new UiPathClient(config)
      }

      return new UiPathClient(loadConfig())
    }

    // Health check endpoint (no auth required)
    app.get("/health", (req, res) => {
      res.json({ status: "ok", sessions: sessions.size })
    })

    // REST tool endpoint for service-to-service usage
    app.post("/tools/:toolName", async (req, res) => {
      try {
        const client = getClientFromRequest(req)
        const toolName = req.params.toolName
        const args = (req.body && (req.body.arguments as ToolArgs)) || (req.body as ToolArgs)
        const result = await executeTool(toolName, args, client)
        res.json(result)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        const status = message.includes("Missing UiPath credentials") ? 401 : 500
        res.status(status).json(formatError(error))
      }
    })

    // SSE endpoint - requires UiPath credentials in headers
    app.get("/sse", async (req, res) => {
      // Extract UiPath credentials from headers
      const uipathUrl = req.headers["x-uipath-url"] as string
      const uipathClientId = req.headers["x-uipath-client-id"] as string
      const uipathClientSecret = req.headers["x-uipath-client-secret"] as string
      const uipathTenantName = (req.headers["x-uipath-tenant-name"] as string) || "Default"

      // Validate required credentials
      if (!uipathUrl || !uipathClientId || !uipathClientSecret) {
        res.status(401).json({
          error: "Missing UiPath credentials",
          required: [
            "X-UiPath-Url",
            "X-UiPath-Client-Id",
            "X-UiPath-Client-Secret",
          ],
          optional: ["X-UiPath-Tenant-Name"],
        })
        return
      }

      // Create a new UiPath client for this session
      const config: UiPathConfig = {
        baseUrl: uipathUrl,
        tenantName: uipathTenantName,
        clientId: uipathClientId,
        clientSecret: uipathClientSecret,
        disableSslVerify: false,
      }

      const sessionId = generateSessionId()
      const client = new UiPathClient(config)
      const server = createServer(client)
      const transport = new SSEServerTransport(`/messages?sessionId=${sessionId}`, res)

      // Store session with transport
      sessions.set(sessionId, { client, server, transport })
      console.error(`New SSE connection established. Session: ${sessionId}`)

      // Clean up session on disconnect
      res.on("close", () => {
        sessions.delete(sessionId)
        console.error(`Session closed: ${sessionId}`)
      })

      await server.connect(transport)
    })

    // Messages endpoint - sessionId required
    app.post("/messages", async (req, res) => {
      const sessionId = req.query.sessionId as string

      if (!sessionId) {
        res.status(400).json({ error: "Missing sessionId query parameter" })
        return
      }

      const session = sessions.get(sessionId)
      if (!session) {
        res.status(404).json({ error: "Session not found or expired" })
        return
      }

      console.error(`Received message for session: ${sessionId}`)
      await session.transport.handlePostMessage(req, res)
    })

    app.listen(port, () => {
      console.error(`UiPath MCP Server running on SSE transport at http://localhost:${port}/sse`)
      console.error(`Users must provide UiPath credentials via headers:`)
      console.error(`  X-UiPath-Url, X-UiPath-Client-Id, X-UiPath-Client-Secret`)
    })
  } else {
    // Default to stdio - uses environment variables
    const config = loadConfig()
    const client = new UiPathClient(config)
    const server = createServer(client)
    const transport = new StdioServerTransport()
    await server.connect(transport)
    console.error("UiPath MCP Server running on stdio")
  }
}

// Only run main if this file is being run directly
const isMainModule = import.meta.url.replace(/\\/g, '/').endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop() || '')
if (isMainModule || process.argv[1]?.includes('index')) {
  main().catch((error) => {
    console.error("Fatal error:", error)
    process.exit(1)
  })
}
