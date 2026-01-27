/**
 * ITSM Display Utilities
 * Handles formatting and displaying ITSM-related messages
 */
import {
  sendTyping,
  getFieldTypeLabel,
  getFormFieldTypeLabel,
  createMessage,
  ICONS,
  bold,
  italic,
  code,
  fieldWithType,
  selectionList,
} from '../../utils/index.mjs'

// ============================================
// Service Desk Selection
// ============================================

/**
 * Display service desk selection menu
 * @param {object} context - Turn context from bot framework
 * @param {object} state - Conversation state containing service desks
 * @returns {Promise<void>}
 */
export async function showServiceDesks(context, state) {
  const msg = createMessage()
    .addHeader('Create ITSM Request')
    .addBreak()
    .addStepHeader(1, 5, 'Select Service Desk')
    .addBreak()
    .add(selectionList(state.serviceDesks, d => `${d.projectName} (${d.projectKey})`))
    .addBreak(2)
    .addNote(`Type number to select. ${code('cancel')} to abort.`)
    .build()

  await context.sendActivity(msg)
}

// ============================================
// Portal Groups Selection
// ============================================

/**
 * Display portal groups selection menu
 * @param {object} context - Turn context from bot framework
 * @param {object} state - Conversation state containing portal groups and selected service desk
 * @returns {Promise<void>}
 */
export async function showPortalGroups(context, state) {
  const msg = createMessage()
    .addStepHeader(2, 5, 'Contact us about', `Service Desk: ${state.selectedServiceDesk.projectName}`)
    .addBreak()
    .add(selectionList(state.portalGroups, g => g.name))
    .addBreak(2)
    .addNote(`Type number to select. ${code('back')} to go back.`)
    .build()

  await context.sendActivity(msg)
}

// ============================================
// Request Types Selection
// ============================================

/**
 * Display request types selection menu with field information
 * @param {object} context - Turn context from bot framework
 * @param {object} state - Conversation state containing filtered request types
 * @param {object} itsmService - ITSM service instance for fetching fields
 * @returns {Promise<void>}
 */
export async function showRequestTypes(context, state, itsmService) {
  const types = state.filteredRequestTypes || []

  const msg = createMessage()
    .addStepHeader(3, 5, 'What can we help you with?', `Category: ${state.selectedPortalGroup.name}`)
    .addBreak()

  if (types.length === 0) {
    msg.addNote('No request types available for this category.')
  } else {
    await sendTyping(context)

    // Fetch fields and forms in parallel
    const [allFields, allForms] = await fetchFieldsAndForms(types, state, itsmService)

    // Cache results
    state.requestTypeFieldsCache = {}
    state.requestTypeFormsCache = {}

    for (let i = 0; i < types.length; i++) {
      const t = types[i]
      const fields = allFields[i]
      const formTemplate = allForms[i]

      state.requestTypeFieldsCache[t.id] = fields
      state.requestTypeFormsCache[t.id] = formTemplate

      msg.add(formatRequestTypeItem(i + 1, t, fields, formTemplate, itsmService))
      msg.addBreak()
    }
  }

  msg.addNote(`Type number to select. ${code('back')} to go back.`)
    .addLine(`${ICONS.required} = Required field`)

  await context.sendActivity(msg.build())
}

/**
 * Fetch fields and forms for all request types in parallel
 * @param {object[]} types - Array of request types
 * @param {object} state - Conversation state with selected service desk
 * @param {object} itsmService - ITSM service instance
 * @returns {Promise<[object[][], object[]]>} Tuple of [fields arrays, form templates]
 */
async function fetchFieldsAndForms(types, state, itsmService) {
  try {
    const fieldsPromises = types.map(t =>
      itsmService.getPortalFields(state.selectedServiceDesk.id, t.id).catch(() => [])
    )
    const formsPromises = types.map(t =>
      itsmService.getRequestTypeForm(state.selectedServiceDesk.id, t.id).catch(() => null)
    )

    return await Promise.all([
      Promise.all(fieldsPromises),
      Promise.all(formsPromises),
    ])
  } catch (error) {
    console.error('Error fetching fields/forms:', error)
    return [[], []]
  }
}

/**
 * Format a single request type item with its fields for display
 * @param {number} index - 1-based index for display
 * @param {object} type - Request type object
 * @param {object[]} fields - Portal fields for the request type
 * @param {object|null} formTemplate - Form template if available
 * @param {object} itsmService - ITSM service instance
 * @returns {string} Formatted HTML string for the request type
 */
