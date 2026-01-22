/**
 * ITSM Handlers
 * Handles all ITSM request-related commands and flows
 */
import { getState, setState, deleteState } from '../../state/conversation.mjs'
import {
  showServiceDesks,
  showPortalGroups,
  showRequestTypes,
  showFormOverview,
  showField,
  showConfirmation,
  sendTyping,
} from './display.mjs'
import { handleField, prepareFieldsForCollection } from './fieldHandlers.mjs'
import { selectFromList } from '../../utils/index.mjs'

/**
 * Create ITSM handlers bound to bot instance
 */
export function createITSMHandlers(bot) {
  return {
    startRequestCreation: (ctx, convId) => startRequestCreation(bot, ctx, convId),
    handleRequestFlow: (ctx, text, state, convId) => handleRequestFlow(bot, ctx, text, state, convId),
    debugFields: (ctx) => debugFields(bot, ctx),
    showForms: (ctx, projectKey) => showForms(bot, ctx, projectKey),
    testAttachForm: (ctx, issueKey, formTemplateId) => testAttachForm(bot, ctx, issueKey, formTemplateId),
  }
}


async function startRequestCreation(bot, context, conversationId) {
  if (!bot.itsmService) {
    await context.sendActivity('ITSM integration is not configured.')
    return
  }

  try {
    await sendTyping(context)
    const serviceDesks = await bot.itsmService.getServiceDesks()

    if (serviceDesks.length === 0) {
      await context.sendActivity('No service desks found.')
      return
    }

    const state = {
      awaitingITSMDetails: true,
      step: 'select_service_desk',
      serviceDesks,
    }
    setState(conversationId, state)
    await showServiceDesks(context, state)
  } catch (error) {
    console.error('Error starting ITSM:', error)
    await context.sendActivity(`Error: ${error.message}`)
  }
}

async function handleRequestFlow(bot, context, text, state, conversationId) {
  const cmd = text.toLowerCase().trim()

  if (cmd === 'cancel') {
    deleteState(conversationId)
    await context.sendActivity('Request cancelled.')
    return
  }

  if (cmd === 'back') {
    if (state.fieldCollection?.awaitingCustomValue) {
      state.fieldCollection.awaitingCustomValue = false
      setState(conversationId, state)
      await showField(context, state, bot.itsmService)
      return
    }
    await goBack(bot, context, state, conversationId)
    return
  }

  const handlers = {
    'select_service_desk': handleServiceDesk,
    'select_portal_group': handlePortalGroup,
    'select_request_type': handleRequestType,
    'collect_field': (b, ctx, txt, st, cid) => handleField(b, ctx, txt, st, cid),
    'confirm': handleConfirm,
  }

  const handler = handlers[state.step]
  if (handler) {
    await handler(bot, context, text, state, conversationId)
  }
}

async function goBack(bot, context, state, conversationId) {
  const backMap = {
    'select_service_desk': () => {
      deleteState(conversationId)
      return context.sendActivity('Request cancelled.')
    },
    'select_portal_group': async () => {
      state.step = 'select_service_desk'
      state.selectedServiceDesk = null
      state.portalGroups = null
      state.requestTypes = null
      setState(conversationId, state)
      await showServiceDesks(context, state)
    },
    'select_request_type': async () => {
      state.step = 'select_portal_group'
      state.selectedPortalGroup = null
      state.filteredRequestTypes = null
      setState(conversationId, state)
      await showPortalGroups(context, state)
    },
    'collect_field': async () => {
      const fc = state.fieldCollection
      if (fc.currentFieldIndex > 0) {
        fc.currentFieldIndex--
        delete fc.collectedValues[fc.fields[fc.currentFieldIndex].fieldId]
        setState(conversationId, state)
        await showField(context, state, bot.itsmService)
      } else {
        state.step = 'select_request_type'
        state.selectedRequestType = null
        state.fieldCollection = null
        setState(conversationId, state)
        await showRequestTypes(context, state, bot.itsmService)
      }
    },
    'confirm': async () => {
      const fc = state.fieldCollection
      if (fc && fc.fields.length > 0) {
        state.step = 'collect_field'
        fc.currentFieldIndex = fc.fields.length - 1
        delete fc.collectedValues[fc.fields[fc.currentFieldIndex].fieldId]
        setState(conversationId, state)
        await showField(context, state, bot.itsmService)
      } else {
        state.step = 'select_request_type'
        setState(conversationId, state)
        await showRequestTypes(context, state, bot.itsmService)
      }
    },
  }

  await backMap[state.step]?.()
}

