/**
 * ITSM Display Utilities
 * Handles formatting and displaying ITSM-related messages
 */
import {
  sendTyping,
  getFieldTypeLabel,
  getFormFieldTypeLabel,
} from '../../utils/index.mjs'

/**
 * Show service desk selection
 */
export async function showServiceDesks(context, state) {
  let msg = `<b>Create ITSM Request</b><br/><br/>`
  msg += `<b>Step 1/5: Select Service Desk</b><br/><br/>`

  state.serviceDesks.forEach((d, i) => {
    msg += `<b>${i + 1}.</b> ${d.projectName} (${d.projectKey})<br/>`
  })

  msg += `<br/><i>Type number to select. <code>cancel</code> to abort.</i>`
  await context.sendActivity(msg)
}

/**
 * Show portal groups (Contact us about)
 */
export async function showPortalGroups(context, state) {
  let msg = `<b>Step 2/5: Contact us about</b><br/>`
  msg += `<i>Service Desk: ${state.selectedServiceDesk.projectName}</i><br/><br/>`

  state.portalGroups.forEach((g, i) => {
    msg += `<b>${i + 1}.</b> ${g.name}<br/>`
  })

  msg += `<br/><i>Type number to select. <code>back</code> to go back.</i>`
  await context.sendActivity(msg)
}

/**
 * Show request types with fields preview
 */
export async function showRequestTypes(context, state, itsmService) {
  const types = state.filteredRequestTypes || []
  let msg = `<b>Step 3/5: What can we help you with?</b><br/>`
  msg += `<i>Category: ${state.selectedPortalGroup.name}</i><br/><br/>`

  if (types.length === 0) {
    msg += `<i>No request types available for this category.</i><br/>`
  } else {
    // Fetch fields and forms in parallel
    await sendTyping(context)

    let allFields = []
    let allForms = []

    try {
      const fieldsPromises = types.map(t =>
        itsmService.getPortalFields(state.selectedServiceDesk.id, t.id)
          .catch(err => {
            console.log(`Fields error for ${t.id}:`, err.message)
            return []
          })
      )

      const formsPromises = types.map(t =>
        itsmService.getRequestTypeForm(state.selectedServiceDesk.id, t.id)
          .catch(err => {
            console.log(`Form error for ${t.id}:`, err.message)
            return null
          })
      )

      const results = await Promise.all([
        Promise.all(fieldsPromises),
        Promise.all(formsPromises),
      ])
      allFields = results[0]
      allForms = results[1]
    } catch (error) {
      console.error('Error fetching fields/forms:', error)
    }

    state.requestTypeFieldsCache = {}
    state.requestTypeFormsCache = {}

    for (let i = 0; i < types.length; i++) {
      const t = types[i]
      const fields = allFields[i]
      const formTemplate = allForms[i]
      state.requestTypeFieldsCache[t.id] = fields
      state.requestTypeFormsCache[t.id] = formTemplate

      msg += `<b>${i + 1}. ${t.name}</b><br/>`
      if (t.description) {
        msg += `<i>   ${t.description}</i><br/>`
      }

      if (fields.length > 0) {
        msg += `   <b>Standard fields:</b><br/>`
        fields.forEach(f => {
          const reqMark = f.required ? '<span style="color:red">*</span>' : ''
          const fieldType = itsmService.getFieldType(f)
          msg += `   • ${f.name}${reqMark} <i>(${fieldType})</i><br/>`
        })
      }

      if (formTemplate) {
        const formQuestions = itsmService.extractFormQuestions(formTemplate)
        if (formQuestions.length > 0) {
          const uniqueFields = []
          const seenLabels = new Set()
          for (const q of formQuestions) {
            if (!seenLabels.has(q.label)) {
              seenLabels.add(q.label)
              uniqueFields.push(q)
            }
          }

          msg += `   <b>Form: ${formTemplate.name || 'Attached Form'}</b><br/>`
          uniqueFields.forEach(q => {
            const reqMark = q.required ? '<span style="color:red">*</span>' : ''
            const typeLabel = getFormFieldTypeLabel(q.type)
            msg += `   • ${q.label}${reqMark} <i>(${typeLabel})</i><br/>`
          })
        }
      }

      if (fields.length === 0 && !formTemplate) {
        msg += `   <i>No fields found</i><br/>`
      }
      msg += `<br/>`
    }
  }

  msg += `<i>Type number to select. <code>back</code> to go back.</i><br/>`
  msg += `<i><span style="color:red">*</span> = Required field</i>`
  await context.sendActivity(msg)
}

/**
 * Show form overview before collecting fields
 */
