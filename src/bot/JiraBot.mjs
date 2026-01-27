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
    const welcomeMessage = [
      "<div style='font-family: sans-serif;'>",
      "  <h3 style='margin-bottom: 5px;'>👋 Welcome!</h3>",
      "  <p style='margin-bottom: 5px;'>I can help you with <strong>JIRA</strong> tickets and <strong>ITSM</strong> requests.</p>",
      "  <hr style='border: 0; border-top: 1px solid #000000;'>",
      "  <div style='margin-bottom: 25px;'>",
      "    <div style='display: flex; align-items: center;'>",
      "      <div style='margin-right: 5px; vertical-align: middle;'>",
      "         <svg width='16' height='16' viewBox='0 0 75 75' fill='none' xmlns='http://www.w3.org/2000/svg'>",
      "           <path d='M0 18.75C0 8.39466 8.39466 0 18.75 0H56.25C66.6053 0 75 8.39466 75 18.75V56.25C75 66.6053 66.6053 75 56.25 75H18.75C8.39466 75 0 66.6053 0 56.25V18.75Z' fill='#FFC716'/>",
      "           <g>",
      "           <path d='M42.8146 31.883H56.7624C58.8572 31.883 59.5724 33.8756 58.2952 35.4594L36.4793 62.3843C29.4288 56.7643 30.093 47.8745 35.2532 41.3859L42.8146 31.883ZM32.0344 42.6121H18.0866C15.9919 42.6121 15.2766 40.6196 16.5539 39.0357L38.3697 12.1108C45.4202 17.7308 44.6539 26.5185 39.5448 33.0581L32.0344 42.6121Z' fill='#101214'/>",
      "           </g>",
      "          </svg>",
      "      </div>",
      "      <strong style='line-height: 1; vertical-align: middle;'>JIRA</strong>",
      "    </div>",
      "    <ul style='margin-top: 10px; padding-left: 20px;'>",
      "      <li style='margin-bottom: 10px;'><strong><code>jira create</code></strong> — Create a new Jira ticket</li>",
      "      <li style='margin-bottom: 10px;'><strong><code>jira my tickets</code></strong> — View your assigned tickets</li>",
      "      <li style='margin-bottom: 10px;'><strong><code>jira search &lt;query&gt;</code></strong> — Search for tickets</li>",
      "      <li style='margin-bottom: 10px;'><strong><code>jira view &lt;KEY-123&gt;</code></strong> — View ticket details</li>",
      "    </ul>",
      "  </div>",
      "",
      "  <div style='margin-bottom: 25px;'>",
      "    <div style='display: flex; align-items: center;'>",
      "      <img src='/assets/icons/jira-sm.svg' style='margin-right: 5px; vertical-align: middle;'>",
      "      <strong style='line-height: 1; vertical-align: middle;'>ITSM</strong>",
      "    </div>",
      "    <ul style='margin-top: 10px; padding-left: 20px;'>",
      "      <li style='margin-bottom: 10px;'><strong><code>itsm create</code></strong> — Create a new ITSM request</li>",
      "      <li style='margin-bottom: 10px;'><strong><code>itsm forms</code></strong> — Show available form templates</li>",
      "      <li style='margin-bottom: 10px;'><strong><code>itsm debug</code></strong> — Debug fields info</li>",
      "    </ul>",
      "  </div>",
      "",
      "  <hr style='border: 0; border-top: 1px solid #000000;'>",
      "  <p style='margin-bottom: 5px;'>Type <b><code>help</code></b> to show this message again.</p>",
      "  <p><strong>Ready?</strong> Type <b><code>jira create</code></b> or <b><code>itsm create</code></b> to get started!</p>",
      "</div>"
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