async function handleServiceDesk(bot, context, text, state, conversationId) {
  const selected = selectFromList(text, state.serviceDesks, 'projectKey')
  if (!selected) {
    await context.sendActivity(`Invalid selection. Enter 1-${state.serviceDesks.length}.`)
    return
  }

  try {
    await sendTyping(context)

    const [portalGroups, requestTypes] = await Promise.all([
      bot.itsmService.getPortalGroups(selected.id),
      bot.itsmService.getRequestTypes(selected.id),
    ])

    if (portalGroups.length === 0) {
      await context.sendActivity('No portal groups found.')
      return
    }

    state.selectedServiceDesk = selected
    state.portalGroups = portalGroups
    state.requestTypes = requestTypes
    state.step = 'select_portal_group'
    setState(conversationId, state)

    await showPortalGroups(context, state)
  } catch (error) {
    console.error('Error:', error)
    await context.sendActivity(`Error: ${error.message}`)
  }
}

async function handlePortalGroup(bot, context, text, state, conversationId) {
  const selected = selectFromList(text, state.portalGroups)
  if (!selected) {
    await context.sendActivity(`Invalid selection. Enter 1-${state.portalGroups.length}.`)
    return
  }

  const filtered = state.requestTypes.filter(rt =>
    rt.groupIds?.includes(selected.id.toString()) || rt.groupIds?.includes(parseInt(selected.id))
  )

  state.selectedPortalGroup = selected
  state.filteredRequestTypes = filtered
  state.step = 'select_request_type'
  setState(conversationId, state)

  await showRequestTypes(context, state, bot.itsmService)
}

async function handleRequestType(bot, context, text, state, conversationId) {
  const types = state.filteredRequestTypes || []
  const selected = selectFromList(text, types)
  if (!selected) {
    await context.sendActivity(`Invalid selection. Enter 1-${types.length}.`)
    return
  }

  try {
    await sendTyping(context)

    let portalFields = state.requestTypeFieldsCache?.[selected.id]
    if (!portalFields) {
      portalFields = await bot.itsmService.getPortalFields(
        state.selectedServiceDesk.id,
        selected.id
      )
    }

    let formTemplate = state.requestTypeFormsCache?.[selected.id]
    if (formTemplate === undefined) {
      formTemplate = await bot.itsmService.getRequestTypeForm(
        state.selectedServiceDesk.id,
        selected.id
      ).catch(() => null)
    }

    const formQuestions = formTemplate
      ? bot.itsmService.extractFormQuestions(formTemplate)
      : []

    const allFields = prepareFieldsForCollection(portalFields, formQuestions, bot.itsmService)

    state.selectedRequestType = selected
    state.formTemplate = formTemplate
    state.fieldCollection = {
      currentFieldIndex: 0,
      fields: allFields,
      collectedValues: {},
      formAnswers: {},
    }

    if (allFields.length === 0) {
      await context.sendActivity(
        `<i>No form fields found for this request type.</i><br/>` +
        `<i>The request will be created with default values only.</i>`
      )
      state.step = 'confirm'
      setState(conversationId, state)
      await showConfirmation(context, state, bot.itsmService)
    } else {
      state.step = 'collect_field'
      setState(conversationId, state)
      await showFormOverview(context, state, bot.itsmService)
      await showField(context, state, bot.itsmService)
    }
  } catch (error) {
    console.error('Error:', error)
    await context.sendActivity(`Error: ${error.message}`)
  }
}

async function handleConfirm(bot, context, text, state, conversationId) {
  const cmd = text.toLowerCase()
  if (cmd === 'yes' || cmd === 'y' || cmd === 'retry') {
    await createRequest(bot, context, state, conversationId)
  } else if (cmd === 'no' || cmd === 'n') {
    deleteState(conversationId)
    await context.sendActivity('Request cancelled.')
  } else {
    await context.sendActivity('<i>Type <code>yes</code>, <code>no</code>, or <code>back</code>.</i>')
  }
}

