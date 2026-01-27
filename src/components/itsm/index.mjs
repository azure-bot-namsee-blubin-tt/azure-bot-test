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
import {
  selectFromList,
  createTypingAnimation,
  formatElapsedTime,
  createMessage,
  bold,
  italic,
  code,
  link,
  ICONS,
} from '../../utils/index.mjs'

// ============================================
// Public API
// ============================================

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
    await context.sendActivity(italic(`Type ${code('yes')}, ${code('no')}, or ${code('back')}.`))
  }
}

async function createRequest(bot, context, state, conversationId) {
  const fc = state.fieldCollection

  // Validate required fields
  const missingRequired = getMissingRequiredFields(fc)
  if (missingRequired.length > 0) {
    const msg = createMessage()
      .addLine(bold('Cannot submit - missing required fields:'))
      .addBreak()
      .addBulletList(missingRequired)
      .addBreak()
      .addNote(`Type ${code('back')} to edit the form.`)
      .build()
    await context.sendActivity(msg)
    return
  }

  const startTime = Date.now()
  const typing = createTypingAnimation(context)

  try {
    const fieldValues = getCollectedFieldValues(fc)
    const result = await bot.itsmService.createRequest({
      serviceDeskId: state.selectedServiceDesk.id,
      requestTypeId: state.selectedRequestType.id,
      requestFieldValues: fieldValues,
    })

    const issueKey = result.issueKey
    const url = bot.itsmService.getPortalUrl(issueKey)
    const summary = fieldValues.summary || state.selectedRequestType.name

    const msg = createMessage()
      .addLine(`${ICONS.success} ${bold('Request Created!')}`)
      .addBreak()
      .addLine(`${bold(issueKey)}: ${summary}`)

    // Handle form attachment if exists
    if (state.formTemplate) {
      const formResult = await attachAndFillForm(bot, result, state, fc)
      msg.addLine(formResult)
    }

    msg.addBreak()
      .addLine(link('View in Portal', url))
      .addBreak(2)
      .add(`<i style="color:gray">Completed in ${formatElapsedTime(startTime)}</i>`)

    typing.stop()
    await context.sendActivity(msg.build())
    deleteState(conversationId)
  } catch (error) {
    typing.stop()
    console.error('Error creating request:', error)

    const errorMsg = createMessage()
      .addLine(`${ICONS.error} Failed to create: ${error.message}`)
      .add(`<i style="color:gray">Failed after ${formatElapsedTime(startTime)}</i>`)
      .addBreak(2)
      .addNote(`Type ${code('yes')} to retry or ${code('back')} to edit.`)
      .build()

    await context.sendActivity(errorMsg)
  }
}

// ============================================
// Helper Functions
// ============================================

function getMissingRequiredFields(fc) {
  const missing = []
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
        missing.push(field.name)
      }
    }
  }
  return missing
}

function getCollectedFieldValues(fc) {
  const fieldValues = {}
  for (const [key, value] of Object.entries(fc?.collectedValues || {})) {
    if (value !== null && value !== undefined && value !== '') {
      fieldValues[key] = value
    }
  }
  return fieldValues
}

async function attachAndFillForm(bot, result, state, fc) {
  try {
    const issueId = result.issueId
    await new Promise(resolve => setTimeout(resolve, 1500))

    const formTemplateId = state.formTemplate.id ||
                           state.formTemplate.templateId ||
                           state.formTemplate.formTemplate?.id

    if (!formTemplateId) {
      console.log('No form template ID found in:', state.formTemplate)
      return italic('Form template ID not found.')
    }

    const attachedForm = await bot.itsmService.attachFormToIssue(issueId, formTemplateId)

    if (attachedForm?.id) {
      await bot.itsmService.setFormExternal(issueId, attachedForm.id)

      const validAnswers = buildFormAnswers(fc)

      console.log('📋 Saving form answers:', JSON.stringify(validAnswers, null, 2))

      if (Object.keys(validAnswers).length > 0) {
        await bot.itsmService.saveFormAnswers(issueId, attachedForm.id, validAnswers)
        return 'Form attached and filled'
      }
      return 'Form attached'
    }

    return italic('Form could not be attached.')
  } catch (formError) {
    console.error('Error attaching form:', formError)
    return italic(`Form could not be attached: ${formError.message}. Please fill in the portal.`)
  }
}