function formatRequestTypeItem(index, type, fields, formTemplate, itsmService) {
  const parts = [`${bold(`${index}. ${type.name}`)}<br/>`]

  if (type.description) {
    parts.push(`${italic(`   ${type.description}`)}<br/>`)
  }

  if (fields.length > 0) {
    parts.push(`   ${bold('Standard fields:')}<br/>`)
    fields.forEach(f => {
      const fieldType = itsmService.getFieldType(f)
      parts.push(`   ${fieldWithType(f.name, fieldType, f.required)}<br/>`)
    })
  }

  if (formTemplate) {
    const formQuestions = itsmService.extractFormQuestions(formTemplate)
    if (formQuestions.length > 0) {
      const uniqueFields = getUniqueFields(formQuestions)
      parts.push(`   ${bold(`Form: ${formTemplate.name || 'Attached Form'}`)}<br/>`)
      uniqueFields.forEach(q => {
        const typeLabel = getFormFieldTypeLabel(q.type)
        parts.push(`   ${fieldWithType(q.label, typeLabel, q.required)}<br/>`)
      })
    }
  }

  if (fields.length === 0 && !formTemplate) {
    parts.push(`   ${italic('No fields found')}<br/>`)
  }

  return parts.join('')
}

/**
 * Filter form questions to get unique fields by label
 * @param {object[]} formQuestions - Array of form question objects
 * @returns {object[]} Unique form questions
 */
function getUniqueFields(formQuestions) {
  const seen = new Set()
  return formQuestions.filter(q => {
    if (seen.has(q.label)) return false
    seen.add(q.label)
    return true
  })
}

// ============================================
// Form Overview
// ============================================

/**
 * Display form overview with list of fields to fill
 * @param {object} context - Turn context from bot framework
 * @param {object} state - Conversation state with field collection
 * @param {object} itsmService - ITSM service instance
 * @returns {Promise<void>}
 */
export async function showFormOverview(context, state, itsmService) {
  const fc = state.fieldCollection
  const requiredCount = fc.fields.filter(f => f.required).length
  const optionalCount = fc.fields.length - requiredCount

  const msg = createMessage()
    .addStepHeader(4, 5, 'Form Fields', `Request Type: ${state.selectedRequestType.name}`)
    .addDivider()
    .addBreak()
    .addLine(bold('Fields to fill:'))

  fc.fields.forEach((f, i) => {
    const fieldType = itsmService.getFieldType(f)
    const typeLabel = getFieldTypeLabel(fieldType)
    msg.addLine(`${bold(`${i + 1}.`)} ${f.name}${f.required ? ` ${ICONS.requiredBold}` : ''} ${italic(`(${typeLabel})`)}`)
  })

  msg.addBreak()
    .addDivider()
    .addLine(`${ICONS.requiredBold} = Required field`)
    .addLine(`Total: ${bold(requiredCount)} required, ${bold(optionalCount)} optional`)
    .addBreak()
    .addNote("Let's fill in the fields one by one...")

  await context.sendActivity(msg.build())
}

// ============================================
// Field Input
// ============================================

/**
 * Display current field prompt for user input
 * @param {object} context - Turn context from bot framework
 * @param {object} state - Conversation state with field collection
 * @param {object} itsmService - ITSM service instance
 * @returns {Promise<void>}
 */
export async function showField(context, state, itsmService) {
  const fc = state.fieldCollection
  const field = fc.fields[fc.currentFieldIndex]
  const fieldType = itsmService.getFieldType(field)
  const progress = `[${fc.currentFieldIndex + 1}/${fc.fields.length}]`

  const msg = createMessage()
    .addLine(`${bold('Step 4/5: Fill Form')} ${italic(progress)}`)
    .addDivider()
    .addBreak()

  // Field name with required indicator
  if (field.required) {
    msg.addLine(`${bold(field.name)} ${ICONS.requiredBold}`)
      .addLine(italic('<span style="color:red">This field is required</span>'))
  } else {
    msg.addLine(`${bold(field.name)} ${italic('(Optional)')}`)
  }

  if (field.description) {
    msg.addLine(italic(field.description))
  }

  msg.addBreak()

  // Field type specific instructions
  msg.add(getFieldInstructions(field, fieldType))

  // Footer commands
  msg.addBreak(2)
    .addDivider()

  if (!field.required) {
    msg.addLine(`${code('skip')} - Skip this field`)
  }
  msg.add(`${code('back')} - Previous field`)

  await context.sendActivity(msg.build())
}

