/**
 * Jira Handlers
 * Handles all Jira ticket-related commands and flows
 */
import { getState, setState, deleteState } from '../../state/conversation.mjs'
import { config } from '../../config/env.mjs'
import { sendTyping, extractTextFromADF } from '../../utils/index.mjs'

/**
 * Create Jira handlers bound to bot instance
 * @param {object} bot - Bot instance with jiraService
 * @returns {object} Object containing all Jira handler functions:
 *   - startTicketCreation: Start interactive ticket creation flow
 *   - handleTicketFlow: Handle user input during ticket creation
 *   - quickCreateTicket: Create ticket with single command
 *   - showMyTickets: Display user's assigned tickets
 *   - searchTickets: Search for tickets by query
 *   - viewTicket: View ticket details
 */
export function createJiraHandlers(bot) {
  return {
    startTicketCreation: (ctx, convId) => startTicketCreation(bot, ctx, convId),
    handleTicketFlow: (ctx, text, state, convId) => handleTicketFlow(bot, ctx, text, state, convId),
    quickCreateTicket: (ctx, summary) => quickCreateTicket(bot, ctx, summary),
    showMyTickets: (ctx) => showMyTickets(bot, ctx),
    searchTickets: (ctx, query) => searchTickets(bot, ctx, query),
    viewTicket: (ctx, ticketKey) => viewTicket(bot, ctx, ticketKey),
  }
}

/**
 * Ticket Creation Flow
 */

/**
 * Start the interactive ticket creation flow
 * @param {object} bot - Bot instance with jiraService
 * @param {object} context - Turn context from bot framework
 * @param {string} conversationId - Unique conversation identifier
 * @returns {Promise<void>}
 */
async function startTicketCreation(bot, context, conversationId) {
  if (!bot.jiraService) {
    await context.sendActivity(
      '❌ Jira integration is not configured. Please set up your Jira credentials in the environment variables.'
    )
    return
  }

  const state = {
    awaitingTicketDetails: true,
    ticketData: {},
    step: 'summary',
  }
  setState(conversationId, state)

  await context.sendActivity(
    `Let's create a new Jira ticket.\n\n**Step 1/4:** What is the **summary** (title) for this ticket?\n\n_(Type \`cancel\` to abort)_`
  )
}

/**
 * Handle user input during ticket creation flow
 * @param {object} bot - Bot instance with jiraService
 * @param {object} context - Turn context from bot framework
 * @param {string} text - User input text
 * @param {object} state - Current conversation state
 * @param {string} conversationId - Unique conversation identifier
 * @returns {Promise<void>}
 */
