/**
 * Jira Service
 * Handles all Jira REST API interactions
 */
import { createBasicAuthClient } from '../common/services/index.mjs'

export class JiraService {
  /**
   * @param {Object} config - Service configuration
   * @param {string} config.baseUrl - Jira base URL
   * @param {string} config.email - User email
   * @param {string} config.apiToken - API token
   * @param {string} config.projectKey - Default project key
   */
  constructor(config) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.projectKey = config.projectKey

    this.client = createBasicAuthClient(
      `${this.baseUrl}/rest/api/3`,
      config.email,
      config.apiToken,
      {
        timeout: 30000,
        retries: 1,
      }
    )
  }

  /**
   * Create a new Jira ticket
   * @param {Object} input - Ticket data
   * @param {string} input.summary - Ticket title
   * @param {string} [input.description] - Ticket description
   * @param {string} [input.issueType] - Issue type (Task, Bug, Story, Epic)
   * @param {string} [input.priority] - Priority level
   * @returns {Promise<{id: string, key: string, self: string}>}
   */
  async createTicket(input) {
    const issueData = {
      fields: {
        project: { key: this.projectKey },
        summary: input.summary,
        description: input.description ? this._toADF(input.description) : undefined,
        issuetype: { name: input.issueType || 'Task' },
        ...(input.priority && { priority: { name: input.priority } }),
        ...(input.assignee && { assignee: { accountId: input.assignee } }),
        ...(input.labels?.length > 0 && { labels: input.labels }),
      },
    }

    return this.client.post('/issue', issueData)
  }

  /**
   * Get a specific issue by key
   * @param {string} issueKey - Issue key
   */
  async getIssue(issueKey) {
    return this.client.get(`/issue/${issueKey}`)
  }

  /**
   * Search issues using JQL
   * Uses the new /search/jql endpoint (migrated from deprecated /search)
   * @param {string} jql - JQL query
   * @param {number} [maxResults=10]
   */
  async searchIssues(jql, maxResults = 10) {
    return this.client.post('/search/jql', {
      jql,
      maxResults,
    })
  }

  /**
   * Get my recent issues
   * @param {number} [maxResults=10]
   */
  async getMyIssues(maxResults = 10) {
    const jql = `project = ${this.projectKey} AND assignee = currentUser() ORDER BY updated DESC`
    return this.searchIssues(jql, maxResults)
  }

  /**
   * Add a comment to an issue
   * @param {string} issueKey - Issue key
   * @param {string} comment - Comment text
   */
  async addComment(issueKey, comment) {
    return this.client.post(`/issue/${issueKey}/comment`, {
      body: this._toADF(comment),
    })
  }

  /**
   * Get project details
   */
  async getProject() {
    return this.client.get(`/project/${this.projectKey}`)
  }

  /**
   * Get available issue types for the project
   */
  async getIssueTypes() {
    const project = await this.getProject()
    return project.issueTypes
  }

  /**
   * Get the browse URL for a ticket
   * @param {string} issueKey - Issue key
   */
  getBrowseUrl(issueKey) {
    return `${this.baseUrl}/browse/${issueKey}`
  }

  /**
   * Convert plain text to Atlassian Document Format (ADF)
   * @param {string} text - Plain text
   * @returns {Object} ADF document
   */
  _toADF(text) {
    return {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: text,
            },
          ],
        },
      ],
    }
  }
}

/**
 * Create JiraService from environment variables
 */
export function createJiraServiceFromEnv() {
  const baseUrl = process.env.JIRA_BASE_URL
  const email = process.env.JIRA_EMAIL
  const apiToken = process.env.JIRA_API_TOKEN
  const projectKey = process.env.JIRA_PROJECT_KEY

  if (!baseUrl || !email || !apiToken || !projectKey) {
    throw new Error(
      'Missing Jira configuration. Please set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, and JIRA_PROJECT_KEY.'
    )
  }

  return new JiraService({ baseUrl, email, apiToken, projectKey })
}