async function createRequest(bot, context, state, conversationId) {
  const fc = state.fieldCollection

  const missingRequired = []
  for (const field of (fc?.fields || [])) {
    if (field.required) {
      let value
      if (field.source === 'form') {
        const formAnswer = fc.formAnswers?.[field.formQuestionId]
        value = formAnswer?.text || formAnswer?.choices?.[0]
      } else {
        value = fc.collectedValues[field.fieldId]
      }
      if (value === null || value === undefined || value === '') {
        missingRequired.push(field.name)
      }
    }
  }

  if (missingRequired.length > 0) {
    let msg = `<b>Cannot submit - missing required fields:</b><br/><br/>`
    missingRequired.forEach(name => {
      msg += `• ${name}<br/>`
    })
    msg += `<br/><i>Type <code>back</code> to edit the form.</i>`
    await context.sendActivity(msg)
    return
  }

  const startTime = Date.now()
  let typingInterval = null

  const startTypingAnimation = () => {
    sendTyping(context)
    typingInterval = setInterval(() => {
      sendTyping(context)
    }, 3000)
  }

  const stopTypingAnimation = () => {
    if (typingInterval) {
      clearInterval(typingInterval)
      typingInterval = null
    }
  }

  const getElapsedTime = () => {
    const elapsed = (Date.now() - startTime) / 1000
    return elapsed < 1 ? `${Math.round(elapsed * 1000)}ms` : `${elapsed.toFixed(1)}s`
  }

  try {
    startTypingAnimation()

    const fieldValues = {}
    for (const [key, value] of Object.entries(fc?.collectedValues || {})) {
      if (value !== null && value !== undefined && value !== '') {
        fieldValues[key] = value
      }
    }

    const result = await bot.itsmService.createRequest({
      serviceDeskId: state.selectedServiceDesk.id,
      requestTypeId: state.selectedRequestType.id,
      requestFieldValues: fieldValues,
    })

    const issueKey = result.issueKey
    const url = bot.itsmService.getPortalUrl(issueKey)
    const summary = fieldValues.summary || state.selectedRequestType.name

    let msg = `<b>Request Created!</b><br/><br/>`
    msg += `<b>${issueKey}:</b> ${summary}<br/>`

    if (state.formTemplate) {
      try {
        const issueId = result.issueId

        await new Promise(resolve => setTimeout(resolve, 1500))

        const formTemplateId = state.formTemplate.id ||
                               state.formTemplate.templateId ||
                               state.formTemplate.formTemplate?.id

        if (formTemplateId) {
          const attachedForm = await bot.itsmService.attachFormToIssue(issueId, formTemplateId)

          if (attachedForm?.id) {
            await bot.itsmService.setFormExternal(issueId, attachedForm.id)

            const validAnswers = {}

            for (const [key, value] of Object.entries(fc.formAnswers || {})) {
              if (value !== null && value !== undefined) {
                validAnswers[key] = value
              }
            }

            for (const field of fc.fields || []) {
              if (field.source === 'portal' && field.formQuestionId) {
                const portalValue = fc.collectedValues[field.fieldId]
                if (portalValue !== null && portalValue !== undefined && portalValue !== '') {
                  validAnswers[field.formQuestionId] = { text: String(portalValue) }
                }
              }
            }

            console.log('📋 Saving form answers:', JSON.stringify(validAnswers, null, 2))

            if (Object.keys(validAnswers).length > 0) {
              await bot.itsmService.saveFormAnswers(issueId, attachedForm.id, validAnswers)
              msg += `Form attached and filled<br/>`
            } else {
              msg += `Form attached<br/>`
            }
          }
        } else {
          console.log('No form template ID found in:', state.formTemplate)
          msg += `<i>Form template ID not found.</i><br/>`
        }
      } catch (formError) {
        console.error('Error attaching form:', formError)
        msg += `<i>Form could not be attached: ${formError.message}</i><br/>`
        msg += `<i>Please fill the form fields in the portal.</i><br/>`
      }
    }

    msg += `<br/> <a href="${url}">View in Portal</a>`
    msg += `<br/><br/><i style="color:gray">Completed in ${getElapsedTime()}</i>`

    stopTypingAnimation()
    await context.sendActivity(msg)
    deleteState(conversationId)
  } catch (error) {
    stopTypingAnimation()
    console.error('Error creating request:', error)
    await context.sendActivity(
      `Failed to create: ${error.message}<br/>` +
      `<i style="color:gray">Failed after ${getElapsedTime()}</i><br/><br/>` +
      `<i>Type <code>yes</code> to retry or <code>back</code> to edit.</i>`
    )
  }
}