export async function showFormOverview(context, state, itsmService) {
  const fc = state.fieldCollection
  const requiredCount = fc.fields.filter(f => f.required).length
  const optionalCount = fc.fields.length - requiredCount

  let msg = `<b>Step 4/5: Form Fields</b><br/>`
  msg += `<i>Request Type: ${state.selectedRequestType.name}</i><br/>`
  msg += `━━━━━━━━━━━━━━━━━━━━<br/><br/>`

  msg += `<b>Fields to fill:</b><br/>`
  fc.fields.forEach((f, i) => {
    const reqMark = f.required ? ' <span style="color:red"><b>*</b></span>' : ''
    const fieldType = itsmService.getFieldType(f)
    const typeLabel = getFieldTypeLabel(fieldType)
    msg += `<b>${i + 1}.</b> ${f.name}${reqMark} <i>(${typeLabel})</i><br/>`
  })

  msg += `<br/>━━━━━━━━━━━━━━━━━━━━<br/>`
  msg += `<span style="color:red"><b>*</b></span> = Required field<br/>`
  msg += `Total: <b>${requiredCount}</b> required, <b>${optionalCount}</b> optional<br/><br/>`

  msg += `<i>Let's fill in the fields one by one...</i>`

  await context.sendActivity(msg)
}

/**
 * Show current field to fill
 */
export async function showField(context, state, itsmService) {
  const fc = state.fieldCollection
  const field = fc.fields[fc.currentFieldIndex]
  const fieldType = itsmService.getFieldType(field)
  const progress = `${fc.currentFieldIndex + 1}/${fc.fields.length}`

  // Header with progress
  let msg = `<b>Step 4/5: Fill Form</b> <i>[${progress}]</i><br/>`
  msg += `━━━━━━━━━━━━━━━━━━━━<br/><br/>`

  // Field name with required indicator
  if (field.required) {
    msg += `<b>${field.name}</b> <span style="color:red"><b>*</b></span><br/>`
    msg += `<i style="color:red">This field is required</i><br/>`
  } else {
    msg += `<b>${field.name}</b> <i>(Optional)</i><br/>`
  }

  // Field description
  if (field.description) {
    msg += `<i>${field.description}</i><br/>`
  }

  msg += `<br/>`

  // Field type specific instructions
  switch (fieldType) {
    case 'select':
      msg += `<b>Select one option:</b><br/>`
      field.validValues?.forEach((v, i) => {
        msg += `  <b>${i + 1}.</b> ${v.name || v.value || v.id}<br/>`
      })
      msg += `<br/><i>Type the number (1-${field.validValues?.length || 0}) to select.</i>`
      break

    case 'multiselect':
      msg += `<b>Select one or more:</b><br/>`
      field.validValues?.forEach((v, i) => {
        msg += `  <b>${i + 1}.</b> ${v.name || v.value || v.id}<br/>`
      })
      msg += `<br/><i>Type numbers separated by commas (e.g., 1,3,5).</i>`
      break

    case 'date':
      msg += `<b>Format:</b> YYYY-MM-DD<br/>`
      msg += `<i>Example: 2024-01-15</i>`
      break

    case 'datetime':
      msg += `<b>Format:</b> YYYY-MM-DD HH:MM<br/>`
      msg += `<i>Example: 2024-01-15 14:30</i>`
      break

    case 'user':
      msg += `<i>Enter user email address.</i>`
      break

    case 'number':
      msg += `<i>Enter a number.</i>`
      break

    case 'textarea':
      msg += `<i>Enter your text below:</i>`
      break

    case 'attachment':
      msg += `<i>Attachments are not supported in chat.</i><br/>`
      msg += `<i>Type <code>skip</code> to continue.</i>`
      break

    default:
      msg += `<i>Enter your value:</i>`
  }

  msg += `<br/><br/>━━━━━━━━━━━━━━━━━━━━<br/>`
  if (!field.required) {
    msg += `<code>skip</code> - Skip this field<br/>`
  }
  msg += `<code>back</code> - Previous field`

  await context.sendActivity(msg)
}

/**
 * Show confirmation before submitting
 */
export async function showConfirmation(context, state, itsmService) {
  const { selectedServiceDesk, selectedPortalGroup, selectedRequestType, fieldCollection } = state

  let msg = `<b>Step 5/5: Review Request</b><br/>`
  msg += `━━━━━━━━━━━━━━━━━━━━<br/><br/>`

  msg += `<b>Service Desk:</b> ${selectedServiceDesk.projectName}<br/>`
  msg += `<b>Category:</b> ${selectedPortalGroup.name}<br/>`
  msg += `<b>Request Type:</b> ${selectedRequestType.name}<br/>`

  if (fieldCollection?.fields.length > 0) {
    msg += `<br/><b>Form Values:</b><br/>`
    for (const field of fieldCollection.fields) {
      let value, display
      const reqMark = field.required ? '<span style="color:red">*</span>' : ''

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

      if (field.required && (value === null || value === undefined || value === '')) {
        msg += `• <b>${field.name}</b>${reqMark}: <span style="color:red">(empty - required!)</span><br/>`
      } else {
        msg += `• <b>${field.name}</b>${reqMark}: ${display}<br/>`
      }
    }
    msg += `<br/><i><span style="color:red">*</span> = Required field</i>`
  }

  msg += `<br/><br/>━━━━━━━━━━━━━━━━━━━━<br/>`
  msg += `<code>yes</code> - Submit request<br/>`
  msg += `<code>no</code> - Cancel<br/>`
  msg += `<code>back</code> - Edit fields`

  await context.sendActivity(msg)
}

// Re-export utilities for backwards compatibility
export { sendTyping, getFieldTypeLabel, getFormFieldTypeLabel }
