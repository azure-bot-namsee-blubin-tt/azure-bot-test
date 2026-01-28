/**
 * ITSM Field Handlers
 * Handles field input validation and processing
 */
import { setState } from '../../state/conversation.mjs'
import { showField, showConfirmation, sendTyping, showCurrentRequestState } from './display.mjs'

/**
 * Handle user input for current field in the collection
 * Validates input based on field type and stores the value
 * @param {object} bot - Bot instance with itsmService
 * @param {object} context - Turn context from bot framework
 * @param {string} text - User input text
 * @param {object} state - Current conversation state
 * @param {string} conversationId - Unique conversation identifier
 * @returns {Promise<void>}
 */
export async function handleField(bot, context, text, state, conversationId) {
  const fc = state.fieldCollection
  const field = fc.fields[fc.currentFieldIndex]
  const fieldType = bot.itsmService.getFieldType(field)

  if (fc.awaitingCustomValue) {
    const customText = text.trim()
    if (!customText && field.required) {
      await context.sendActivity('❌ This field is required. Please enter a value.')
      return
    }

    if (field.source === 'form') {
      fc.formAnswers = fc.formAnswers || {}
      fc.formAnswers[field.formQuestionId] = { text: customText }
    } else {
      fc.collectedValues[field.fieldId] = customText
    }

    fc.awaitingCustomValue = false
    return await moveToNextField(context, state, conversationId, bot.itsmService)
  }

  if (text.toLowerCase() === 'skip') {
    if (field.required) {
      await context.sendActivity('❌ This field is required and cannot be skipped.<br/><i>Please enter a value.</i>')
      return
    }
    if (field.source === 'form') {
      fc.formAnswers = fc.formAnswers || {}
      fc.formAnswers[field.formQuestionId] = null
    } else {
      fc.collectedValues[field.fieldId] = null
    }
    return await moveToNextField(context, state, conversationId, bot.itsmService)
  }

  if (fieldType === 'attachment') {
    if (field.source === 'form') {
      fc.formAnswers = fc.formAnswers || {}
      fc.formAnswers[field.formQuestionId] = null
    } else {
      fc.collectedValues[field.fieldId] = null
    }
    return await moveToNextField(context, state, conversationId, bot.itsmService)
  }

  if ((fieldType === 'select' || field.jiraSchema?.type === 'cd') && field.validValues?.length > 0) {
    const index = parseInt(text, 10) - 1

    if (isNaN(index) || index < 0 || index >= field.validValues.length) {
      await context.sendActivity(
        `Invalid selection. Please enter a number between 1 and ${field.validValues.length}.<br/>` +
        `<i>Type the number to select an option, or <code>back</code> to go back.</i>`
      )
      return
    }

    const selectedValue = field.validValues[index]

    if (selectedValue.id === '__other__') {
      fc.awaitingCustomValue = true
      setState(conversationId, state)

      let msg = `<b>Enter custom value for: ${field.name}</b><br/><br/>`
      msg += `<i>Type your custom value below:</i>`
      if (!field.required) {
        msg += `<br/><br/><code>skip</code> - Leave empty`
      }
      await context.sendActivity(msg)
      return
    }

    if (field.source === 'form') {
      fc.formAnswers = fc.formAnswers || {}
      fc.formAnswers[field.formQuestionId] = {
        choices: [selectedValue.id]
      }
    } else {
      fc.collectedValues[field.fieldId] = selectedValue.id || selectedValue.name
    }

    return await moveToNextField(context, state, conversationId, bot.itsmService)
  }

  if (fieldType === 'multiselect' && field.validValues?.length > 0) {
    const selections = text.split(',').map(s => parseInt(s.trim(), 10) - 1)
    const validSelections = []
    const invalidSelections = []

    for (const idx of selections) {
      if (isNaN(idx) || idx < 0 || idx >= field.validValues.length) {
        invalidSelections.push(idx + 1)
      } else {
        validSelections.push(field.validValues[idx])
      }
    }

    if (invalidSelections.length > 0 || validSelections.length === 0) {
      await context.sendActivity(
        `Invalid selection(s). Please enter numbers between 1 and ${field.validValues.length}, separated by commas.<br/>` +
        `<i>Example: 1,3,5</i>`
      )
      return
    }

    if (field.source === 'form') {
      fc.formAnswers = fc.formAnswers || {}
      fc.formAnswers[field.formQuestionId] = {
        choices: validSelections.map(v => v.id)
      }
    } else {
      fc.collectedValues[field.fieldId] = validSelections.map(v => v.id || v.name)
    }

    return await moveToNextField(context, state, conversationId, bot.itsmService)
  }

  if (fieldType === 'date') {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(text)) {
      await context.sendActivity(
        `Invalid date format.<br/>` +
        `<b>Expected:</b> YYYY-MM-DD (e.g., 2024-01-15)<br/>` +
        `<i>Please try again.</i>`
      )
      return
    }
  }

  if (fieldType === 'datetime') {
    const datetimeRegex = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/
    if (!datetimeRegex.test(text)) {
      await context.sendActivity(
        `Invalid datetime format.<br/>` +
        `<b>Expected:</b> YYYY-MM-DD HH:MM (e.g., 2024-01-15 14:30)<br/>` +
        `<i>Please try again.</i>`
      )
      return
    }
  }

  if (fieldType === 'number') {
    if (isNaN(parseFloat(text))) {
      await context.sendActivity(
        `Invalid number.<br/>` +
        `<i>Please enter a valid number.</i>`
      )
      return
    }
  }

  const trimmedText = text.trim()
  if (!trimmedText && field.required) {
    await context.sendActivity('This field is required. Please enter a value.')
    return
  }

  if (field.source === 'form') {
    fc.formAnswers = fc.formAnswers || {}
    fc.formAnswers[field.formQuestionId] = { text: trimmedText }
  } else {
    const value = bot.itsmService.formatFieldValue(field, trimmedText)
    fc.collectedValues[field.fieldId] = value
  }

  return await moveToNextField(context, state, conversationId, bot.itsmService)
}

