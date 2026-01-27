/**
 * OpenTelemetry Configuration
 * Initializes tracing, metrics, and logging for the application
 * 
 * IMPORTANT: This file must be imported before any other application code
 */
import sdkNode from '@opentelemetry/sdk-node'
import autoInstrumentations from '@opentelemetry/auto-instrumentations-node'
import traceExporterPkg from '@opentelemetry/exporter-trace-otlp-http'
import metricExporterPkg from '@opentelemetry/exporter-metrics-otlp-http'
import logExporterPkg from '@opentelemetry/exporter-logs-otlp-http'
import sdkMetrics from '@opentelemetry/sdk-metrics'
import sdkLogs from '@opentelemetry/sdk-logs'
import resourcesPkg from '@opentelemetry/resources'
import api from '@opentelemetry/api'
import apiLogs from '@opentelemetry/api-logs'

// Extract named exports from CommonJS modules
const { NodeSDK } = sdkNode
const { getNodeAutoInstrumentations } = autoInstrumentations
const { OTLPTraceExporter } = traceExporterPkg
const { OTLPMetricExporter } = metricExporterPkg
const { OTLPLogExporter } = logExporterPkg
const { PeriodicExportingMetricReader } = sdkMetrics
const { BatchLogRecordProcessor } = sdkLogs
const { resourceFromAttributes } = resourcesPkg
const { trace, metrics, SpanStatusCode, context, propagation } = api
const { logs, SeverityNumber } = apiLogs

// Load environment variables
import 'dotenv/config'

// Semantic convention attribute keys (using string literals for compatibility)
const ATTR_SERVICE_NAME = 'service.name'
const ATTR_SERVICE_VERSION = 'service.version'
const ATTR_DEPLOYMENT_ENVIRONMENT = 'deployment.environment'

// Configuration from environment
const config = {
  serviceName: process.env.OTEL_SERVICE_NAME || 'azure-bot',
  serviceVersion: process.env.OTEL_SERVICE_VERSION || '1.0.0',
  environment: process.env.OTEL_ENVIRONMENT || 'development',
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318',
  enabled: process.env.OTEL_ENABLED !== 'false',
  consoleExport: process.env.OTEL_CONSOLE_EXPORT === 'true',
  metricExportInterval: parseInt(process.env.OTEL_METRIC_EXPORT_INTERVAL || '60000', 10),
}

// Create resource identifying this service
const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: config.serviceName,
  [ATTR_SERVICE_VERSION]: config.serviceVersion,
  [ATTR_DEPLOYMENT_ENVIRONMENT]: config.environment,
})

// Initialize exporters
const traceExporter = new OTLPTraceExporter({
  url: `${config.otlpEndpoint}/v1/traces`,
})

const metricExporter = new OTLPMetricExporter({
  url: `${config.otlpEndpoint}/v1/metrics`,
})

const logExporter = new OTLPLogExporter({
  url: `${config.otlpEndpoint}/v1/logs`,
})

// Metric reader with periodic export
const metricReader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: config.metricExportInterval,
})

// Log processor
const logProcessor = new BatchLogRecordProcessor(logExporter)

// Initialize the SDK
const sdk = new NodeSDK({
  resource,
  traceExporter,
  metricReader,
  logRecordProcessor: logProcessor,
  instrumentations: [
    getNodeAutoInstrumentations({
      // Disable fs instrumentation to reduce noise
      '@opentelemetry/instrumentation-fs': { enabled: false },
      // Configure HTTP instrumentation
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingPaths: ['/health'],
      },
    }),
  ],
})

// Start the SDK
if (config.enabled) {
  try {
    sdk.start()
    console.log(`[OpenTelemetry] Initialized for ${config.serviceName} (${config.environment})`)
    console.log(`[OpenTelemetry] Exporting to ${config.otlpEndpoint}`)
  } catch (error) {
    console.error('[OpenTelemetry] Failed to initialize:', error)
  }
} else {
  console.log('[OpenTelemetry] Disabled via OTEL_ENABLED=false')
}

