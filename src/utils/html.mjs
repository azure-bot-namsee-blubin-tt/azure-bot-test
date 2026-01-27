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
  requiredBold: '<span style="color:red"><b>*</b></span>',
}

export const DIVIDER = '━━━━━━━━━━━━━━━━━━━━'
export const HR = "<hr style='border: 0; border-top: 1px solid #000000;'>"

// ============================================
// Basic Components
// ============================================

/**
 * Create a header with optional subtitle
 */
export function header(title, subtitle = null) {
  const parts = ['<b>', title, '</b>']
  if (subtitle) {
    parts.push('<br/><i>', subtitle, '</i>')
  }
  return parts.join('')
}

/**
 * Create a step header with progress
 */
export function stepHeader(step, total, title, subtitle = null) {
  const parts = ['<b>Step ', step, '/', total, ': ', title, '</b>']
  if (subtitle) {
    parts.push('<br/><i>', subtitle, '</i>')
  }
  return parts.join('')
}

/**
 * Create a progress indicator
 */
export function progress(current, total) {
  return ['<i>[', current, '/', total, ']</i>'].join('')
}

/**
 * Create a divider line
 */
export function divider() {
  return [DIVIDER, '<br/>'].join('')
}

/**
 * Create italic text
 */
export function italic(text) {
  return ['<i>', text, '</i>'].join('')
}

/**
 * Create bold text
 */
export function bold(text) {
  return ['<b>', text, '</b>'].join('')
}

/**
 * Create code text
 */
export function code(text) {
  return ['<code>', text, '</code>'].join('')
}

/**
 * Create bold code text
 */
export function boldCode(text) {
  return ['<strong><code>', text, '</code></strong>'].join('')
}

/**
 * Create a link
 */
export function link(text, url) {
  return ['<a href="', url, '">', text, '</a>'].join('')
}

/**
 * Create a line break
 */
export function br(count = 1) {
  return '<br/>'.repeat(count)
}

// ============================================
// List Components
// ============================================

/**
 * Create a numbered list item
 */
export function numberedItem(index, text, description = null) {
  const parts = ['<b>', index, '.</b> ', text]
  if (description) {
    parts.push('<br/><i>   ', description, '</i>')
  }
  return parts.join('')
}

/**
 * Create a bullet list item
 */
export function bulletItem(text) {
  return ['• ', text].join('')
}

/**
 * Create a numbered list
 */
export function numberedList(items, formatter = (item, i) => item) {
  return items.map((item, i) => numberedItem(i + 1, formatter(item, i))).join('<br/>')
}

/**
 * Create a bullet list
 */
export function bulletList(items) {
  return items.map(item => bulletItem(item)).join('<br/>')
}

/**
 * Create a selection list with items
 */
export function selectionList(items, getLabel = item => item.name || item) {
  return items.map((item, i) => ['<b>', i + 1, '.</b> ', getLabel(item)].join('')).join('<br/>')
}

// ============================================
// Field Components
// ============================================

/**
 * Create a field label with optional required marker
 */
export function fieldLabel(name, required = false, extra = null) {
  const parts = ['<b>', name, '</b>']
  if (required) {
    parts.push(' ', ICONS.requiredBold)
  }
  if (extra) {
    parts.push(' <i>(', extra, ')</i>')
  }
  return parts.join('')
}

/**
 * Create a field value display
 */
export function fieldValue(label, value, required = false) {
  const reqMark = required ? ICONS.required : ''
  const displayValue = value || '(empty)'
  return ['• <b>', label, '</b>', reqMark, ': ', displayValue].join('')
}

/**
 * Create a field with type indicator
 */
export function fieldWithType(name, type, required = false) {
  const reqMark = required ? [' ', ICONS.required].join('') : ''
  return ['• ', name, reqMark, ' <i>(', type, ')</i>'].join('')
}

// ============================================
// Action Components
// ============================================

/**
 * Create an action hint
 */
export function actionHint(text) {
  return ['<i>', text, '</i>'].join('')
}

/**
 * Create action commands list
 */
export function actionCommands(commands) {
  return commands.map(([cmd, desc]) => [code(cmd), ' - ', desc].join('')).join('<br/>')
}

/**
 * Create footer with available commands
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
 * Create a success message
 */
export function successMessage(title, details = null) {
  const parts = ['<b>', ICONS.success, ' ', title, '</b>']
  if (details) {
    parts.push('<br/><br/>', details)
  }
  return parts.join('')
}

/**
 * Create an error message
 */
export function errorMessage(title, details = null, hint = null) {
  const parts = ['<b>', ICONS.error, ' ', title, '</b>']
  if (details) {
    parts.push('<br/>', details)
  }
  if (hint) {
    parts.push('<br/><br/>', italic(hint))
  }
  return parts.join('')
}

/**
 * Create a warning message
 */
export function warningMessage(text) {
  return [ICONS.warning, ' ', text].join('')
}

/**
 * Create an info message
 */
export function infoMessage(text) {
  return ['<i>', text, '</i>'].join('')
}

/**
 * Create elapsed time display
 */
export function elapsedTime(timeStr) {
  return ['<i style="color:gray">Completed in ', timeStr, '</i>'].join('')
}

/**
 * Create failed time display
 */
export function failedTime(timeStr) {
  return ['<i style="color:gray">Failed after ', timeStr, '</i>'].join('')
}

// ============================================
// Builder Pattern
// ============================================

/**
 * Message builder for complex messages
 */
export class MessageBuilder {
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
 * Create a new message builder
 */
export function createMessage() {
  return new MessageBuilder()
}