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

  // OpenTelemetry configuration
  telemetry: {
    enabled: process.env.OTEL_ENABLED !== 'false',
    serviceName: process.env.OTEL_SERVICE_NAME || 'azure-bot',
    serviceVersion: process.env.OTEL_SERVICE_VERSION || '1.0.0',
    environment: process.env.OTEL_ENVIRONMENT || 'development',
    otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318',
    metricExportInterval: parseInt(process.env.OTEL_METRIC_EXPORT_INTERVAL || '60000', 10),
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
