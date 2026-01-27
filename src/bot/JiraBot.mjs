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
import { wrapContextForChannel } from '../utils/index.mjs'
import { welcomeMessage } from './templates.mjs'
import {
  withSpan,
  botMetrics,
  log,
  addSpanAttributes,
  recordError,
} from '../telemetry/index.mjs'

/**
 * JiraBot - Main bot class for Microsoft Teams
 * Handles message routing and command processing for Jira and ITSM operations
 * @extends AgentApplication
 */
export class JiraBot extends AgentApplication {
  /**
   * Create a new JiraBot instance
   * Initializes services and sets up event handlers
   */
  constructor() {
    super({})

    this._initializeServices()

    this.jiraHandlers = createJiraHandlers(this)
    this.itsmHandlers = createITSMHandlers(this)

    this.onConversationUpdate('membersAdded', this._welcome)
    this.onActivity('message', this._handleMessage)
  }

  /**
   * Initialize Jira and ITSM services from environment configuration
   * @private
   */
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

  /**
   * Send welcome message to new conversation members
   * @private
   * @param {object} context - Turn context from bot framework
   * @returns {Promise<void>}
   */
  _welcome = async context => {
    console.log('=== Welcome handler started ===')
    console.log('Context type:', typeof context)
    console.log('Activity type:', context?.activity?.type)
    
    try {
      const wrappedContext = wrapContextForChannel(context)
      console.log('Wrapped context created')
      
      const message = welcomeMessage()
      console.log('Welcome message generated, length:', message?.length)
      
      await wrappedContext.sendActivity(message)
      console.log('Welcome message sent successfully')
    } catch (error) {
      console.error('=== Welcome handler error ===')
      console.error('Error type:', error?.constructor?.name)
      console.error('Error message:', error?.message)
      console.error('Error stack:', error?.stack)
      throw error
    }
  }

  /**
   * Handle incoming message activity
   * Routes to appropriate handler based on conversation state
   * @private
   * @param {object} context - Turn context from bot framework
   * @returns {Promise<void>}
   */
  _handleMessage = async context => {
    const startTime = Date.now()
    const text = context.activity.text?.trim() || ''
    const conversationId = context.activity.conversation?.id || 'default'
    const channelId = context.activity.channelId || 'unknown'

    // Track message received
    botMetrics.messagesReceived.add(1, { channel: channelId })
    log(`Message received: ${text.substring(0, 50)}...`, 'INFO', { conversationId, channel: channelId })

    await withSpan('bot.handleMessage', async (span) => {
      span.setAttributes({
        'bot.message.text': text.substring(0, 100),
        'bot.conversation.id': conversationId,
        'bot.channel.id': channelId,
      })

      try {
        await this._sendTyping(context)

        // Wrap context for channel-specific message formatting
        const wrappedContext = wrapContextForChannel(context)
        const state = getState(conversationId)

        if (state.awaitingTicketDetails) {
          span.setAttribute('bot.flow', 'jira_ticket_creation')
          await this.jiraHandlers.handleTicketFlow(wrappedContext, text, state, conversationId)
          return
        }

        if (state.awaitingITSMDetails) {
          span.setAttribute('bot.flow', 'itsm_request_creation')
          await this.itsmHandlers.handleRequestFlow(wrappedContext, text, state, conversationId)
          return
        }

        await this._routeCommand(wrappedContext, text, conversationId)
      } catch (error) {
        botMetrics.errors.add(1, { channel: channelId, error_type: error.name })
        recordError(error)
        log(`Error handling message: ${error.message}`, 'ERROR', { conversationId, error: error.stack })
        throw error
      } finally {
        const duration = Date.now() - startTime
        botMetrics.messageProcessingDuration.record(duration, { channel: channelId })
      }
    })
  }