function buildFormAnswers(fc) {
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

  return validAnswers
}

// ============================================
// Debug Functions
// ============================================

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

    const msg = createMessage()
      .addHeader('ITSM Debug Info')
      .addDivider()
      .addBreak()

    for (const desk of serviceDesks.slice(0, 1)) {
      msg.addLine(`${bold('Service Desk:')} ${desk.projectName} (${desk.projectKey})`)

      const requestTypes = await bot.itsmService.getRequestTypes(desk.id)
      msg.addLine(`${bold('Request Types:')} ${requestTypes.length}`)
        .addBreak()

      for (const rt of requestTypes.slice(0, 5)) {
        msg.addLine(`${bold(`→ ${rt.name}`)}`)

        const portalFields = await bot.itsmService.getPortalFields(desk.id, rt.id)
        msg.addLine(`   Portal Fields: ${portalFields.length}`)

        if (portalFields.length > 0) {
          portalFields.forEach(f => {
            const req = f.required ? ` ${ICONS.required}` : ''
            msg.addLine(`   • ${f.name}${req}`)
          })
        }
        msg.addBreak()
      }
    }

    msg.addDivider()
      .addNote(`${ICONS.required} = Required`)

    await context.sendActivity(msg.build())
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

    const msg = createMessage()
      .addHeader('📋 Forms API Test')
      .addDivider()
      .addBreak()

    try {
      const cloudId = await bot.itsmService.getCloudId()
      msg.addLine(`${bold('Cloud ID:')} ${cloudId}`)
    } catch (error) {
      msg.addLine(`${bold('Cloud ID:')} ${error.message}`)
    }

    msg.addBreak()
      .addLine(`${bold(`Form Templates for ${projectKey}:`)}`)

    try {
      const templates = await bot.itsmService.getFormTemplates(projectKey)
      if (templates.length === 0) {
        msg.addNote('No form templates found')
      } else {
        templates.forEach((t, i) => {
          msg.addLine(`${i + 1}. ${bold(t.name)} (ID: ${t.id})`)
          if (t.description) msg.addNote(`   ${t.description}`)
        })
      }
    } catch (error) {
      msg.addLine(`${ICONS.error} Error: ${error.message}`)
    }

    msg.addBreak()
      .addDivider()
      .addNote('Use: itsm forms <PROJECT_KEY> to check other projects')

    await context.sendActivity(msg.build())
  } catch (error) {
    console.error('Forms API error:', error)
    await context.sendActivity(`${ICONS.error} Forms API error: ${error.message}`)
  }
}

async function testAttachForm(bot, context, issueKey, formTemplateId) {
  if (!bot.itsmService) {
    await context.sendActivity(`${ICONS.error} ITSM service not configured.`)
    return
  }

  if (!issueKey || !formTemplateId) {
    const usage = createMessage()
      .addLine(`${ICONS.error} Usage: ${code('itsm attach <issueKey> <formTemplateId>')}`)
      .addNote('Example: itsm attach I0-5 ff635c24-e52d-46f3-bdca-22b62248bc4c')
      .build()
    await context.sendActivity(usage)
    return
  }

  try {
    await sendTyping(context)

    const msg = createMessage()
      .addHeader('📋 Testing Form Attachment')
      .addDivider()
      .addBreak()
      .addLine(`${bold('Issue:')} ${issueKey}`)
      .addLine(`${bold('Form Template ID:')} ${formTemplateId}`)
      .addBreak()
      .addLine(`${bold('Step 1:')} Attaching form...`)

    try {
      const attachedForm = await bot.itsmService.attachFormToIssue(issueKey, formTemplateId)
      msg.addLine(`${ICONS.success} Form attached!`)
        .addLine(`Form ID: ${attachedForm.id}`)
        .addLine(`Form Name: ${attachedForm.name || 'N/A'}`)
    } catch (error) {
      msg.addLine(`${ICONS.error} Failed: ${error.message}`)
    }

    await context.sendActivity(msg.build())
  } catch (error) {
    console.error('Test attach error:', error)
    await context.sendActivity(`${ICONS.error} Error: ${error.message}`)
  }
}

