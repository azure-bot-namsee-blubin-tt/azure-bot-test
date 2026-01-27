/**
 * HTML Template Utilities
 * Reusable HTML components for bot messages
 */

// ============================================
// Constants
// ============================================

export const ICONS = {
  jira: '📋',
  itsm: '🛠️',
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
  loading: '⏳',
  back: '◀️',
  next: '▶️',
  check: '✓',
  required: '<span style="color:red">*</span>',
  requiredBold: '<span style="color:red"><strong>*</strong></span>',
}

export const DIVIDER = '━━━━━━━━━━━━━━━━━━━━'
export const HR = "<hr style='border: 0; border-top: 1px solid #000000;'>"

// ============================================
// Basic Components
// ============================================

/**
 * Create a header with optional subtitle
 * @param {string} title - Header title text
 * @param {string|null} [subtitle] - Optional subtitle text
 * @returns {string} Formatted HTML header string
 */
export function header(title, subtitle = null) {
  const parts = ['<strong>', title, '</strong>']
  if (subtitle) {
    parts.push('<br/><i>', subtitle, '</i>')
  }
  return parts.join('')
}

/**
 * Create a step header with progress indicator
 * @param {number} step - Current step number
 * @param {number} total - Total number of steps
 * @param {string} title - Step title text
 * @param {string|null} [subtitle] - Optional subtitle text
 * @returns {string} Formatted HTML step header
 */
export function stepHeader(step, total, title, subtitle = null) {
  const parts = ['<strong>Step ', step, '/', total, ': ', title, '</strong>']
  if (subtitle) {
    parts.push('<br/><i>', subtitle, '</i>')
  }
  return parts.join('')
}

/**
 * Create a progress indicator text
 * @param {number} current - Current position
 * @param {number} total - Total count
 * @returns {string} Formatted progress indicator (e.g., "[1/5]")
 */
export function progress(current, total) {
  return ['<i>[', current, '/', total, ']</i>'].join('')
}

/**
 * Create a divider line
 * @returns {string} HTML divider with line break
 */
export function divider() {
  return [DIVIDER, '<br/>'].join('')
}

/**
 * Create italic text
 * @param {string} text - Text to italicize
 * @returns {string} HTML italic text
 */
export function italic(text) {
  return ['<i>', text, '</i>'].join('')
}

/**
 * Create bold text
 * @param {string} text - Text to make bold
 * @returns {string} HTML bold text
 */
export function bold(text) {
  return ['<strong>', text, '</strong>'].join('')
}

/**
 * Create inline code text
 * @param {string} text - Text to format as code
 * @returns {string} HTML code text
 */
export function code(text) {
  return ['<code>', text, '</code>'].join('')
}

/**
 * Create bold code text
 * @param {string} text - Text to format as bold code
 * @returns {string} HTML bold code text
 */
export function boldCode(text) {
  return ['<strong><code>', text, '</code></strong>'].join('')
}

/**
 * Create a hyperlink
 * @param {string} text - Link display text
 * @param {string} url - Link URL
 * @returns {string} HTML anchor element
 */
export function link(text, url) {
  return ['<a href="', url, '">', text, '</a>'].join('')
}

/**
 * Create line break(s)
 * @param {number} [count=1] - Number of line breaks
 * @returns {string} HTML line break(s)
 */
export function br(count = 1) {
  return '<br/>'.repeat(count)
}

// ============================================
// List Components
// ============================================

/**
 * Create a numbered list item
 * @param {number} index - Item number (1-based)
 * @param {string} text - Item text
 * @param {string|null} [description] - Optional description
 * @returns {string} Formatted numbered item HTML
 */
export function numberedItem(index, text, description = null) {
  const parts = ['<strong>', index, '.</strong> ', text]
  if (description) {
    parts.push('<br/><i>   ', description, '</i>')
  }
  return parts.join('')
}

/**
 * Create a bullet list item
 * @param {string} text - Item text
 * @returns {string} Bullet item string
 */
export function bulletItem(text) {
  return ['• ', text].join('')
}

/**
 * Create a numbered list from items
 * @param {Array} items - Array of items to list
 * @param {function} [formatter] - Function to format each item (item, index) => string
 * @returns {string} Formatted numbered list HTML
 */
export function numberedList(items, formatter = (item, i) => item) {
  return items.map((item, i) => numberedItem(i + 1, formatter(item, i))).join('<br/>')
}

/**
 * Create a bullet list from items
 * @param {string[]} items - Array of item strings
 * @returns {string} Formatted bullet list HTML
 */
export function bulletList(items) {
  return items.map(item => bulletItem(item)).join('<br/>')
}

/**
 * Create a selection list with numbered items
 * @param {Array} items - Array of items to list
 * @param {function} [getLabel] - Function to get display label (item) => string
 * @returns {string} Formatted selection list HTML
 */
export function selectionList(items, getLabel = item => item.name || item) {
  return items.map((item, i) => ['<strong>', i + 1, '.</strong> ', getLabel(item)].join('')).join('<br/>')
}

// ============================================
// Field Components
// ============================================

/**
 * Create a field label with optional markers
 * @param {string} name - Field name
 * @param {boolean} [required=false] - Whether field is required
 * @param {string|null} [extra] - Extra info to display in parentheses
 * @returns {string} Formatted field label HTML
 */
export function fieldLabel(name, required = false, extra = null) {
  const parts = ['<strong>', name, '</strong>']
  if (required) {
    parts.push(' ', ICONS.requiredBold)
  }
  if (extra) {
    parts.push(' <i>(', extra, ')</i>')
  }
  return parts.join('')
}

