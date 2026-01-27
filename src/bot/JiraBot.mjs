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
    const wrappedContext = wrapContextForChannel(context)
    await wrappedContext.sendActivity(welcomeMessage())
  }

  /**
   * Handle incoming message activity
   * Routes to appropriate handler based on conversation state
   * @private
   * @param {object} context - Turn context from bot framework
   * @returns {Promise<void>}
   */
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
    }

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
