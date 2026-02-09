# UiPath MCP Server - Tools Documentation

This document provides detailed documentation for all available MCP tools exposed by the UiPath MCP Server.

## Table of Contents

- [Queue Management Tools](#queue-management-tools)
- [Job Management Tools](#job-management-tools)
- [Process & Release Tools](#process--release-tools)
- [Folder Tools](#folder-tools)
- [Robot Tools](#robot-tools)
- [Machine Tools](#machine-tools)
- [Asset Tools](#asset-tools)
- [Log Tools](#log-tools)
- [Session Tools](#session-tools)
- [Schedule Tools](#schedule-tools)
- [Audit Tools](#audit-tools)
- [Analytics Tools](#analytics-tools)
- [Dashboard Tools](#dashboard-tools)
- [Licensing Tools](#licensing-tools)

---

## Queue Management Tools

### uipath_get_queue_definitions

Get all queue definitions from UiPath Orchestrator.

**Parameters:**
- `folderId` (number, optional): Filter by folder ID

**Returns:**
```json
[
  {
    "Id": 123,
    "Name": "InvoiceQueue",
    "Description": "Queue for invoice processing",
    "MaxNumberOfRetries": 3,
    "AcceptAutomaticallyRetry": true,
    "EnforceUniqueReference": false,
    "CreationTime": "2024-01-15T10:30:00Z"
  }
]
```

**Example:**
```
Get all queue definitions in folder 456
```

---

### uipath_get_queue_items

Get queue items with optional filtering.

**Parameters:**
- `folderId` (number, optional): Filter by folder ID
- `queueName` (string, optional): Filter by queue name
- `queueId` (number, optional): Filter by queue ID
- `status` (string, optional): Filter by status - "New", "InProgress", "Successful", "Failed", "Abandoned", "Retried"
- `limit` (number, optional): Maximum items to return (default: 50)

**Returns:**
```json
{
  "items": [
    {
      "Id": 789,
      "QueueDefinitionId": 123,
      "Status": "New",
      "Reference": "INV-001",
      "SpecificContent": {
        "InvoiceNumber": "INV-001",
        "Amount": 1500.00
      },
      "CreationTime": "2024-01-15T11:00:00Z",
      "Priority": "Normal"
    }
  ],
  "totalCount": 25
}
```

**Example:**
```
Get all failed items from the InvoiceQueue
```

---

### uipath_add_queue_item

Add a new item to a queue.

**Parameters:**
- `queueName` (string, required): Name of the queue
- `data` (object, required): The specific content/data for the item
- `reference` (string, optional): Unique reference for tracking
- `priority` (string, optional): "Low", "Normal", or "High" (default: "Normal")
- `folderId` (number, optional): Folder ID where the queue exists

**Returns:**
```json
{
  "Id": 790,
  "Status": "New",
  "Reference": "INV-002",
  "SpecificContent": {
    "InvoiceNumber": "INV-002",
    "Amount": 2500.00
  },
  "CreationTime": "2024-01-15T11:05:00Z"
}
```

**Example:**
```
Add an item to InvoiceQueue with invoice number INV-002 and amount 2500
```

---

### uipath_get_queue_stats

Get statistics for a specific queue.

**Parameters:**
- `queueName` (string, required): Name of the queue
- `folderId` (number, optional): Folder ID where the queue exists

**Returns:**
```json
{
  "queueId": 123,
  "queueName": "InvoiceQueue",
  "totalItems": 1000,
  "newItems": 50,
  "inProgressItems": 10,
  "successfulItems": 900,
  "failedItems": 40,
  "abandonedItems": 0,
  "successRate": 95.74
}
```

**Example:**
```
Get statistics for the InvoiceQueue
```

---

## Job Management Tools

### uipath_get_jobs

List jobs with optional filtering.

**Parameters:**
- `folderId` (number, optional): Filter by folder ID (recommended)
- `state` (string, optional): Filter by state - "Pending", "Running", "Successful", "Faulted", "Stopped", "Terminated"
- `releaseName` (string, optional): Filter by release/process name
- `limit` (number, optional): Maximum items to return (default: 50)

**Returns:**
```json
{
  "jobs": [
    {
      "Id": 12345,
      "Key": "abc-123-xyz",
      "State": "Successful",
      "ReleaseName": "InvoiceProcessor",
      "StartTime": "2024-01-15T10:00:00Z",
      "EndTime": "2024-01-15T10:05:00Z",
      "HostMachineName": "ROBOT-01"
    }
  ],
  "totalCount": 150
}
```

**Example:**
```
Show all running jobs in folder 456
```

---

### uipath_get_job_details

Get detailed information about a specific job.

**Parameters:**
- `jobId` (number, required): The ID of the job
- `folderId` (number, optional): Folder ID where the job exists

**Returns:**
```json
{
  "Id": 12345,
  "Key": "abc-123-xyz",
  "State": "Successful",
  "ReleaseName": "InvoiceProcessor",
  "StartTime": "2024-01-15T10:00:00Z",
  "EndTime": "2024-01-15T10:05:00Z",
  "InputArguments": "{\"InvoiceId\":\"INV-001\"}",
  "OutputArguments": "{\"Status\":\"Processed\"}",
  "Info": "Job completed successfully",
  "HostMachineName": "ROBOT-01"
}
```

**Example:**
```
Get details for job 12345
```

---

### uipath_start_job

Start a new job for a process.

**Parameters:**
- `processName` (string, required): Name of the process to start
- `folderId` (number, optional): Folder ID where the process exists
- `inputArguments` (object, optional): Input arguments for the job
- `jobsCount` (number, optional): Number of jobs to start (default: 1)

**Returns:**
```json
[
  {
    "Id": 12346,
    "Key": "def-456-uvw",
    "State": "Pending",
    "ReleaseName": "InvoiceProcessor",
    "CreationTime": "2024-01-15T11:00:00Z"
  }
]
```

**Example:**
```
Start the InvoiceProcessor process with invoice ID INV-003
```

---

### uipath_stop_job

Stop a running job.

**Parameters:**
- `jobId` (number, required): The ID of the job to stop
- `folderId` (number, optional): Folder ID where the job exists
- `force` (boolean, optional): Force kill instead of soft stop (default: false)

**Returns:**
```json
{
  "success": true,
  "message": "Job 12346 stop requested"
}
```

**Example:**
```
Stop job 12346
```

---

### uipath_get_job_stats

Get overall job statistics.

**Parameters:**
- `folderId` (number, optional): Folder ID to get statistics for

**Returns:**
```json
{
  "totalJobs": 1000,
  "pendingJobs": 5,
  "runningJobs": 10,
  "successfulJobs": 900,
  "faultedJobs": 80,
  "stoppedJobs": 5,
  "successRate": 91.84
}
```

**Example:**
```
Get job statistics for folder 456
```

---

## Process & Release Tools

### uipath_get_releases

Get available releases/processes.

**Parameters:**
- `folderId` (number, optional): Filter by folder ID
- `processKey` (string, optional): Filter by process key

**Returns:**
```json
[
  {
    "Key": "release-key-123",
    "ProcessKey": "InvoiceProcessor",
    "ProcessVersion": "1.0.5",
    "Name": "InvoiceProcessor",
    "Description": "Automated invoice processing",
    "IsLatestVersion": true
  }
]
```

**Example:**
```
Get all releases in folder 456
```

---

## Folder Tools

### uipath_get_folders

List all folders.

**Parameters:**
- `limit` (number, optional): Maximum items to return (default: 50)
- `skip` (number, optional): Number of items to skip (default: 0)

**Returns:**
```json
{
  "folders": [
    {
      "Id": 456,
      "DisplayName": "Finance",
      "FullyQualifiedName": "/Finance",
      "ParentId": null,
      "Description": "Finance automation folder",
      "IsPersonal": false,
      "CreationTime": "2024-01-01T00:00:00Z"
    }
  ],
  "totalCount": 10
}
```

**Example:**
```
List all folders
```

---

## Robot Tools

### uipath_get_robots

List robots with optional folder filtering.

**Parameters:**
- `folderId` (number, optional): Filter by folder ID
- `limit` (number, optional): Maximum items to return (default: 50)
- `skip` (number, optional): Number of items to skip (default: 0)

**Returns:**
```json
{
  "robots": [
    {
      "Id": 789,
      "Name": "FinanceBot01",
      "Type": "Unattended",
      "MachineName": "ROBOT-01",
      "IsEnabled": true,
      "Version": "2023.10.0"
    }
  ],
  "totalCount": 15
}
```

**Example:**
```
List all robots in folder 456
```

---

### uipath_get_sessions

Get active robot sessions.

**Parameters:**
- `folderId` (number, optional): Filter by folder ID
- `state` (string, optional): Filter by state - "Available", "Busy", "Disconnected"
- `limit` (number, optional): Maximum items to return (default: 50)
- `skip` (number, optional): Number of items to skip (default: 0)

**Returns:**
```json
{
  "sessions": [
    {
      "Id": 1001,
      "RobotName": "FinanceBot01",
      "MachineName": "ROBOT-01",
      "State": "Available",
      "IsUnresponsive": false,
      "ReportingTime": "2024-01-15T11:00:00Z"
    }
  ],
  "totalCount": 5
}
```

**Example:**
```
Show all busy robot sessions
```

---

## Machine Tools

### uipath_get_machines

List all machines.

**Parameters:**
- `limit` (number, optional): Maximum items to return (default: 50)
- `skip` (number, optional): Number of items to skip (default: 0)

**Returns:**
```json
{
  "machines": [
    {
      "Id": 101,
      "Name": "ROBOT-01",
      "Type": "Standard",
      "IsOnline": true,
      "Description": "Finance automation machine",
      "Version": "2023.10.0"
    }
  ],
  "totalCount": 8
}
```

**Example:**
```
List all machines
```

---

## Asset Tools

### uipath_get_robot_asset

Get an asset value for a specific robot.

**Parameters:**
- `robotId` (number, required): Robot ID
- `assetName` (string, required): Asset name

**Returns:**
```json
{
  "Id": 201,
  "Name": "ApiKey",
  "ValueType": "Text",
  "StringValue": "encrypted-value",
  "Sensitive": true,
  "Description": "API key for external service"
}
```

**Example:**
```
Get the ApiKey asset for robot 789
```

---

### uipath_get_assets

List all assets in a folder.

**Parameters:**
- `folderId` (number, optional): Filter by folder ID
- `limit` (number, optional): Maximum items to return (default: 50)
- `skip` (number, optional): Number of items to skip (default: 0)

**Returns:**
```json
{
  "assets": [
    {
      "Id": 201,
      "Name": "ApiKey",
      "ValueType": "Text",
      "ValueScope": "Global",
      "Description": "API key for external service",
      "HasDefaultValue": true
    }
  ],
  "totalCount": 20
}
```

**Example:**
```
List all assets in folder 456
```

---

## Log Tools

### uipath_get_robot_logs

Retrieve robot logs with filtering.

**Parameters:**
- `folderId` (number, optional): Filter by folder ID
- `jobKey` (string, optional): Filter by job key
- `startTime` (string, optional): Filter by start time (ISO 8601)
- `endTime` (string, optional): Filter by end time (ISO 8601)
- `level` (string, optional): Filter by log level
- `limit` (number, optional): Maximum items to return (default: 100)
- `skip` (number, optional): Number of items to skip (default: 0)

**Returns:**
```json
{
  "logs": [
    {
      "Id": 5001,
      "TimeStamp": "2024-01-15T10:05:30Z",
      "Level": "Info",
      "Message": "Invoice processed successfully",
      "ProcessName": "InvoiceProcessor",
      "JobKey": "abc-123-xyz",
      "RobotName": "FinanceBot01",
      "MachineName": "ROBOT-01"
    }
  ],
  "totalCount": 500
}
```

**Example:**
```
Get error logs for job abc-123-xyz
```

---

## Session Tools

See [uipath_get_sessions](#uipath_get_sessions) under Robot Tools.

---

## Schedule Tools

### uipath_get_schedules

Get process schedules/triggers.

**Parameters:**
- `folderId` (number, optional): Filter by folder ID
- `enabled` (boolean, optional): Filter by enabled/disabled status
- `limit` (number, optional): Maximum items to return (default: 50)
- `skip` (number, optional): Number of items to skip (default: 0)

**Returns:**
```json
{
  "schedules": [
    {
      "Id": 301,
      "Name": "Daily Invoice Processing",
      "ReleaseName": "InvoiceProcessor",
      "StartProcessCron": "0 9 * * 1-5",
      "StartProcessCronDetails": "At 09:00 AM, Monday through Friday",
      "Enabled": true,
      "NextExecutionTime": "2024-01-16T09:00:00Z",
      "TimeZoneId": "Eastern Standard Time"
    }
  ],
  "totalCount": 12
}
```

**Example:**
```
Show all enabled schedules in folder 456
```

---

## Audit Tools

### uipath_get_audit_logs

Get audit trail entries.

**Parameters:**
- `action` (string, optional): Filter by action type (e.g., "Create", "Update", "Delete")
- `userName` (string, optional): Filter by user name
- `component` (string, optional): Filter by component (e.g., "Jobs", "Queues", "Robots")
- `startTime` (string, optional): Filter by start time (ISO 8601)
- `endTime` (string, optional): Filter by end time (ISO 8601)
- `limit` (number, optional): Maximum items to return (default: 50)
- `skip` (number, optional): Number of items to skip (default: 0)

**Returns:**
```json
{
  "logs": [
    {
      "Id": 4001,
      "Action": "Create",
      "Component": "Jobs",
      "UserName": "admin@company.com",
      "ExecutionTime": "2024-01-15T10:00:00Z",
      "EntityId": 12345,
      "EntityName": "InvoiceProcessor"
    }
  ],
  "totalCount": 1000
}
```

**Example:**
```
Show all job deletions by admin@company.com in the last 24 hours
```

---

## Analytics Tools

### uipath_get_faulted_jobs

Get faulted/failed jobs with error details.

**Parameters:**
- `folderId` (number, optional): Filter by folder ID
- `releaseName` (string, optional): Filter by process/release name
- `startTime` (string, optional): Filter by start time (ISO 8601)
- `endTime` (string, optional): Filter by end time (ISO 8601)
- `limit` (number, optional): Maximum items to return (default: 50)

**Returns:**
```json
[
  {
    "Id": 12347,
    "Key": "ghi-789-rst",
    "ReleaseName": "InvoiceProcessor",
    "State": "Faulted",
    "Info": "Execution error",
    "JobError": "Element not found: Invoice amount field",
    "CreationTime": "2024-01-15T10:30:00Z",
    "StartTime": "2024-01-15T10:30:05Z",
    "EndTime": "2024-01-15T10:32:00Z",
    "HostMachineName": "ROBOT-01",
    "durationSeconds": 115
  }
]
```

**Example:**
```
Show all faulted jobs for InvoiceProcessor in the last week
```

---

### uipath_get_process_performance

Get performance analytics for a process.

**Parameters:**
- `processName` (string, required): Name of the process to analyze
- `folderId` (number, optional): Folder ID where the process exists
- `limit` (number, optional): Number of recent executions to analyze (default: 100)

**Returns:**
```json
{
  "processName": "InvoiceProcessor",
  "totalExecutions": 100,
  "successful": 92,
  "faulted": 7,
  "stopped": 1,
  "running": 0,
  "pending": 0,
  "successRate": 92.93,
  "avgDurationSeconds": 180,
  "minDurationSeconds": 120,
  "maxDurationSeconds": 300,
  "recentJobs": [...]
}
```

**Example:**
```
Analyze performance of the InvoiceProcessor process
```

---

### uipath_get_folder_overview

Get comprehensive folder health overview.

**Parameters:**
- `folderId` (number, required): Folder ID to get overview for

**Returns:**
```json
{
  "folderId": 456,
  "folderName": "Finance",
  "jobCounts": {
    "Pending": 5,
    "Running": 10,
    "Successful": 900,
    "Faulted": 80,
    "Stopped": 5
  },
  "totalJobs": 1000,
  "queueCount": 12,
  "releaseCount": 25,
  "robotCount": 15
}
```

**Example:**
```
Get health overview for folder 456
```

---

## Dashboard Tools

### uipath_get_dashboard_summary

Get comprehensive dashboard statistics.

**Parameters:**
- `folderId` (number, optional): Filter by folder ID

**Returns:**
```json
{
  "totalQueues": 12,
  "totalQueueItems": 5000,
  "queueItemsByStatus": {
    "New": 500,
    "InProgress": 100,
    "Successful": 4200,
    "Failed": 200
  },
  "totalJobs": 1000,
  "jobsByState": {
    "Pending": 5,
    "Running": 10,
    "Successful": 900,
    "Faulted": 80,
    "Stopped": 5
  },
  "activeJobs": 15,
  "successRateJobs": 91.84,
  "successRateQueues": 95.45
}
```

**Example:**
```
Get dashboard summary for all automation
```

---

## Licensing Tools

### uipath_get_consumption_license_stats

Get consumption licensing usage statistics.

**Parameters:**
- `tenantId` (number, optional): Tenant ID (for Host users)
- `days` (number, optional): Number of days of usage to report

**Returns:**
```json
[
  {
    "type": "Unattended",
    "used": 150,
    "total": 200,
    "timestamp": "2024-01-15T00:00:00Z"
  }
]
```

**Example:**
```
Get consumption license statistics for the last 30 days
```

---

### uipath_get_license_stats

Get traditional licensing usage statistics.

**Parameters:**
- `tenantId` (number, optional): Tenant ID (for Host users)
- `days` (number, optional): Number of days of usage to report

**Returns:**
```json
[
  {
    "robotType": "Unattended",
    "count": 15,
    "timestamp": "2024-01-15T00:00:00Z"
  }
]
```

**Example:**
```
Get license usage statistics
```

---

### uipath_get_licenses_runtime

Get runtime license details for a robot type.

**Parameters:**
- `robotType` (string, required): Type of robot (e.g., "Unattended", "Attended", "Studio")

**Returns:**
```json
{
  "value": [
    {
      "Key": "runtime-key-123",
      "MachineId": 101,
      "MachineName": "ROBOT-01",
      "HostMachineName": "ROBOT-01",
      "Runtimes": 5,
      "RobotsCount": 3,
      "IsOnline": true,
      "IsLicensed": true,
      "Enabled": true
    }
  ]
}
```

**Example:**
```
Get runtime license details for Unattended robots
```

---

### uipath_get_licenses_named_user

Get named-user license details for a robot type.

**Parameters:**
- `robotType` (string, required): Type of robot (e.g., "Attended", "Studio", "StudioX")

**Returns:**
```json
{
  "value": [
    {
      "Key": "user-key-456",
      "UserName": "john.doe@company.com",
      "LastLoginDate": "2024-01-15T08:00:00Z",
      "MachinesCount": 2,
      "IsLicensed": true,
      "MachineNames": ["LAPTOP-01", "LAPTOP-02"]
    }
  ]
}
```

**Example:**
```
Get named-user license details for Attended robots
```

---

### uipath_get_count_stats

Get total entity counts in Orchestrator.

**Parameters:** None

**Returns:**
```json
[
  {
    "title": "Processes",
    "count": 25,
    "hasPermissions": true
  },
  {
    "title": "Assets",
    "count": 20,
    "hasPermissions": true
  },
  {
    "title": "Queues",
    "count": 12,
    "hasPermissions": true
  },
  {
    "title": "Schedules",
    "count": 15,
    "hasPermissions": true
  }
]
```

**Example:**
```
Get entity count statistics
```

---

### uipath_get_sessions_stats

Get robot session statistics by state.

**Parameters:** None

**Returns:**
```json
[
  {
    "title": "Available",
    "count": 10,
    "hasPermissions": true
  },
  {
    "title": "Busy",
    "count": 5,
    "hasPermissions": true
  },
  {
    "title": "Disconnected",
    "count": 2,
    "hasPermissions": true
  }
]
```

**Example:**
```
Get robot session statistics
```

---

## Error Handling

All tools return errors in the following format:

```json
{
  "error": {
    "message": "Error description",
    "type": "uipath_mcp_error"
  }
}
```

Common error scenarios:
- Invalid credentials
- Missing permissions
- Resource not found
- Invalid parameters
- API rate limiting

---

## Best Practices

1. **Use Folder IDs**: Always specify `folderId` when possible for faster queries and proper scoping
2. **Pagination**: Use `limit` and `skip` parameters for large datasets
3. **Filtering**: Apply filters at the API level rather than in your application
4. **Caching**: Cache frequently accessed data like folders and releases
5. **Error Handling**: Implement proper error handling for all tool calls
6. **Rate Limiting**: Be mindful of API rate limits; batch operations when possible

---

For more information, see the [API Documentation](API.md) or the [main README](../README.md).
