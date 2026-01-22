/**
 * Custom API Error Class
 * Provides structured error information for API failures
 */
export class ApiError extends Error {
  /**
   * @param {Object} options - Error options
   * @param {number} [options.status] - HTTP status code
   * @param {string} [options.statusCode] - Status code as string
   * @param {string} [options.title] - Error title
   * @param {string} [options.detail] - Error detail message
   * @param {string[]} [options.fieldErrors] - Field-specific errors
   * @param {string} [options.endpoint] - API endpoint that failed
   * @param {string} [options.method] - HTTP method used
   * @param {Object} [options.originalError] - Original error object
   */
  constructor({
    status,
    statusCode,
    title = 'API Error',
    detail = 'An unknown error occurred',
    fieldErrors = [],
    endpoint,
    method,
    originalError,
  } = {}) {
    const message = fieldErrors.length > 0 ? fieldErrors[0] : detail
    super(message)

    this.name = 'ApiError'
    this.status = status ?? (statusCode ? parseInt(statusCode, 10) : 500)
    this.title = title
    this.detail = detail
    this.fieldErrors = fieldErrors
    this.endpoint = endpoint
    this.method = method
    this.originalError = originalError
    this.timestamp = new Date().toISOString()

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError)
    }
  }

  /**
   * Check if error is a client error (4xx)
   */
  isClientError() {
    return this.status >= 400 && this.status < 500
  }

  /**
   * Check if error is a server error (5xx)
   */
  isServerError() {
    return this.status >= 500
  }

  /**
   * Check if error is retryable
   */
  isRetryable() {
    // Retry on server errors, timeout, and network errors
    return this.isServerError() ||
           this.status === 408 ||
           this.status === 429 ||
           this.name === 'AbortError'
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage() {
    if (this.status === 401) return 'Authentication failed. Please check your credentials.'
    if (this.status === 403) return 'You do not have permission to perform this action.'
    if (this.status === 404) return 'The requested resource was not found.'
    if (this.status === 408) return 'Request timed out. Please try again.'
    if (this.status === 429) return 'Too many requests. Please wait and try again.'
    if (this.status >= 500) return 'Server error. Please try again later.'
    return this.detail || this.message
  }

  /**
   * Convert to plain object for logging
   */
  toJSON() {
    return {
      name: this.name,
      status: this.status,
      title: this.title,
      detail: this.detail,
      message: this.message,
      fieldErrors: this.fieldErrors,
      endpoint: this.endpoint,
      method: this.method,
      timestamp: this.timestamp,
    }
  }

  /**
   * Create from fetch response
   * @param {Response} response - Fetch response
   * @param {string} [endpoint] - API endpoint
   * @param {string} [method] - HTTP method
   */
  static async fromResponse(response, endpoint, method) {
    let detail = `HTTP ${response.status}`
    let title = response.statusText || 'Request Failed'
    let fieldErrors = []

    try {
      const text = await response.text()
      if (text) {
        const json = JSON.parse(text)

        detail = json.errorMessage ||
                 json.message ||
                 json.detail ||
                 json.errorMessages?.join(', ') ||
                 Object.values(json.errors || {}).join(', ') ||
                 text

        title = json.title || json.error || title
        fieldErrors = json.fieldErrors || json.errors || []

        if (typeof fieldErrors === 'object' && !Array.isArray(fieldErrors)) {
          fieldErrors = Object.entries(fieldErrors).map(([k, v]) => `${k}: ${v}`)
        }
      }
    } catch {
      
    }

    return new ApiError({
      status: response.status,
      title,
      detail,
      fieldErrors,
      endpoint,
      method,
    })
  }

  /**
   * Create timeout error
   */
  static timeout(endpoint, method, timeoutMs) {
    return new ApiError({
      status: 408,
      title: 'Request Timeout',
      detail: `Request timed out after ${timeoutMs / 1000}s`,
      endpoint,
      method,
    })
  }

  /**
   * Create network error
   */
  static networkError(endpoint, method, originalError) {
    return new ApiError({
      status: 0,
      title: 'Network Error',
      detail: 'Unable to connect to the server',
      endpoint,
      method,
      originalError,
    })
  }
}

export default ApiError
