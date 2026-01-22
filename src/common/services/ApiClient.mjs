/**
 * Base API Client
 * Provides common HTTP request functionality with retry, timeout, and error handling
 */
import { ApiError } from './errors/ApiError.mjs'

/**
 * @typedef {Object} RequestConfig
 * @property {string} [method='GET'] - HTTP method
 * @property {Object} [headers] - Additional headers
 * @property {Object|string} [body] - Request body
 * @property {number} [timeout=30000] - Timeout in milliseconds
 * @property {number} [retries=0] - Number of retry attempts
 * @property {number} [retryDelay=1000] - Base delay between retries in ms
 * @property {boolean} [retryOnServerError=true] - Whether to retry on 5xx errors
 */

/**
 * @typedef {Object} ApiClientConfig
 * @property {string} baseUrl - Base URL for all requests
 * @property {Object} [defaultHeaders] - Default headers for all requests
 * @property {number} [timeout=30000] - Default timeout in milliseconds
 * @property {number} [retries=0] - Default number of retries
 * @property {Function} [onRequest] - Request interceptor
 * @property {Function} [onResponse] - Response interceptor
 * @property {Function} [onError] - Error interceptor
 */

export class ApiClient {
  /**
   * @param {ApiClientConfig} config
   */
  constructor(config) {
    this.baseUrl = config.baseUrl?.replace(/\/$/, '') || ''
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...config.defaultHeaders,
    }
    this.timeout = config.timeout ?? 30000
    this.retries = config.retries ?? 0
    this.onRequest = config.onRequest
    this.onResponse = config.onResponse
    this.onError = config.onError
  }

  /**
   * Make an HTTP request
   * @param {string} endpoint - API endpoint (relative to baseUrl)
   * @param {RequestConfig} [config] - Request configuration
   * @returns {Promise<any>} Response data
   */
  async request(endpoint, config = {}) {
    const {
      method = 'GET',
      headers = {},
      body,
      timeout = this.timeout,
      retries = this.retries,
      retryDelay = 1000,
      retryOnServerError = true,
    } = config

    const url = this._buildUrl(endpoint)
    const requestOptions = this._buildRequestOptions(method, headers, body)

    // Debug logging
    console.log(`[ApiClient] ${method} ${url}`)
    console.log(`[ApiClient] Headers:`, JSON.stringify(requestOptions.headers, null, 2))
    if (requestOptions.body) {
      console.log(`[ApiClient] Body:`, requestOptions.body.substring(0, 500))
    }

    if (this.onRequest) {
      await this.onRequest({ url, ...requestOptions })
    }

    let lastError
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Wait before retry (exponential backoff)
        if (attempt > 0) {
          const delay = Math.pow(2, attempt - 1) * retryDelay
          console.log(`Retry ${attempt}/${retries} after ${delay}ms...`)
          await this._delay(delay)
        }

        const response = await this._fetchWithTimeout(url, requestOptions, timeout)
        const data = await this._handleResponse(response, endpoint, method)

        // Call response interceptor
        if (this.onResponse) {
          await this.onResponse({ url, data, response })
        }

        return data

      } catch (error) {
        lastError = error instanceof ApiError ? error : this._wrapError(error, endpoint, method)

        // Call error interceptor
        if (this.onError) {
          await this.onError(lastError)
        }

        // Check if we should retry
        const shouldRetry = attempt < retries &&
                           (lastError.isRetryable?.() ||
                            (retryOnServerError && lastError.isServerError?.()))

        if (!shouldRetry) {
          throw lastError
        }

        console.log(`${lastError.title} (${lastError.status}), will retry...`)
      }
    }

    throw lastError
  }

  /**
   * HTTP GET request
   */
  async get(endpoint, config = {}) {
    return this.request(endpoint, { ...config, method: 'GET' })
  }

  /**
   * HTTP POST request
   */
  async post(endpoint, data, config = {}) {
    return this.request(endpoint, {
      ...config,
      method: 'POST',
      body: data,
    })
  }

  /**
   * HTTP PUT request
   */
  async put(endpoint, data, config = {}) {
    return this.request(endpoint, {
      ...config,
      method: 'PUT',
      body: data,
    })
  }

  /**
   * HTTP PATCH request
   */
  async patch(endpoint, data, config = {}) {
    return this.request(endpoint, {
      ...config,
      method: 'PATCH',
      body: data,
    })
  }

  /**
   * HTTP DELETE request
   */
  async delete(endpoint, config = {}) {
    return this.request(endpoint, { ...config, method: 'DELETE' })
  }

  _buildUrl(endpoint) {
    if (endpoint.startsWith('http')) {
      return endpoint
    }
    return `${this.baseUrl}${endpoint}`
  }

  _buildRequestOptions(method, headers, body) {
    const options = {
      method: method.toUpperCase(),
      headers: {
        ...this.defaultHeaders,
        ...headers,
      },
    }

    if (body && method !== 'GET') {
      if (body instanceof FormData) {
        delete options.headers['Content-Type']
        options.body = body
      } else if (typeof body === 'object') {
        options.body = JSON.stringify(body)
      } else {
        options.body = body
      }
    }

    return options
  }

  async _fetchWithTimeout(url, options, timeout) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      })
      return response
    } catch (error) {
      console.error(`[ApiClient] Error: ${error.name} - ${error.message}`)
      if (error.name === 'AbortError') {
        throw ApiError.timeout(url, options.method, timeout)
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  async _handleResponse(response, endpoint, method) {
    if (!response.ok) {
      throw await ApiError.fromResponse(response, endpoint, method)
    }

    const text = await response.text()
    if (!text) {
      return {}
    }

    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }

  _wrapError(error, endpoint, method) {
    if (error instanceof ApiError) {
      return error
    }

    return ApiError.networkError(endpoint, method, error)
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

/**
 * Create API client with Basic Auth
 * @param {string} baseUrl - Base URL
 * @param {string} email - Email for auth
 * @param {string} apiToken - API token
 * @param {Object} [options] - Additional options
 */
export function createBasicAuthClient(baseUrl, email, apiToken, options = {}) {
  const credentials = Buffer.from(`${email}:${apiToken}`).toString('base64')

  return new ApiClient({
    baseUrl,
    defaultHeaders: {
      'Authorization': `Basic ${credentials}`,
      ...options.headers,
    },
    timeout: options.timeout,
    retries: options.retries,
    onRequest: options.onRequest,
    onResponse: options.onResponse,
    onError: options.onError,
  })
}

/**
 * Create API client with Bearer token
 * @param {string} baseUrl - Base URL
 * @param {string} token - Bearer token
 * @param {Object} [options] - Additional options
 */
export function createBearerAuthClient(baseUrl, token, options = {}) {
  return new ApiClient({
    baseUrl,
    defaultHeaders: {
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
    timeout: options.timeout,
    retries: options.retries,
    onRequest: options.onRequest,
    onResponse: options.onResponse,
    onError: options.onError,
  })
}

export default ApiClient
