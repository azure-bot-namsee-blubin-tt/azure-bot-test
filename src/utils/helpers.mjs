/**
 * Common Utility Functions
 * Shared helpers used across the application
 */

/**
 * Send typing indicator to show bot is processing
 * @param {object} context - Bot context
 */
export async function sendTyping(context) {
  await context.sendActivity({ type: 'typing' })
}

/**
 * Extract text from Atlassian Document Format (ADF)
 * @param {object} adf - ADF document
 * @returns {string} Plain text
 */
export function extractTextFromADF(adf) {
  if (!adf || !adf.content) return ''

  const extractText = (node) => {
    if (node.type === 'text') return node.text || ''
    if (node.content) return node.content.map(extractText).join('')
    return ''
  }

  return adf.content.map(extractText).join('\n').trim() || ''
}

/**
 * Format elapsed time for display
 * @param {number} startTime - Start timestamp (Date.now())
 * @returns {string} Formatted time (e.g., "3.2s" or "150ms")
 */
export function formatElapsedTime(startTime) {
  const elapsed = (Date.now() - startTime) / 1000
  return elapsed < 1 ? `${Math.round(elapsed * 1000)}ms` : `${elapsed.toFixed(1)}s`
}

/**
 * Create a typing animation interval
 * @param {object} context - Bot context
 * @param {number} intervalMs - Interval in milliseconds (default: 3000)
 * @returns {object} Object with stop() method
 */
export function createTypingAnimation(context, intervalMs = 3000) {
  sendTyping(context)
  const interval = setInterval(() => {
    sendTyping(context)
  }, intervalMs)

  return {
    stop: () => {
      if (interval) {
        clearInterval(interval)
      }
    }
  }
}

/**
 * Select item from list by number or key
 * @param {string} input - User input (number or key)
 * @param {Array} list - List of items
 * @param {string} keyField - Optional field to match by value
 * @returns {object|null} Selected item or null
 */
export function selectFromList(input, list, keyField = null) {
  if (!list?.length) return null

  // Try number selection (1-based)
  const idx = parseInt(input, 10) - 1
  if (idx >= 0 && idx < list.length) {
    return list[idx]
  }

  // Try key field match
  if (keyField) {
    return list.find(item =>
      item[keyField]?.toLowerCase() === input.toLowerCase()
    )
  }

  return null
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeHtml(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Truncate text to max length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
export function truncate(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text
  return text.substring(0, maxLength - 3) + '...'
}

/**
 * Delay execution
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise} Promise that resolves after delay
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} baseDelay - Base delay in ms (doubles each retry)
 * @returns {Promise} Result of function
 */
export async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const waitTime = Math.pow(2, attempt - 1) * baseDelay
        console.log(`⏳ Retry ${attempt}/${maxRetries} after ${waitTime}ms...`)
        await delay(waitTime)
      }
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt >= maxRetries) {
        throw error
      }
    }
  }
  throw lastError
}

/**
 * Get human-readable label for portal field types
 * @param {string} fieldType - Field type code
 * @returns {string} Human-readable label
 */
export function getFieldTypeLabel(fieldType) {
  const labels = {
    'text': 'Text',
    'textarea': 'Long Text',
    'select': 'Select One',
    'multiselect': 'Select Multiple',
    'date': 'Date',
    'datetime': 'Date & Time',
    'user': 'User',
    'number': 'Number',
    'attachment': 'Attachment',
    'array': 'List',
  }
  return labels[fieldType] || 'Text'
}

/**
 * Get human-readable label for ProForma form field types
 * @param {string} formType - Form field type code
 * @returns {string} Human-readable label
 */
export function getFormFieldTypeLabel(formType) {
  const labels = {
    'tl': 'Text',
    'rt': 'Rich Text',
    'cd': 'Dropdown',
    'cs': 'Checkbox',
    'rs': 'Radio',
    'dt': 'Date',
    'tm': 'Time',
    'us': 'User',
    'ml': 'Multi-line',
    'em': 'Email',
    'ur': 'URL',
    'nu': 'Number',
    'ph': 'Phone',
    'at': 'Attachment',
    'lb': 'Label',
    'hd': 'Hidden',
  }
  return labels[formType] || formType
}