async function debugFields(bot, context) {
  if (!bot.itsmService) {
    await context.sendActivity('ITSM service not configured.')
    return
  }

  try {
    await sendTyping(context)

    const serviceDesks = await bot.itsmService.getServiceDesks()
    if (serviceDesks.length === 0) {
      await context.sendActivity('No service desks found.')
      return
    }

    let msg = `<b>ITSM Debug Info</b><br/>━━━━━━━━━━━━━━━━━━━━<br/><br/>`

    for (const desk of serviceDesks.slice(0, 1)) {
      msg += `<b>Service Desk:</b> ${desk.projectName} (${desk.projectKey})<br/>`

      const requestTypes = await bot.itsmService.getRequestTypes(desk.id)
      msg += `<b>Request Types:</b> ${requestTypes.length}<br/><br/>`

      for (const rt of requestTypes.slice(0, 5)) {
        msg += `<b>→ ${rt.name}</b><br/>`

        const portalFields = await bot.itsmService.getPortalFields(desk.id, rt.id)
        msg += `   Portal Fields: ${portalFields.length}<br/>`

        if (portalFields.length > 0) {
          portalFields.forEach(f => {
            const req = f.required ? ' <span style="color:red">*</span>' : ''
            msg += `   • ${f.name}${req}<br/>`
          })
        }
        msg += `<br/>`
      }
    }

    msg += `━━━━━━━━━━━━━━━━━━━━<br/>`
    msg += `<i><span style="color:red">*</span> = Required</i>`

    await context.sendActivity(msg)
  } catch (error) {
    console.error('Debug error:', error)
    await context.sendActivity(`Debug error: ${error.message}`)
  }
}

async function showForms(bot, context, projectKey) {
  if (!bot.itsmService) {
    await context.sendActivity('ITSM service not configured.')
    return
  }

  try {
    await sendTyping(context)

    let msg = `<b>📋 Forms API Test</b><br/>━━━━━━━━━━━━━━━━━━━━<br/><br/>`

    try {
      const cloudId = await bot.itsmService.getCloudId()
      msg += `<b>Cloud ID:</b> ${cloudId}<br/><br/>`
    } catch (error) {
      msg += `<b>Cloud ID:</b> ${error.message}<br/><br/>`
    }

    msg += `<b>Form Templates for ${projectKey}:</b><br/>`
    try {
      const templates = await bot.itsmService.getFormTemplates(projectKey)
      if (templates.length === 0) {
        msg += `<i>No form templates found</i><br/>`
      } else {
        templates.forEach((t, i) => {
          msg += `${i + 1}. <b>${t.name}</b> (ID: ${t.id})<br/>`
          if (t.description) msg += `   <i>${t.description}</i><br/>`
        })
      }
    } catch (error) {
      msg += `❌ Error: ${error.message}<br/>`
    }

    msg += `<br/>━━━━━━━━━━━━━━━━━━━━<br/>`
    msg += `<i>Use: itsm forms &lt;PROJECT_KEY&gt; to check other projects</i>`

    await context.sendActivity(msg)
  } catch (error) {
    console.error('Forms API error:', error)
    await context.sendActivity(` Forms API error: ${error.message}`)
  }
}

async function testAttachForm(bot, context, issueKey, formTemplateId) {
  if (!bot.itsmService) {
    await context.sendActivity(' ITSM service not configured.')
    return
  }

  if (!issueKey || !formTemplateId) {
    await context.sendActivity(
      '❌ Usage: <code>itsm attach &lt;issueKey&gt; &lt;formTemplateId&gt;</code><br/>' +
      'Example: <code>itsm attach I0-5 ff635c24-e52d-46f3-bdca-22b62248bc4c</code>'
    )
    return
  }

  try {
    await sendTyping(context)

    let msg = `<b>📋 Testing Form Attachment</b><br/>━━━━━━━━━━━━━━━━━━━━<br/><br/>`
    msg += `<b>Issue:</b> ${issueKey}<br/>`
    msg += `<b>Form Template ID:</b> ${formTemplateId}<br/><br/>`

    msg += `<b>Step 1:</b> Attaching form...<br/>`
    try {
      const attachedForm = await bot.itsmService.attachFormToIssue(issueKey, formTemplateId)
      msg += ` Form attached!<br/>`
      msg += `Form ID: ${attachedForm.id}<br/>`
      msg += `Form Name: ${attachedForm.name || 'N/A'}<br/>`
    } catch (error) {
      msg += ` Failed: ${error.message}<br/>`
    }

    await context.sendActivity(msg)
  } catch (error) {
    console.error('Test attach error:', error)
    await context.sendActivity(` Error: ${error.message}`)
  }
}