// Graceful shutdown
const shutdown = async () => {
  try {
    await sdk.shutdown()
    console.log('[OpenTelemetry] SDK shut down successfully')
  } catch (error) {
    console.error('[OpenTelemetry] Error shutting down SDK:', error)
  }
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

// ============================================================================
// Telemetry Helpers
// ============================================================================

/**
 * Get a tracer for creating spans
 * @param {string} [name] - Tracer name (defaults to service name)
 * @returns {import('@opentelemetry/api').Tracer}
 */
export function getTracer(name = config.serviceName) {
  return trace.getTracer(name, config.serviceVersion)
}

/**
 * Get a meter for creating metrics
 * @param {string} [name] - Meter name (defaults to service name)
 * @returns {import('@opentelemetry/api').Meter}
 */
export function getMeter(name = config.serviceName) {
  return metrics.getMeter(name, config.serviceVersion)
}

/**
 * Get a logger for creating log records
 * @param {string} [name] - Logger name (defaults to service name)
 * @returns {import('@opentelemetry/api-logs').Logger}
 */
export function getLogger(name = config.serviceName) {
  return logs.getLogger(name, config.serviceVersion)
}

/**
 * Create a span and execute a function within it
 * @param {string} name - Span name
 * @param {Function} fn - Function to execute
 * @param {Object} [attributes] - Span attributes
 * @returns {Promise<any>} Result of the function
 */
export async function withSpan(name, fn, attributes = {}) {
  const tracer = getTracer()
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn(span)
      span.setStatus({ code: SpanStatusCode.OK })
      return result
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      })
      span.recordException(error)
      throw error
    } finally {
      span.end()
    }
  })
}

/**
 * Record an error in the current span
 * @param {Error} error - Error to record
 */
export function recordError(error) {
  const span = trace.getActiveSpan()
  if (span) {
    span.recordException(error)
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    })
  }
}

/**
 * Add attributes to the current span
 * @param {Object} attributes - Attributes to add
 */
export function addSpanAttributes(attributes) {
  const span = trace.getActiveSpan()
  if (span) {
    span.setAttributes(attributes)
  }
}

/**
 * Log a message with OpenTelemetry
 * @param {string} message - Log message
 * @param {'INFO'|'WARN'|'ERROR'|'DEBUG'} [level='INFO'] - Log level
 * @param {Object} [attributes] - Additional attributes
 */
export function log(message, level = 'INFO', attributes = {}) {
  const logger = getLogger()
  const severityMap = {
    DEBUG: SeverityNumber.DEBUG,
    INFO: SeverityNumber.INFO,
    WARN: SeverityNumber.WARN,
    ERROR: SeverityNumber.ERROR,
  }

  logger.emit({
    severityNumber: severityMap[level] || SeverityNumber.INFO,
    severityText: level,
    body: message,
    attributes,
  })
}

// ============================================================================
// Pre-configured Metrics
// ============================================================================

const meter = getMeter()

// Bot metrics
export const botMetrics = {
  // Counter for messages received
  messagesReceived: meter.createCounter('bot.messages.received', {
    description: 'Number of messages received by the bot',
    unit: '1',
  }),

  // Counter for messages sent
  messagesSent: meter.createCounter('bot.messages.sent', {
    description: 'Number of messages sent by the bot',
    unit: '1',
  }),

  // Counter for commands executed
  commandsExecuted: meter.createCounter('bot.commands.executed', {
    description: 'Number of commands executed',
    unit: '1',
  }),

  // Counter for errors
  errors: meter.createCounter('bot.errors', {
    description: 'Number of errors encountered',
    unit: '1',
  }),

  // Histogram for message processing duration
  messageProcessingDuration: meter.createHistogram('bot.message.processing.duration', {
    description: 'Time taken to process messages',
    unit: 'ms',
  }),
}

// API metrics
export const apiMetrics = {
  // Counter for API requests
  requests: meter.createCounter('api.requests', {
    description: 'Number of API requests made',
    unit: '1',
  }),

  // Counter for API errors
  errors: meter.createCounter('api.errors', {
    description: 'Number of API errors',
    unit: '1',
  }),

  // Histogram for API request duration
  requestDuration: meter.createHistogram('api.request.duration', {
    description: 'API request duration',
    unit: 'ms',
  }),
}

// Jira-specific metrics
export const jiraMetrics = {
  ticketsCreated: meter.createCounter('jira.tickets.created', {
    description: 'Number of Jira tickets created',
    unit: '1',
  }),

  ticketsViewed: meter.createCounter('jira.tickets.viewed', {
    description: 'Number of Jira tickets viewed',
    unit: '1',
  }),

  searchesPerformed: meter.createCounter('jira.searches.performed', {
    description: 'Number of Jira searches performed',
    unit: '1',
  }),
}

// ITSM-specific metrics
export const itsmMetrics = {
  requestsCreated: meter.createCounter('itsm.requests.created', {
    description: 'Number of ITSM requests created',
    unit: '1',
  }),

  formsSubmitted: meter.createCounter('itsm.forms.submitted', {
    description: 'Number of ITSM forms submitted',
    unit: '1',
  }),
}

// Export utilities
export {
  trace,
  metrics,
  context,
  propagation,
  SpanStatusCode,
  SeverityNumber,
}

export default sdk