/**
 * Move to next field in collection or to confirmation if done
 * @param {object} context - Turn context from bot framework
 * @param {object} state - Current conversation state
 * @param {string} conversationId - Unique conversation identifier
 * @param {object} itsmService - ITSM service instance
 * @returns {Promise<void>}
 */
export async function moveToNextField(context, state, conversationId, itsmService) {
  const fc = state.fieldCollection

  fc.currentFieldIndex++
  setState(conversationId, state)

  // Show current request state after entering any field
  await showCurrentRequestState(context, state, itsmService)

  if (fc.currentFieldIndex < fc.fields.length) {
    await showField(context, state, itsmService)
  } else {
    state.step = 'confirm'
    setState(conversationId, state)
    await showConfirmation(context, state, itsmService)
  }
}

/**
 * Prepare fields for collection by combining portal and form fields
 * Maps portal fields to form questions and creates unified field list
 * @param {object[]} portalFields - Standard portal fields from ITSM
 * @param {object[]} formQuestions - Form questions from ProForma
 * @param {object} itsmService - ITSM service instance
 * @returns {object[]} Combined and mapped array of all fields
 */
export function prepareFieldsForCollection(portalFields, formQuestions, itsmService) {
  const allFields = []

  const portalToFormMapping = {}
  for (const q of formQuestions) {
    const labelKey = q.label.toLowerCase().trim()
    if (!portalToFormMapping[labelKey]) {
      portalToFormMapping[labelKey] = q.id
    }
  }

  for (const f of portalFields) {
    const labelKey = f.name.toLowerCase().trim()
    const formQuestionId = portalToFormMapping[labelKey] || null

    if (formQuestionId) {
      console.log(`Portal "${f.name}" mapped to form question ID: ${formQuestionId}`)
    } else {
      console.log(`Portal "${f.name}" has NO matching form question`)
    }

    allFields.push({
      ...f,
      source: 'portal',
      formQuestionId,
    })
  }

  const portalLabelSet = new Set(portalFields.map(f => f.name.toLowerCase()))
  const labelCounts = {}

  for (const q of formQuestions) {
    if (portalLabelSet.has(q.label.toLowerCase())) {
      continue
    }

    const labelKey = q.label.toLowerCase()
    labelCounts[labelKey] = (labelCounts[labelKey] || 0) + 1
    const rowNum = labelCounts[labelKey]

    const isTableField = formQuestions.filter(fq =>
      fq.label.toLowerCase() === labelKey
    ).length > 1

    const displayName = isTableField
      ? `${q.label} (Row ${rowNum})`
      : q.label

    const choices = (q.choices || [])
      .filter(c => {
        const label = (c.label || '').toLowerCase().trim()
        return !label.startsWith('other')
      })
      .map(c => ({ id: c.id, name: c.label }))

    if (choices.length > 0) {
      choices.push({ id: '__other__', name: 'Other (type custom value)' })
    }

    allFields.push({
      fieldId: `form_${q.id}`,
      name: displayName,
      originalLabel: q.label,
      required: q.required,
      visible: true,
      jiraSchema: { type: q.type },
      validValues: choices,
      source: 'form',
      formQuestionId: q.id,
      rowNumber: isTableField ? rowNum : null,
      isTableField,
    })
  }

  return allFields
}
