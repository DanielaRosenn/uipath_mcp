import { describe, it, expect, beforeAll } from 'vitest'
import { UiPathClient } from '../src/uipath-client.js'
import type { UiPathConfig } from '../src/types.js'

/**
 * Comprehensive MCP Tools Test Suite
 *
 * This test suite validates all 29 MCP tools exposed by the UiPath MCP server.
 * Tests are organized by functional category and include edge cases.
 *
 * Prerequisites:
 * - Valid UiPath Orchestrator instance
 * - Environment variables: UIPATH_URL, UIPATH_CLIENT_ID, UIPATH_CLIENT_SECRET
 * - At least one folder with appropriate permissions
 */

// Test configuration
const shouldSkip = !process.env.UIPATH_URL || !process.env.UIPATH_CLIENT_ID || !process.env.UIPATH_CLIENT_SECRET

interface TestResult {
  tool: string
  status: 'passed' | 'failed' | 'skipped'
  message?: string
  duration?: number
}

const testResults: TestResult[] = []

describe.skipIf(shouldSkip)('MCP Tools - Comprehensive Test Suite', () => {
  let client: UiPathClient
  let config: UiPathConfig
  let testFolderId: number | undefined

  beforeAll(async () => {
    config = {
      baseUrl: process.env.UIPATH_URL!,
      tenantName: process.env.UIPATH_TENANT_NAME || 'Default',
      clientId: process.env.UIPATH_CLIENT_ID!,
      clientSecret: process.env.UIPATH_CLIENT_SECRET!,
      disableSslVerify: process.env.UIPATH_DISABLE_SSL_VERIFY === '1'
    }
    client = new UiPathClient(config)

    // Get first folder ID for tests that require it
    try {
      const folders = await client.getFolders({ top: 1 })
      if (folders.folders.length > 0) {
        testFolderId = folders.folders[0].Id
      }
    } catch (error) {
      console.warn('Could not retrieve test folder:', error)
    }
  })

  describe('Tool 1: uipath_get_folders', () => {
    it('should get folders with default parameters', async () => {
      const startTime = Date.now()
      try {
        const result = await client.getFolders({ top: 50, skip: 0 })
        expect(result).toBeDefined()
        expect(result.folders).toBeInstanceOf(Array)
        expect(result.count).toBeGreaterThanOrEqual(0)
        testResults.push({ tool: 'uipath_get_folders', status: 'passed', duration: Date.now() - startTime })
      } catch (error) {
        testResults.push({ tool: 'uipath_get_folders', status: 'failed', message: String(error) })
        throw error
      }
    })

    it('should handle pagination', async () => {
      const page1 = await client.getFolders({ top: 1, skip: 0 })
      const page2 = await client.getFolders({ top: 1, skip: 1 })

      if (page1.folders.length > 0 && page2.folders.length > 0) {
        expect(page1.folders[0].Id).not.toBe(page2.folders[0].Id)
      }
    })

    it('should handle limit parameter', async () => {
      const result = await client.getFolders({ top: 5 })
      expect(result.folders.length).toBeLessThanOrEqual(5)
    })
  })

  describe('Tool 2: uipath_get_robots', () => {
    it('should get robots without folder filter', async () => {
      const startTime = Date.now()
      try {
        const result = await client.getRobots({ top: 50 })
        expect(result).toBeDefined()
        expect(result.robots).toBeInstanceOf(Array)
        testResults.push({ tool: 'uipath_get_robots', status: 'passed', duration: Date.now() - startTime })
      } catch (error) {
        testResults.push({ tool: 'uipath_get_robots', status: 'failed', message: String(error) })
        throw error
      }
    })

    it('should get robots with folder filter', async () => {
      if (testFolderId) {
        const result = await client.getRobots({ folderId: testFolderId, top: 10 })
        expect(result.robots).toBeInstanceOf(Array)
      }
    })
  })

  describe('Tool 3: uipath_get_machines', () => {
    it('should get machines', async () => {
      const startTime = Date.now()
      try {
        const result = await client.getMachines({ top: 50 })
        expect(result).toBeDefined()
        expect(result.machines).toBeInstanceOf(Array)
        testResults.push({ tool: 'uipath_get_machines', status: 'passed', duration: Date.now() - startTime })
      } catch (error) {
        testResults.push({ tool: 'uipath_get_machines', status: 'failed', message: String(error) })
        throw error
      }
    })
  })

  describe('Tool 4: uipath_get_robot_asset', () => {
    it('should handle missing robot gracefully', async () => {
      const startTime = Date.now()
      try {
        // Test with invalid robot ID - should handle gracefully
        await expect(client.getRobotAsset(99999999, 'NonExistentAsset')).rejects.toThrow()
        testResults.push({ tool: 'uipath_get_robot_asset', status: 'passed', duration: Date.now() - startTime, message: 'Correctly handles invalid input' })
      } catch (error) {
        testResults.push({ tool: 'uipath_get_robot_asset', status: 'failed', message: String(error) })
        throw error
      }
    })
  })

  describe('Tool 5: uipath_get_robot_logs', () => {
    it('should get robot logs', async () => {
      const startTime = Date.now()
      try {
        const result = await client.getRobotLogs({ limit: 10 })
        expect(result).toBeDefined()
        expect(result.logs).toBeInstanceOf(Array)
        testResults.push({ tool: 'uipath_get_robot_logs', status: 'passed', duration: Date.now() - startTime })
      } catch (error) {
        testResults.push({ tool: 'uipath_get_robot_logs', status: 'failed', message: String(error) })
        throw error
      }
    })

    it('should filter logs by folder', async () => {
      if (testFolderId) {
        const result = await client.getRobotLogs({ folderId: testFolderId, limit: 5 })
        expect(result.logs).toBeInstanceOf(Array)
      }
    })
  })

  describe('Tool 6: uipath_get_queue_definitions', () => {
    it('should get queue definitions', async () => {
      const startTime = Date.now()
      try {
        const result = await client.getQueueDefinitions()
        expect(result).toBeInstanceOf(Array)
        testResults.push({ tool: 'uipath_get_queue_definitions', status: 'passed', duration: Date.now() - startTime })
      } catch (error) {
        testResults.push({ tool: 'uipath_get_queue_definitions', status: 'failed', message: String(error) })
        throw error
      }
    })
  })

  describe('Tool 7: uipath_get_queue_items', () => {
    it('should get queue items', async () => {
      const startTime = Date.now()
      try {
        const result = await client.getQueueItems({ top: 10 })
        expect(result).toBeDefined()
        expect(result.items).toBeInstanceOf(Array)
        testResults.push({ tool: 'uipath_get_queue_items', status: 'passed', duration: Date.now() - startTime })
      } catch (error) {
        testResults.push({ tool: 'uipath_get_queue_items', status: 'failed', message: String(error) })
        throw error
      }
    })

    it('should filter by status', async () => {
      const result = await client.getQueueItems({ status: 'New', top: 5 })
      expect(result.items).toBeInstanceOf(Array)
      result.items.forEach(item => {
        expect(item.Status).toBe('New')
      })
    })
  })

  describe('Tool 8: uipath_add_queue_item', () => {
    it('should validate queue name is required', async () => {
      const startTime = Date.now()
      try {
        // This should fail without a valid queue
        await expect(
          client.addQueueItem('NonExistentQueue_TestQueue_12345', { testData: 'value' })
        ).rejects.toThrow()
        testResults.push({ tool: 'uipath_add_queue_item', status: 'passed', duration: Date.now() - startTime, message: 'Validation works correctly' })
      } catch (error) {
        testResults.push({ tool: 'uipath_add_queue_item', status: 'failed', message: String(error) })
        throw error
      }
    })
  })

  describe('Tool 9: uipath_get_queue_stats', () => {
    it('should handle non-existent queue gracefully', async () => {
      const startTime = Date.now()
      try {
        await expect(
          client.getQueueStats('NonExistentQueue_12345')
        ).rejects.toThrow()
        testResults.push({ tool: 'uipath_get_queue_stats', status: 'passed', duration: Date.now() - startTime, message: 'Handles invalid queue correctly' })
      } catch (error) {
        testResults.push({ tool: 'uipath_get_queue_stats', status: 'failed', message: String(error) })
        throw error
      }
    })
  })

  describe('Tool 10: uipath_get_jobs', () => {
    it('should get jobs', async () => {
      const startTime = Date.now()
      try {
        const result = await client.getJobs({ top: 10 })
        expect(result).toBeDefined()
        expect(result.jobs).toBeInstanceOf(Array)
        testResults.push({ tool: 'uipath_get_jobs', status: 'passed', duration: Date.now() - startTime })
      } catch (error) {
        testResults.push({ tool: 'uipath_get_jobs', status: 'failed', message: String(error) })
        throw error
      }
    })

    it('should filter by state', async () => {
      const result = await client.getJobs({ state: 'Successful', top: 5 })
      expect(result.jobs).toBeInstanceOf(Array)
      result.jobs.forEach(job => {
        expect(job.State).toBe('Successful')
      })
    })
  })

  describe('Tool 11: uipath_get_job_details', () => {
    it('should handle invalid job ID', async () => {
      const startTime = Date.now()
      try {
        await expect(client.getJobDetails(99999999)).rejects.toThrow()
        testResults.push({ tool: 'uipath_get_job_details', status: 'passed', duration: Date.now() - startTime, message: 'Handles invalid ID correctly' })
      } catch (error) {
        testResults.push({ tool: 'uipath_get_job_details', status: 'failed', message: String(error) })
        throw error
      }
    })
  })

  describe('Tool 12: uipath_start_job', () => {
    it('should handle invalid process name', async () => {
      const startTime = Date.now()
      try {
        await expect(
          client.startJob('NonExistentProcess_12345')
        ).rejects.toThrow()
        testResults.push({ tool: 'uipath_start_job', status: 'passed', duration: Date.now() - startTime, message: 'Validation works correctly' })
      } catch (error) {
        testResults.push({ tool: 'uipath_start_job', status: 'failed', message: String(error) })
        throw error
      }
    })
  })

  describe('Tool 13: uipath_stop_job', () => {
    it('should handle invalid job ID', async () => {
      const startTime = Date.now()
      try {
        await expect(client.stopJob(99999999)).rejects.toThrow()
        testResults.push({ tool: 'uipath_stop_job', status: 'passed', duration: Date.now() - startTime, message: 'Handles invalid ID correctly' })
      } catch (error) {
        testResults.push({ tool: 'uipath_stop_job', status: 'failed', message: String(error) })
        throw error
      }
    })
  })

  describe('Tool 14: uipath_get_job_stats', () => {
    it('should get job statistics', async () => {
      const startTime = Date.now()
      try {
        const result = await client.getJobStats()
        expect(result).toBeDefined()
        expect(result).toHaveProperty('totalJobs')
        expect(result).toHaveProperty('successfulJobs')
        expect(result).toHaveProperty('faultedJobs')
        testResults.push({ tool: 'uipath_get_job_stats', status: 'passed', duration: Date.now() - startTime })
      } catch (error) {
        testResults.push({ tool: 'uipath_get_job_stats', status: 'failed', message: String(error) })
        throw error
      }
    })
  })

  describe('Tool 15: uipath_get_releases', () => {
    it('should get releases', async () => {
      const startTime = Date.now()
      try {
        const result = await client.getReleases()
        expect(result).toBeInstanceOf(Array)
        testResults.push({ tool: 'uipath_get_releases', status: 'passed', duration: Date.now() - startTime })
      } catch (error) {
        testResults.push({ tool: 'uipath_get_releases', status: 'failed', message: String(error) })
        throw error
      }
    })
  })

  describe('Tool 16: uipath_get_dashboard_summary', () => {
    it('should get dashboard summary', async () => {
      const startTime = Date.now()
      try {
        const result = await client.getDashboardSummary()
        expect(result).toBeDefined()
        expect(result).toHaveProperty('totalQueues')
        expect(result).toHaveProperty('totalJobs')
        testResults.push({ tool: 'uipath_get_dashboard_summary', status: 'passed', duration: Date.now() - startTime })
      } catch (error) {
        testResults.push({ tool: 'uipath_get_dashboard_summary', status: 'failed', message: String(error) })
        throw error
      }
    })
  })

  describe('Tool 17: uipath_get_sessions', () => {
    it('should get sessions', async () => {
      const startTime = Date.now()
      try {
        const result = await client.getSessions({ top: 10 })
        expect(result).toBeDefined()
        expect(result.sessions).toBeInstanceOf(Array)
        testResults.push({ tool: 'uipath_get_sessions', status: 'passed', duration: Date.now() - startTime })
      } catch (error) {
        testResults.push({ tool: 'uipath_get_sessions', status: 'failed', message: String(error) })
        throw error
      }
    })
  })

  describe('Tool 18: uipath_get_assets', () => {
    it('should get assets', async () => {
      const startTime = Date.now()
      try {
        const result = await client.getAssets({ top: 10 })
        expect(result).toBeDefined()
        expect(result.assets).toBeInstanceOf(Array)
        testResults.push({ tool: 'uipath_get_assets', status: 'passed', duration: Date.now() - startTime })
      } catch (error) {
        testResults.push({ tool: 'uipath_get_assets', status: 'failed', message: String(error) })
        throw error
      }
    })
  })

  describe('Tool 19: uipath_get_schedules', () => {
    it('should get schedules', async () => {
      const startTime = Date.now()
      try {
        const result = await client.getProcessSchedules({ top: 10 })
        expect(result).toBeDefined()
        expect(result.schedules).toBeInstanceOf(Array)
        testResults.push({ tool: 'uipath_get_schedules', status: 'passed', duration: Date.now() - startTime })
      } catch (error) {
        testResults.push({ tool: 'uipath_get_schedules', status: 'failed', message: String(error) })
        throw error
      }
    })
  })

  describe('Tool 20: uipath_get_audit_logs', () => {
    it('should get audit logs', async () => {
      const startTime = Date.now()
      try {
        const result = await client.getAuditLogs({ top: 10 })
        expect(result).toBeDefined()
        expect(result.logs).toBeInstanceOf(Array)
        testResults.push({ tool: 'uipath_get_audit_logs', status: 'passed', duration: Date.now() - startTime })
      } catch (error) {
        testResults.push({ tool: 'uipath_get_audit_logs', status: 'failed', message: String(error) })
        throw error
      }
    })
  })

  describe('Tool 21: uipath_get_faulted_jobs', () => {
    it('should get faulted jobs', async () => {
      const startTime = Date.now()
      try {
        const result = await client.getFaultedJobs({ top: 10 })
        expect(result).toBeInstanceOf(Array)
        testResults.push({ tool: 'uipath_get_faulted_jobs', status: 'passed', duration: Date.now() - startTime })
      } catch (error) {
        testResults.push({ tool: 'uipath_get_faulted_jobs', status: 'failed', message: String(error) })
        throw error
      }
    })
  })

  describe('Tool 22: uipath_get_process_performance', () => {
    it('should handle non-existent process', async () => {
      const startTime = Date.now()
      try {
        await expect(
          client.getProcessPerformance('NonExistentProcess_12345')
        ).rejects.toThrow()
        testResults.push({ tool: 'uipath_get_process_performance', status: 'passed', duration: Date.now() - startTime, message: 'Handles invalid process correctly' })
      } catch (error) {
        testResults.push({ tool: 'uipath_get_process_performance', status: 'failed', message: String(error) })
        throw error
      }
    })
  })

  describe('Tool 23: uipath_get_folder_overview', () => {
    it('should get folder overview', async () => {
      const startTime = Date.now()
      try {
        if (testFolderId) {
          const result = await client.getFolderOverview(testFolderId)
          expect(result).toBeDefined()
          testResults.push({ tool: 'uipath_get_folder_overview', status: 'passed', duration: Date.now() - startTime })
        } else {
          testResults.push({ tool: 'uipath_get_folder_overview', status: 'skipped', message: 'No test folder available' })
        }
      } catch (error) {
        testResults.push({ tool: 'uipath_get_folder_overview', status: 'failed', message: String(error) })
        throw error
      }
    })
  })

  describe('Tool 24: uipath_get_consumption_license_stats', () => {
    it('should get consumption license stats', async () => {
      const startTime = Date.now()
      try {
        const result = await client.getConsumptionLicenseStats()
        expect(result).toBeDefined()
        testResults.push({ tool: 'uipath_get_consumption_license_stats', status: 'passed', duration: Date.now() - startTime })
      } catch (error) {
        // This might fail if not using consumption licenses
        testResults.push({ tool: 'uipath_get_consumption_license_stats', status: 'failed', message: String(error) })
      }
    })
  })

  describe('Tool 25: uipath_get_license_stats', () => {
    it('should get license stats', async () => {
      const startTime = Date.now()
      try {
        const result = await client.getLicenseStats()
        expect(result).toBeDefined()
        testResults.push({ tool: 'uipath_get_license_stats', status: 'passed', duration: Date.now() - startTime })
      } catch (error) {
        testResults.push({ tool: 'uipath_get_license_stats', status: 'failed', message: String(error) })
      }
    })
  })

  describe('Tool 26: uipath_get_licenses_runtime', () => {
    it('should get runtime licenses', async () => {
      const startTime = Date.now()
      try {
        const result = await client.getLicensesRuntime('Unattended')
        expect(result).toBeInstanceOf(Array)
        testResults.push({ tool: 'uipath_get_licenses_runtime', status: 'passed', duration: Date.now() - startTime })
      } catch (error) {
        testResults.push({ tool: 'uipath_get_licenses_runtime', status: 'failed', message: String(error) })
      }
    })
  })

  describe('Tool 27: uipath_get_licenses_named_user', () => {
    it('should get named user licenses', async () => {
      const startTime = Date.now()
      try {
        const result = await client.getLicensesNamedUser('Attended')
        expect(result).toBeInstanceOf(Array)
        testResults.push({ tool: 'uipath_get_licenses_named_user', status: 'passed', duration: Date.now() - startTime })
      } catch (error) {
        testResults.push({ tool: 'uipath_get_licenses_named_user', status: 'failed', message: String(error) })
      }
    })
  })

  describe('Tool 28: uipath_get_count_stats', () => {
    it('should get count statistics', async () => {
      const startTime = Date.now()
      try {
        const result = await client.getCountStats()
        expect(result).toBeDefined()
        testResults.push({ tool: 'uipath_get_count_stats', status: 'passed', duration: Date.now() - startTime })
      } catch (error) {
        testResults.push({ tool: 'uipath_get_count_stats', status: 'failed', message: String(error) })
      }
    })
  })

  describe('Tool 29: uipath_get_sessions_stats', () => {
    it('should get sessions statistics', async () => {
      const startTime = Date.now()
      try {
        const result = await client.getSessionsStats()
        expect(result).toBeDefined()
        testResults.push({ tool: 'uipath_get_sessions_stats', status: 'passed', duration: Date.now() - startTime })
      } catch (error) {
        testResults.push({ tool: 'uipath_get_sessions_stats', status: 'failed', message: String(error) })
      }
    })
  })
})

// Export test results for reporting
export { testResults }