/**
 * Get field-type specific input instructions
 * @param {object} field - Field definition object
 * @param {string} fieldType - Field type identifier
 * @returns {string} HTML formatted instructions string
 */
function getFieldInstructions(field, fieldType) {
  const formatOptions = (values) =>
    values?.map((v, i) => `  ${bold(`${i + 1}.`)} ${v.name || v.value || v.id}`).join('<br/>')

  const instructions = {
    select: () => [
      `${bold('Select one option:')}`,
      formatOptions(field.validValues),
      '',
      italic(`Type the number (1-${field.validValues?.length || 0}) to select.`)
    ].join('<br/>'),

    multiselect: () => [
      `${bold('Select one or more:')}`,
      formatOptions(field.validValues),
      '',
      italic('Type numbers separated by commas (e.g., 1,3,5).')
    ].join('<br/>'),

    date: () => `${bold('Format:')} YYYY-MM-DD<br/>${italic('Example: 2024-01-15')}`,
    datetime: () => `${bold('Format:')} YYYY-MM-DD HH:MM<br/>${italic('Example: 2024-01-15 14:30')}`,
    user: () => italic('Enter user email address.'),
    number: () => italic('Enter a number.'),
    textarea: () => italic('Enter your text below:'),
    attachment: () => `${italic('Attachments are not supported in chat.')}<br/>${italic(`Type ${code('skip')} to continue.`)}`,
  }

  return instructions[fieldType]?.() || italic('Enter your value:')
}

// ============================================
// Confirmation
// ============================================

/**
 * Display confirmation screen with all collected values
 * @param {object} context - Turn context from bot framework
 * @param {object} state - Conversation state with all selections and field values
 * @param {object} itsmService - ITSM service instance
 * @returns {Promise<void>}
 */
export async function showConfirmation(context, state, itsmService) {
  const { selectedServiceDesk, selectedPortalGroup, selectedRequestType, fieldCollection } = state

  const msg = createMessage()
    .addStepHeader(5, 5, 'Review Request')
    .addDivider()
    .addBreak()
    .addLine(`${bold('Service Desk:')} ${selectedServiceDesk.projectName}`)
    .addLine(`${bold('Category:')} ${selectedPortalGroup.name}`)
    .addLine(`${bold('Request Type:')} ${selectedRequestType.name}`)

  if (fieldCollection?.fields.length > 0) {
    msg.addBreak()
      .addLine(bold('Form Values:'))

    for (const field of fieldCollection.fields) {
      const { value, display } = getFieldDisplayValue(field, fieldCollection, itsmService)
      const reqMark = field.required ? ICONS.required : ''

      if (field.required && !value) {
        msg.addLine(`• ${bold(field.name)}${reqMark}: <span style="color:red">(empty - required!)</span>`)
      } else {
        msg.addLine(`• ${bold(field.name)}${reqMark}: ${display}`)
      }
    }

    msg.addBreak()
      .addNote(`${ICONS.required} = Required field`)
  }

  msg.addBreak(2)
    .addDivider()
    .addCommands([
      ['yes', 'Submit request'],
      ['no', 'Cancel'],
      ['back', 'Edit fields'],
    ])

  await context.sendActivity(msg.build())
}

/**
 * Get display value for a field from collected values
 * @param {object} field - Field definition object
 * @param {object} fieldCollection - Collection of field values
 * @param {object} itsmService - ITSM service instance
 * @returns {{value: *, display: string}} Object with raw value and display string
 */
function getFieldDisplayValue(field, fieldCollection, itsmService) {
  let value, display

  if (field.source === 'form') {
    const formAnswer = fieldCollection.formAnswers?.[field.formQuestionId]
    value = formAnswer?.text || formAnswer?.choices?.[0] || null

    if (formAnswer?.choices && field.validValues?.length > 0) {
      const choiceId = formAnswer.choices[0]
      const choice = field.validValues.find(v => v.id === choiceId && v.id !== '__other__')
      display = choice?.name || choiceId
    } else if (formAnswer?.text) {
      display = formAnswer.text
    } else {
      display = value || '(empty)'
    }
  } else {
    value = fieldCollection.collectedValues[field.fieldId]
    display = itsmService.getDisplayValue(field, value)
  }

  return { value, display }
}

// Re-export utilities for backwards compatibility
export { sendTyping, getFieldTypeLabel, getFormFieldTypeLabel }
