/**
 * UiPath MCP Server - Example Usage
 *
 * This file demonstrates how to use the UiPath MCP Server programmatically.
 * Note: In most cases, you'll use this with an MCP client like Claude Desktop.
 */

import { UiPathClient } from '../dist/uipath-client.js'

// Configuration
const config = {
  baseUrl: process.env.UIPATH_URL || 'https://cloud.uipath.com/your-org/your-tenant',
  tenantName: process.env.UIPATH_TENANT_NAME || 'Default',
  clientId: process.env.UIPATH_CLIENT_ID || 'your-client-id',
  clientSecret: process.env.UIPATH_CLIENT_SECRET || 'your-client-secret',
  defaultFolderId: process.env.UIPATH_FOLDER_ID ? Number(process.env.UIPATH_FOLDER_ID) : undefined
}

// Create client
const client = new UiPathClient(config)

// ============================================================================
// Example 1: List All Folders
// ============================================================================
async function listFolders() {
  console.log('=== Listing Folders ===')
  try {
    const { folders, count } = await client.getFolders({ top: 10 })
    console.log(`Found ${count} folders:`)
    folders.forEach(folder => {
      console.log(`  - ${folder.DisplayName} (ID: ${folder.Id})`)
    })
    return folders
  } catch (error) {
    console.error('Error listing folders:', error.message)
  }
}

// ============================================================================
// Example 2: Get Queue Statistics
// ============================================================================
async function getQueueStats(queueName, folderId) {
  console.log(`\n=== Queue Statistics: ${queueName} ===`)
  try {
    const queue = await client.getQueueDefinitionByName(queueName, folderId)
    if (!queue) {
      console.log(`Queue "${queueName}" not found`)
      return
    }

    const stats = await client.getQueueStats(queue.Id, queue.Name, folderId)
    console.log(`Total Items: ${stats.totalItems}`)
    console.log(`New: ${stats.newItems}`)
    console.log(`In Progress: ${stats.inProgressItems}`)
    console.log(`Successful: ${stats.successfulItems}`)
    console.log(`Failed: ${stats.failedItems}`)
    console.log(`Success Rate: ${stats.successRate?.toFixed(2)}%`)

    return stats
  } catch (error) {
    console.error('Error getting queue stats:', error.message)
  }
}

// ============================================================================
// Example 3: Add Items to Queue
// ============================================================================
async function addQueueItems(queueName, items, folderId) {
  console.log(`\n=== Adding ${items.length} Items to ${queueName} ===`)
  try {
    const results = []
    for (const item of items) {
      const result = await client.addQueueItem(queueName, item.data, {
        reference: item.reference,
        priority: item.priority || 'Normal',
        folderId
      })
      console.log(`  ✓ Added: ${item.reference} (ID: ${result.Id})`)
      results.push(result)
    }
    return results
  } catch (error) {
    console.error('Error adding queue items:', error.message)
  }
}

// ============================================================================
// Example 4: Monitor Job Status
// ============================================================================
async function monitorJobs(folderId) {
  console.log('\n=== Monitoring Jobs ===')
  try {
    const stats = await client.getJobStats(folderId)
    console.log(`Total Jobs: ${stats.totalJobs}`)
    console.log(`Running: ${stats.runningJobs}`)
    console.log(`Pending: ${stats.pendingJobs}`)
    console.log(`Successful: ${stats.successfulJobs}`)
    console.log(`Faulted: ${stats.faultedJobs}`)
    console.log(`Success Rate: ${stats.successRate?.toFixed(2)}%`)

    // Get recent faulted jobs
    if (stats.faultedJobs > 0) {
      console.log('\n=== Recent Faulted Jobs ===')
      const faultedJobs = await client.getFaultedJobs({
        folderId,
        top: 5
      })
      faultedJobs.forEach(job => {
        console.log(`  ! ${job.ReleaseName} (${job.Key})`)
        console.log(`    Error: ${job.JobError}`)
        console.log(`    Duration: ${job.durationSeconds}s`)
      })
    }

    return stats
  } catch (error) {
    console.error('Error monitoring jobs:', error.message)
  }
}

// ============================================================================
// Example 5: Start a Job
// ============================================================================
async function startJob(processName, inputArgs, folderId) {
  console.log(`\n=== Starting Job: ${processName} ===`)
  try {
    // Find the release
    const release = await client.findReleaseByNameOrKey(processName, folderId)
    if (!release) {
      console.log(`Process "${processName}" not found`)
      return
    }

    console.log(`Found release: ${release.Name} (v${release.ProcessVersion})`)

    // Start the job
    const jobs = await client.startJob(release.Key, {
      inputArguments: inputArgs,
      folderId
    })

    jobs.forEach(job => {
      console.log(`  ✓ Job started: ${job.Key} (ID: ${job.Id})`)
    })

    return jobs
  } catch (error) {
    console.error('Error starting job:', error.message)
  }
}

// ============================================================================
// Example 6: Get Process Performance
// ============================================================================
async function analyzeProcessPerformance(processName, folderId) {
  console.log(`\n=== Process Performance: ${processName} ===`)
  try {
    const perf = await client.getProcessPerformance(processName, {
      folderId,
      top: 100
    })

    console.log(`Total Executions: ${perf.totalExecutions}`)
    console.log(`Successful: ${perf.successful}`)
    console.log(`Faulted: ${perf.faulted}`)
    console.log(`Success Rate: ${perf.successRate?.toFixed(2)}%`)
    console.log(`Avg Duration: ${perf.avgDurationSeconds}s`)
    console.log(`Min Duration: ${perf.minDurationSeconds}s`)
    console.log(`Max Duration: ${perf.maxDurationSeconds}s`)

    return perf
  } catch (error) {
    console.error('Error analyzing performance:', error.message)
  }
}

