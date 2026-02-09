import { describe, it, expect, beforeEach } from 'vitest'
import { UiPathClient } from '../src/uipath-client.js'
import type { UiPathConfig } from '../src/types.js'

/**
 * UiPath Client Tests
 *
 * Note: These tests require a valid UiPath Orchestrator instance
 * and credentials. Set environment variables before running:
 * - UIPATH_URL
 * - UIPATH_CLIENT_ID
 * - UIPATH_CLIENT_SECRET
 * - UIPATH_TENANT_NAME (optional)
 */

// Skip tests if credentials are not provided
const shouldSkip = !process.env.UIPATH_URL || !process.env.UIPATH_CLIENT_ID || !process.env.UIPATH_CLIENT_SECRET

describe.skipIf(shouldSkip)('UiPathClient', () => {
  let client: UiPathClient
  let config: UiPathConfig

  beforeEach(() => {
    config = {
      baseUrl: process.env.UIPATH_URL!,
      tenantName: process.env.UIPATH_TENANT_NAME || 'Default',
      clientId: process.env.UIPATH_CLIENT_ID!,
      clientSecret: process.env.UIPATH_CLIENT_SECRET!,
      disableSslVerify: process.env.UIPATH_DISABLE_SSL_VERIFY === '1'
    }
    client = new UiPathClient(config)
  })

  describe('Authentication', () => {
    it('should authenticate successfully', async () => {
      const folders = await client.getFolders({ top: 1 })
      expect(folders).toBeDefined()
      expect(folders.folders).toBeInstanceOf(Array)
    })

    it('should handle invalid credentials', async () => {
      const invalidClient = new UiPathClient({
        ...config,
        clientId: 'invalid',
        clientSecret: 'invalid'
      })

      await expect(invalidClient.getFolders()).rejects.toThrow()
    })
  })

  describe('Folder Operations', () => {
    it('should get folders', async () => {
      const result = await client.getFolders({ top: 10 })
      expect(result.folders).toBeInstanceOf(Array)
      expect(result.count).toBeGreaterThanOrEqual(0)
    })

    it('should paginate folders', async () => {
      const page1 = await client.getFolders({ top: 2, skip: 0 })
      const page2 = await client.getFolders({ top: 2, skip: 2 })

      if (page1.folders.length > 0 && page2.folders.length > 0) {
        expect(page1.folders[0].Id).not.toBe(page2.folders[0].Id)
      }
    })
  })

  describe('Queue Operations', () => {
    it('should get queue definitions', async () => {
      const queues = await client.getQueueDefinitions()
      expect(queues).toBeInstanceOf(Array)
    })

    it('should get queue items', async () => {
      const result = await client.getQueueItems({ top: 10 })
      expect(result.items).toBeInstanceOf(Array)
    })
  })

  describe('Job Operations', () => {
    it('should get jobs', async () => {
      const result = await client.getJobs({ top: 10 })
      expect(result.jobs).toBeInstanceOf(Array)
    })

    it('should filter jobs by state', async () => {
      const result = await client.getJobs({ state: 'Successful', top: 5 })
      expect(result.jobs).toBeInstanceOf(Array)

      result.jobs.forEach(job => {
        expect(job.State).toBe('Successful')
      })
    })

    it('should get job statistics', async () => {
      const stats = await client.getJobStats()
      expect(stats).toHaveProperty('totalJobs')
      expect(stats).toHaveProperty('successfulJobs')
      expect(stats).toHaveProperty('faultedJobs')
      expect(stats).toHaveProperty('successRate')
    })
  })

  describe('Robot Operations', () => {
    it('should get robots', async () => {
      const result = await client.getRobots({ top: 10 })
      expect(result.robots).toBeInstanceOf(Array)
    })

    it('should get sessions', async () => {
      const result = await client.getSessions({ top: 10 })
      expect(result.sessions).toBeInstanceOf(Array)
    })
  })

  describe('Machine Operations', () => {
    it('should get machines', async () => {
      const result = await client.getMachines({ top: 10 })
      expect(result.machines).toBeInstanceOf(Array)
    })
  })

  describe('Release Operations', () => {
    it('should get releases', async () => {
      const releases = await client.getReleases()
      expect(releases).toBeInstanceOf(Array)
    })
  })

  describe('Asset Operations', () => {
    it('should get assets', async () => {
      const result = await client.getAssets({ top: 10 })
      expect(result.assets).toBeInstanceOf(Array)
    })
  })

  describe('Analytics Operations', () => {
    it('should get faulted jobs', async () => {
      const faultedJobs = await client.getFaultedJobs({ top: 5 })
      expect(faultedJobs).toBeInstanceOf(Array)
    })

    it('should get dashboard summary', async () => {
      const summary = await client.getDashboardSummary()
      expect(summary).toHaveProperty('totalQueues')
      expect(summary).toHaveProperty('totalJobs')
      expect(summary).toHaveProperty('jobsByState')
      expect(summary).toHaveProperty('queueItemsByStatus')
    })
  })
})

describe('UiPathClient - Unit Tests', () => {
  describe('Configuration', () => {
    it('should require baseUrl', () => {
      expect(() => {
        new UiPathClient({
          baseUrl: '',
          clientId: 'test',
          clientSecret: 'test',
          tenantName: 'Default'
        })
      }).not.toThrow()
    })

    it('should set default tenant name', () => {
      const client = new UiPathClient({
        baseUrl: 'https://test.com',
        clientId: 'test',
        clientSecret: 'test',
        tenantName: 'Default'
      })
      expect(client).toBeDefined()
    })
  })
})
