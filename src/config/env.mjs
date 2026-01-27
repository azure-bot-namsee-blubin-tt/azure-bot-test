/**
 * Environment configuration
 * Centralizes all environment variable access
 */
import 'dotenv/config'

export const config = {
  port: process.env.PORT || 3978,

  jira: {
    baseUrl: process.env.JIRA_BASE_URL,
    email: process.env.JIRA_EMAIL,
    apiToken: process.env.JIRA_API_TOKEN,
    projectKey: process.env.JIRA_PROJECT_KEY,
  },

  itsm: {
    baseUrl: process.env.JIRA_BASE_URL,
    email: process.env.JIRA_EMAIL,
    apiToken: process.env.JIRA_API_TOKEN,
  },

  bot: {
    clientId: process.env.clientId,
    clientSecret: process.env.clientSecret,
    tenantId: process.env.tenantId,
  },
}

/**
 * Validate required environment variables are set
 * @returns {boolean} True if all required variables are present, false otherwise
 */
export function validateConfig() {
  const required = ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN']
  const missing = required.filter(key => !process.env[key])

  if (missing.length > 0) {
    console.warn(`Warning: Missing environment variables: ${missing.join(', ')}`)
    return false
  }
  return true
}