  /**
   * Route text commands to appropriate handlers
   * @private
   * @param {object} context - Turn context from bot framework
   * @param {string} text - User input text
   * @param {string} conversationId - Unique conversation identifier
   * @returns {Promise<void>}
   */
  async _routeCommand(context, text, conversationId) {
    const lowerText = text.toLowerCase()
    let command = 'unknown'

    if (lowerText === 'help' || lowerText === 'hi' || lowerText === 'hello') {
      command = 'help'
      botMetrics.commandsExecuted.add(1, { command })
      addSpanAttributes({ 'bot.command': command })
      await this._welcome(context)
      return
    }

    if (lowerText === 'cancel') {
      command = 'cancel'
      botMetrics.commandsExecuted.add(1, { command })
      addSpanAttributes({ 'bot.command': command })
      deleteState(conversationId)
      await context.sendActivity('Operation cancelled.')
      return
    }

    if (lowerText === 'jira create' || lowerText === 'create ticket') {
      command = 'jira_create'
      botMetrics.commandsExecuted.add(1, { command })
      addSpanAttributes({ 'bot.command': command })
      await this.jiraHandlers.startTicketCreation(context, conversationId)
      return
    }

    if (lowerText === 'jira my tickets' || lowerText === 'my tickets') {
      command = 'jira_my_tickets'
      botMetrics.commandsExecuted.add(1, { command })
      addSpanAttributes({ 'bot.command': command })
      await this.jiraHandlers.showMyTickets(context)
      return
    }

    if (lowerText.startsWith('jira search ')) {
      command = 'jira_search'
      botMetrics.commandsExecuted.add(1, { command })
      addSpanAttributes({ 'bot.command': command })
      const query = text.substring(12).trim()
      await this.jiraHandlers.searchTickets(context, query)
      return
    }

    if (lowerText.startsWith('jira view ')) {
      command = 'jira_view'
      botMetrics.commandsExecuted.add(1, { command })
      addSpanAttributes({ 'bot.command': command })
      const ticketKey = text.substring(10).trim().toUpperCase()
      await this.jiraHandlers.viewTicket(context, ticketKey)
      return
    }

    if (lowerText === 'itsm create' || lowerText === 'create request') {
      command = 'itsm_create'
      botMetrics.commandsExecuted.add(1, { command })
      addSpanAttributes({ 'bot.command': command })
      await this.itsmHandlers.startRequestCreation(context, conversationId)
      return
    }

    if (lowerText === 'itsm debug') {
      command = 'itsm_debug'
      botMetrics.commandsExecuted.add(1, { command })
      addSpanAttributes({ 'bot.command': command })
      await this.itsmHandlers.debugFields(context)
      return
    }

    if (lowerText === 'itsm forms' || lowerText.startsWith('itsm forms ')) {
      command = 'itsm_forms'
      botMetrics.commandsExecuted.add(1, { command })
      addSpanAttributes({ 'bot.command': command })
      const projectKey = text.split(' ')[2] || 'I0'
      await this.itsmHandlers.showForms(context, projectKey)
      return
    }

    if (lowerText.startsWith('itsm attach ')) {
      command = 'itsm_attach'
      botMetrics.commandsExecuted.add(1, { command })
      addSpanAttributes({ 'bot.command': command })
      const parts = text.split(' ')
      const issueKey = parts[2]
      const formTemplateId = parts[3]
      await this.itsmHandlers.testAttachForm(context, issueKey, formTemplateId)
      return
    }

    if (lowerText.startsWith('jira:') || lowerText.startsWith('ticket:')) {
      const summary = text.substring(text.indexOf(':') + 1).trim()
      if (summary) {
        command = 'jira_quick_create'
        botMetrics.commandsExecuted.add(1, { command })
        addSpanAttributes({ 'bot.command': command })
        await this.jiraHandlers.quickCreateTicket(context, summary)
        return
      }
    }

    command = 'unknown'
    botMetrics.commandsExecuted.add(1, { command })
    addSpanAttributes({ 'bot.command': command })
    await context.sendActivity(
      `I didn't understand that. Type "help" to see available commands.\n\nQuick tip: Type "jira: Your ticket title" to quickly create a ticket!`
    )
  }

  /**
   * Send typing indicator to show bot is processing
   * @private
   * @param {object} context - Turn context from bot framework
   * @returns {Promise<void>}
   */
  async _sendTyping(context) {
    await context.sendActivity({ type: 'typing' })
  }
}