/**
 * Create a field value display with label
 * @param {string} label - Field label
 * @param {string} value - Field value to display
 * @param {boolean} [required=false] - Whether field is required
 * @returns {string} Formatted field value HTML
 */
export function fieldValue(label, value, required = false) {
  const reqMark = required ? ICONS.required : ''
  const displayValue = value || '(empty)'
  return ['• <strong>', label, '</strong>', reqMark, ': ', displayValue].join('')
}

/**
 * Create a field display with type indicator
 * @param {string} name - Field name
 * @param {string} type - Field type label
 * @param {boolean} [required=false] - Whether field is required
 * @returns {string} Formatted field with type HTML
 */
export function fieldWithType(name, type, required = false) {
  const reqMark = required ? [' ', ICONS.required].join('') : ''
  return ['• ', name, reqMark, ' <i>(', type, ')</i>'].join('')
}

// ============================================
// Action Components
// ============================================

/**
 * Create an action hint in italic
 * @param {string} text - Hint text
 * @returns {string} Formatted hint HTML
 */
export function actionHint(text) {
  return ['<i>', text, '</i>'].join('')
}

/**
 * Create action commands list
 * @param {Array<[string, string]>} commands - Array of [command, description] pairs
 * @returns {string} Formatted commands list HTML
 */
export function actionCommands(commands) {
  return commands.map(([cmd, desc]) => [code(cmd), ' - ', desc].join('')).join('<br/>')
}

/**
 * Create footer with available commands
 * @param {Array<[string, string]>} commands - Array of [command, description] pairs
 * @param {string|null} [note] - Optional note text
 * @returns {string} Formatted footer HTML with divider and commands
 */
export function commandFooter(commands, note = null) {
  const parts = [divider(), actionCommands(commands)]
  if (note) {
    parts.push('<br/><br/>', italic(note))
  }
  return parts.join('')
}

// ============================================
// Message Templates
// ============================================

/**
 * Create a success message with icon
 * @param {string} title - Success message title
 * @param {string|null} [details] - Optional additional details
 * @returns {string} Formatted success message HTML
 */
export function successMessage(title, details = null) {
  const parts = ['<strong>', ICONS.success, ' ', title, '</strong>']
  if (details) {
    parts.push('<br/><br/>', details)
  }
  return parts.join('')
}

/**
 * Create an error message with icon
 * @param {string} title - Error message title
 * @param {string|null} [details] - Optional error details
 * @param {string|null} [hint] - Optional hint for resolution
 * @returns {string} Formatted error message HTML
 */
export function errorMessage(title, details = null, hint = null) {
  const parts = ['<strong>', ICONS.error, ' ', title, '</strong>']
  if (details) {
    parts.push('<br/>', details)
  }
  if (hint) {
    parts.push('<br/><br/>', italic(hint))
  }
  return parts.join('')
}

/**
 * Create a warning message with icon
 * @param {string} text - Warning message text
 * @returns {string} Formatted warning message
 */
export function warningMessage(text) {
  return [ICONS.warning, ' ', text].join('')
}

/**
 * Create an info message in italic
 * @param {string} text - Info message text
 * @returns {string} Formatted info message
 */
export function infoMessage(text) {
  return ['<i>', text, '</i>'].join('')
}

/**
 * Create elapsed time display for completed operations
 * @param {string} timeStr - Formatted time string
 * @returns {string} Formatted elapsed time HTML
 */
export function elapsedTime(timeStr) {
  return ['<i style="color:gray">Completed in ', timeStr, '</i>'].join('')
}

/**
 * Create failed time display for failed operations
 * @param {string} timeStr - Formatted time string
 * @returns {string} Formatted failed time HTML
 */
export function failedTime(timeStr) {
  return ['<i style="color:gray">Failed after ', timeStr, '</i>'].join('')
}

// ============================================
// Builder Pattern
// ============================================

/**
 * Message builder for constructing complex HTML messages
 * Uses fluent interface pattern for chaining method calls
 */
export class MessageBuilder {
  /**
   * Create a new MessageBuilder
   */
  constructor() {
    this.parts = []
  }

  add(content) {
    this.parts.push(content)
    return this
  }

  addLine(content = '') {
    this.parts.push([content, '<br/>'].join(''))
    return this
  }

  addHeader(title, subtitle) {
    this.parts.push([header(title, subtitle), '<br/>'].join(''))
    return this
  }

  addStepHeader(step, total, title, subtitle) {
    this.parts.push([stepHeader(step, total, title, subtitle), '<br/>'].join(''))
    return this
  }

  addDivider() {
    this.parts.push(divider())
    return this
  }

  addList(items, formatter) {
    this.parts.push([numberedList(items, formatter), '<br/>'].join(''))
    return this
  }

  addBulletList(items) {
    this.parts.push([bulletList(items), '<br/>'].join(''))
    return this
  }

  addField(label, value, required) {
    this.parts.push([fieldValue(label, value, required), '<br/>'].join(''))
    return this
  }

  addCommands(commands) {
    this.parts.push(actionCommands(commands))
    return this
  }

  addNote(text) {
    this.parts.push([italic(text), '<br/>'].join(''))
    return this
  }

  addBreak(count = 1) {
    this.parts.push(br(count))
    return this
  }

  build() {
    return this.parts.join('')
  }
}

/**
 * Create a new message builder instance
 * @returns {MessageBuilder} New MessageBuilder instance
 */
export function createMessage() {
  return new MessageBuilder()
}