async function handleTicketFlow(bot, context, text, state, conversationId) {
  if (text.toLowerCase() === 'cancel') {
    deleteState(conversationId)
    await context.sendActivity('Ticket creation cancelled.')
    return
  }

  const ticketData = state.ticketData || {}

  switch (state.step) {
    case 'summary':
      ticketData.summary = text
      state.ticketData = ticketData
      state.step = 'description'
      setState(conversationId, state)
      await context.sendActivity(
        `**Step 2/4:** Provide a **description** for the ticket:\n\n_(Type \`skip\` to leave blank)_`
      )
      break

    case 'description':
      if (text.toLowerCase() !== 'skip') {
        ticketData.description = text
      }
      state.ticketData = ticketData
      state.step = 'type'
      setState(conversationId, state)
      await context.sendActivity(
        `**Step 3/4:** What **type** of issue is this?\n\n1️⃣ Task\n2️⃣ Bug\n3️⃣ Story\n4️⃣ Epic\n\n_(Type the number or name, or \`skip\` for default: Task)_`
      )
      break

    case 'type':
      if (text.toLowerCase() !== 'skip') {
        const typeMap = {
          '1': 'Task', '2': 'Bug', '3': 'Story', '4': 'Epic',
          'task': 'Task', 'bug': 'Bug', 'story': 'Story', 'epic': 'Epic',
        }
        ticketData.issueType = typeMap[text.toLowerCase()] || 'Task'
      } else {
        ticketData.issueType = 'Task'
      }
      state.ticketData = ticketData
      state.step = 'priority'
      setState(conversationId, state)
      await context.sendActivity(
        `**Step 4/4:** What **priority** should this be?\n\n1️⃣ Highest\n2️⃣ High\n3️⃣ Medium\n4️⃣ Low\n5️⃣ Lowest\n\n_(Type the number or name, or \`skip\` for default: Medium)_`
      )
      break

    case 'priority':
      if (text.toLowerCase() !== 'skip') {
        const priorityMap = {
          '1': 'Highest', '2': 'High', '3': 'Medium', '4': 'Low', '5': 'Lowest',
          'highest': 'Highest', 'high': 'High', 'medium': 'Medium', 'low': 'Low', 'lowest': 'Lowest',
        }
        ticketData.priority = priorityMap[text.toLowerCase()] || 'Medium'
      } else {
        ticketData.priority = 'Medium'
      }
      state.ticketData = ticketData
      state.step = 'confirm'
      setState(conversationId, state)

      const confirmMessage = `📋 **Review your ticket:**

• **Summary:** ${ticketData.summary}
• **Description:** ${ticketData.description || '_(none)_'}
• **Type:** ${ticketData.issueType}
• **Priority:** ${ticketData.priority}

Type \`yes\` to create the ticket or \`no\` to cancel.`

      await context.sendActivity(confirmMessage)
      break

    case 'confirm':
      if (text.toLowerCase() === 'yes' || text.toLowerCase() === 'y') {
        await createTicket(bot, context, ticketData)
        deleteState(conversationId)
      } else if (text.toLowerCase() === 'no' || text.toLowerCase() === 'n') {
        deleteState(conversationId)
        await context.sendActivity('❌ Ticket creation cancelled.')
      } else {
        await context.sendActivity('Please type `yes` to confirm or `no` to cancel.')
      }
      break
  }
}

/**
 * Create a ticket quickly with just a summary
 * @param {object} bot - Bot instance with jiraService
 * @param {object} context - Turn context from bot framework
 * @param {string} summary - Ticket summary/title
 * @returns {Promise<void>}
 */
async function quickCreateTicket(bot, context, summary) {
  if (!bot.jiraService) {
    await context.sendActivity('Jira integration is not configured.')
    return
  }

  try {
    await sendTyping(context)

    const ticket = await bot.jiraService.createTicket({
      summary,
      issueType: 'Task',
      priority: 'Medium',
    })
    const browseUrl = bot.jiraService.getBrowseUrl(ticket.key)

    await context.sendActivity(
      `Ticket created!\n\n**${ticket.key}**: ${summary}\n\n🔗 [View in Jira](${browseUrl})`
    )
  } catch (error) {
    console.error('Error creating ticket:', error)
    await context.sendActivity(`Failed to create ticket: ${error.message}`)
  }
}

/**
 * Create a Jira ticket with full ticket data
 * @param {object} bot - Bot instance with jiraService
 * @param {object} context - Turn context from bot framework
 * @param {object} ticketData - Ticket data containing summary, description, issueType, priority
 * @returns {Promise<void>}
 */
async function createTicket(bot, context, ticketData) {
  if (!bot.jiraService) {
    await context.sendActivity('Jira service is not available.')
    return
  }

  try {
    await sendTyping(context)

    const ticket = await bot.jiraService.createTicket(ticketData)
    const browseUrl = bot.jiraService.getBrowseUrl(ticket.key)

    await context.sendActivity(
      `Ticket created successfully!\n\n**${ticket.key}**: ${ticketData.summary}\n\n🔗 [View in Jira](${browseUrl})`
    )
  } catch (error) {
    console.error('Error creating ticket:', error)
    await context.sendActivity(`Failed to create ticket: ${error.message}`)
  }
}

/**
 * Display the current user's assigned tickets
 * @param {object} bot - Bot instance with jiraService
 * @param {object} context - Turn context from bot framework
 * @returns {Promise<void>}
 */
