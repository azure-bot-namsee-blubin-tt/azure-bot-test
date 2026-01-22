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
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword,
    tenantId: process.env.MicrosoftAppTenantId,
    appType: process.env.MicrosoftAppType || 'SingleTenant',
  },
}

/**
 * Validate required environment variables
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