// ============================================================================
// Example 7: Get Folder Overview
// ============================================================================
async function getFolderOverview(folderId) {
  console.log(`\n=== Folder Overview (ID: ${folderId}) ===`)
  try {
    const overview = await client.getFolderOverview(folderId)
    console.log(`Folder: ${overview.folderName}`)
    console.log(`Total Jobs: ${overview.totalJobs}`)
    console.log(`  Pending: ${overview.jobCounts.Pending}`)
    console.log(`  Running: ${overview.jobCounts.Running}`)
    console.log(`  Successful: ${overview.jobCounts.Successful}`)
    console.log(`  Faulted: ${overview.jobCounts.Faulted}`)
    console.log(`Queues: ${overview.queueCount}`)
    console.log(`Releases: ${overview.releaseCount}`)
    console.log(`Robots: ${overview.robotCount}`)

    return overview
  } catch (error) {
    console.error('Error getting folder overview:', error.message)
  }
}

// ============================================================================
// Example 8: Get Robot Sessions
// ============================================================================
async function getRobotSessions(folderId) {
  console.log('\n=== Robot Sessions ===')
  try {
    const { sessions, count } = await client.getSessions({ folderId })
    console.log(`Found ${count} active sessions:`)

    const byState = {}
    sessions.forEach(session => {
      byState[session.State] = (byState[session.State] || 0) + 1
      console.log(`  - ${session.RobotName}: ${session.State}`)
    })

    console.log('\nBy State:')
    Object.entries(byState).forEach(([state, count]) => {
      console.log(`  ${state}: ${count}`)
    })

    return sessions
  } catch (error) {
    console.error('Error getting robot sessions:', error.message)
  }
}

// ============================================================================
// Example 9: Get Audit Logs
// ============================================================================
async function getRecentAuditLogs(hours = 24) {
  console.log(`\n=== Audit Logs (Last ${hours} hours) ===`)
  try {
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
    const { logs, count } = await client.getAuditLogs({
      startTime,
      top: 10
    })

    console.log(`Found ${count} audit log entries:`)
    logs.forEach(log => {
      console.log(`  [${log.ExecutionTime}] ${log.Action} - ${log.Component}`)
      console.log(`    User: ${log.UserName}`)
    })

    return logs
  } catch (error) {
    console.error('Error getting audit logs:', error.message)
  }
}

// ============================================================================
// Example 10: Dashboard Summary
// ============================================================================
async function getDashboardSummary(folderId) {
  console.log('\n=== Dashboard Summary ===')
  try {
    const summary = await client.getDashboardSummary(folderId)

    console.log('Queues:')
    console.log(`  Total Queues: ${summary.totalQueues}`)
    console.log(`  Total Items: ${summary.totalQueueItems}`)
    console.log(`  Success Rate: ${summary.successRateQueues?.toFixed(2)}%`)

    console.log('\nJobs:')
    console.log(`  Total Jobs: ${summary.totalJobs}`)
    console.log(`  Active: ${summary.activeJobs}`)
    console.log(`  Success Rate: ${summary.successRateJobs?.toFixed(2)}%`)

    console.log('\nJob Breakdown:')
    Object.entries(summary.jobsByState).forEach(([state, count]) => {
      console.log(`  ${state}: ${count}`)
    })

    return summary
  } catch (error) {
    console.error('Error getting dashboard summary:', error.message)
  }
}

// ============================================================================
// Main Execution
// ============================================================================
async function main() {
  console.log('UiPath MCP Server - Example Usage\n')
  console.log('Configuration:')
  console.log(`  URL: ${config.baseUrl}`)
  console.log(`  Tenant: ${config.tenantName}`)
  console.log(`  Default Folder: ${config.defaultFolderId || 'None'}\n`)

  try {
    // List folders first
    const folders = await listFolders()
    if (!folders || folders.length === 0) {
      console.log('\nNo folders found. Please check your configuration.')
      return
    }

    // Use first folder or default folder
    const folderId = config.defaultFolderId || folders[0].Id
    console.log(`\n>>> Using Folder ID: ${folderId} <<<`)

    // Run examples
    await getFolderOverview(folderId)
    await getDashboardSummary(folderId)
    await monitorJobs(folderId)
    await getRobotSessions(folderId)

    // Uncomment to run additional examples:

    // await getQueueStats('YourQueueName', folderId)

    // await addQueueItems('YourQueueName', [
    //   { reference: 'ITEM-001', data: { key: 'value' }, priority: 'Normal' },
    //   { reference: 'ITEM-002', data: { key: 'value' }, priority: 'High' }
    // ], folderId)

    // await startJob('YourProcessName', { inputKey: 'inputValue' }, folderId)

    // await analyzeProcessPerformance('YourProcessName', folderId)

    // await getRecentAuditLogs(24)

    console.log('\n=== Done ===')
  } catch (error) {
    console.error('\nFatal error:', error.message)
    process.exit(1)
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

// Export for use in other modules
export {
  listFolders,
  getQueueStats,
  addQueueItems,
  monitorJobs,
  startJob,
  analyzeProcessPerformance,
  getFolderOverview,
  getRobotSessions,
  getRecentAuditLogs,
  getDashboardSummary
}