async function showMyTickets(bot, context) {
  if (!bot.jiraService) {
    await context.sendActivity('Jira service is not configured.')
    return
  }

  try {
    await sendTyping(context)

    const result = await bot.jiraService.getMyIssues(5)

    if (result.issues.length === 0) {
      await context.sendActivity('You have no assigned tickets.')
      return
    }

    let message = `**Your recent tickets (${result.issues.length}):**\n\n`

    for (const issue of result.issues) {
      const status = issue.fields.status.name
      const browseUrl = bot.jiraService.getBrowseUrl(issue.key)
      message += `• **[${issue.key}](${browseUrl})**: ${issue.fields.summary} _(${status})_\n`
    }

    await context.sendActivity(message)
  } catch (error) {
    console.error('Error fetching tickets:', error)
    await context.sendActivity(`Failed to fetch tickets: ${error.message}`)
  }
}

/**
 * Search for Jira tickets by text query
 * @param {object} bot - Bot instance with jiraService
 * @param {object} context - Turn context from bot framework
 * @param {string} query - Search query string
 * @returns {Promise<void>}
 */
async function searchTickets(bot, context, query) {
  if (!bot.jiraService) {
    await context.sendActivity('Jira service is not configured.')
    return
  }

  if (!query) {
    await context.sendActivity('Please provide a search query.\n\n**Usage:** `jira search <query>`')
    return
  }

  try {
    await sendTyping(context)

    const projectKey = config.jira.projectKey
    const jql = `project = ${projectKey} AND text ~ "${query}" ORDER BY updated DESC`
    const result = await bot.jiraService.searchIssues(jql, 5)

    if (result.issues.length === 0) {
      await context.sendActivity(`📭 No tickets found matching "${query}".`)
      return
    }

    let message = `**Search results for "${query}" (${result.issues.length}):**\n\n`

    for (const issue of result.issues) {
      const status = issue.fields.status.name
      const browseUrl = bot.jiraService.getBrowseUrl(issue.key)
      message += `• **[${issue.key}](${browseUrl})**: ${issue.fields.summary} _(${status})_\n`
    }

    await context.sendActivity(message)
  } catch (error) {
    console.error('Error searching tickets:', error)
    await context.sendActivity(`Failed to search tickets: ${error.message}`)
  }
}

/**
 * View details of a specific Jira ticket
 * @param {object} bot - Bot instance with jiraService
 * @param {object} context - Turn context from bot framework
 * @param {string} ticketKey - Jira ticket key (e.g., 'PROJ-123')
 * @returns {Promise<void>}
 */
async function viewTicket(bot, context, ticketKey) {
  if (!bot.jiraService) {
    await context.sendActivity('Jira service is not configured.')
    return
  }

  if (!ticketKey) {
    await context.sendActivity('Please provide a ticket key.\n\n**Usage:** `jira view <TICKET-123>`')
    return
  }

  try {
    await sendTyping(context)

    const issue = await bot.jiraService.getIssue(ticketKey)
    const browseUrl = bot.jiraService.getBrowseUrl(issue.key)

    let description = '_(no description)_'
    if (issue.fields.description) {
      if (typeof issue.fields.description === 'string') {
        description = issue.fields.description
      } else if (issue.fields.description.content) {
        description = extractTextFromADF(issue.fields.description) || '_(no description)_'
      }
    }

    const message = `📋 **${issue.key}**: ${issue.fields.summary}

• **Type:** ${issue.fields.issuetype.name}
• **Status:** ${issue.fields.status.name}
• **Priority:** ${issue.fields.priority?.name || 'None'}
• **Assignee:** ${issue.fields.assignee?.displayName || 'Unassigned'}
• **Reporter:** ${issue.fields.reporter?.displayName || 'Unknown'}

**Description:**
${description}

[View in Jira](${browseUrl})`

    await context.sendActivity(message)
  } catch (error) {
    console.error('Error fetching ticket:', error)
    await context.sendActivity(`Failed to fetch ticket: ${error.message}`)
  }
}

