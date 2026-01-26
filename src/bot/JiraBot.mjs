/**
 * JiraBot - Main bot class
 * Handles message routing and command processing
 */
import { AgentApplication } from '@microsoft/agents-hosting'
import { createJiraServiceFromEnv } from '../services/jira.service.mjs'
import { createITSMServiceFromEnv } from '../services/itsm.service.mjs'
import { getState, deleteState } from '../state/conversation.mjs'
import { createJiraHandlers } from '../components/jira/index.mjs'
import { createITSMHandlers } from '../components/itsm/index.mjs'
import { wrapContextForChannel } from '../utils/helpers.mjs'

export class JiraBot extends AgentApplication {
  constructor() {
    super({})

    this._initializeServices()

    this.jiraHandlers = createJiraHandlers(this)
    this.itsmHandlers = createITSMHandlers(this)

    this.onConversationUpdate('membersAdded', this._welcome)
    this.onActivity('message', this._handleMessage)
  }

  _initializeServices() {
    try {
      this.jiraService = createJiraServiceFromEnv()
      console.log('Jira service initialized successfully')
    } catch (error) {
      console.warn('Jira service not configured:', error.message)
      this.jiraService = null
    }

    try {
      this.itsmService = createITSMServiceFromEnv()
      console.log('ITSM service initialized successfully')
    } catch (error) {
      console.warn('ITSM service not configured:', error.message)
      this.itsmService = null
    }
  }

  _welcome = async context => {
    // Wrap context for channel-specific formatting (handles Telegram vs Teams)
    const wrappedContext = wrapContextForChannel(context)

    // Use HTML format - wrapper will convert to plain text for Telegram
    // const welcomeMessage =
    //   'Welcome! I can help you with Jira tickets and ITSM requests.<br/><br/>' +
    //   '<b>JIRA</b><br/>' +
    //   '<code>jira create</code> - Create a new Jira ticket<br/>' +
    //   '<code>jira my tickets</code> - View your assigned tickets<br/>' +
    //   '<code>jira search &lt;query&gt;</code> - Search for tickets<br/>' +
    //   '<code>jira view &lt;TICKET-123&gt;</code> - View ticket details<br/><br/>' +
    //   '<b>ITSM</b><br/>' +
    //   '<code>itsm create</code> - Create a new ITSM request<br/>' +
    //   '<code>itsm forms</code> - Show available form templates<br/>' +
    //   '<code>itsm debug</code> - Debug fields info<br/><br/>' +
    //   '<code>help</code> - Show this help message<br/><br/>' +
    //   'Type <code>jira create</code> or <code>itsm create</code> to get started!'

    const welcomeMessage = [
      "**👋 Welcome!**",
      "",
      "I can help you with **JIRA** tickets and **ITSM** requests.",
      "",
      "---",
      "**<img src='https://cdn-icons-png.flaticon.com/512/5968/5968875.png' width='12' height='12' style='vertical-align:middle'> JIRA**",
      "* `jira create` — Create a new Jira ticket",
      "* `jira my tickets` — View your assigned tickets",
      "* `jira search <query>` — Search for tickets",
      "* `jira view <KEY-123>` — View ticket details",
      "",
     "**<img src='https://e7.pngegg.com/pngimages/339/655/png-clipart-jira-computer-software-customer-service-atlassian-help-desk-jira-blue-angle.png' width='12' height='12' style='vertical-align:middle'> ITSM**",
      "* `itsm create` — Create a new ITSM request",
      "* `itsm forms` — Show available form templates",
      "* `itsm debug` — Debug fields info",
      "",
      "---",
      "Type `help` to show this message again.",
      "",
      "**Ready?** Type `jira create` or `itsm create` to get started!"
    ].join('\n');

    await wrappedContext.sendActivity(welcomeMessage)
  }

  _handleMessage = async context => {
    await this._sendTyping(context)

    // Wrap context for channel-specific message formatting
    const wrappedContext = wrapContextForChannel(context)

    const text = context.activity.text?.trim() || ''
    const conversationId = context.activity.conversation?.id || 'default'
    const state = getState(conversationId)

    if (state.awaitingTicketDetails) {
      await this.jiraHandlers.handleTicketFlow(wrappedContext, text, state, conversationId)
      return
    }

    if (state.awaitingITSMDetails) {
      await this.itsmHandlers.handleRequestFlow(wrappedContext, text, state, conversationId)
      return
    }

    await this._routeCommand(wrappedContext, text, conversationId)
  }

  async _routeCommand(context, text, conversationId) {
    const lowerText = text.toLowerCase()

    if (lowerText === 'help' || lowerText === 'hi' || lowerText === 'hello') {
      await this._welcome(context)
      return
    }

    if (lowerText === 'cancel') {
      deleteState(conversationId)
      await context.sendActivity('Operation cancelled.')
      return
    }

    if (lowerText === 'jira create' || lowerText === 'create ticket') {
      await this.jiraHandlers.startTicketCreation(context, conversationId)
      return
    }

    if (lowerText === 'jira my tickets' || lowerText === 'my tickets') {
      await this.jiraHandlers.showMyTickets(context)
      return
    }``

    if (lowerText.startsWith('jira search ')) {
      const query = text.substring(12).trim()
      await this.jiraHandlers.searchTickets(context, query)
      return
    }

    if (lowerText.startsWith('jira view ')) {
      const ticketKey = text.substring(10).trim().toUpperCase()
      await this.jiraHandlers.viewTicket(context, ticketKey)
      return
    }

    if (lowerText === 'itsm create' || lowerText === 'create request') {
      await this.itsmHandlers.startRequestCreation(context, conversationId)
      return
    }

    if (lowerText === 'itsm debug') {
      await this.itsmHandlers.debugFields(context)
      return
    }

    if (lowerText === 'itsm forms' || lowerText.startsWith('itsm forms ')) {
      const projectKey = text.split(' ')[2] || 'I0'
      await this.itsmHandlers.showForms(context, projectKey)
      return
    }

    if (lowerText.startsWith('itsm attach ')) {
      const parts = text.split(' ')
      const issueKey = parts[2]
      const formTemplateId = parts[3]
      await this.itsmHandlers.testAttachForm(context, issueKey, formTemplateId)
      return
    }

    if (lowerText.startsWith('jira:') || lowerText.startsWith('ticket:')) {
      const summary = text.substring(text.indexOf(':') + 1).trim()
      if (summary) {
        await this.jiraHandlers.quickCreateTicket(context, summary)
        return
      }
    }

    await context.sendActivity(
      `I didn't understand that. Type "help" to see available commands.\n\nQuick tip: Type "jira: Your ticket title" to quickly create a ticket!`
    )
  }

  async _sendTyping(context) {
    await context.sendActivity({ type: 'typing' })
  }
}
