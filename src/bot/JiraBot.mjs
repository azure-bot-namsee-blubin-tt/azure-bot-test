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
  "<div style='font-family: sans-serif; max-width: 500px;'>",
  "  <h2 style='margin-bottom: 10px;'>👋 Welcome!</h2>",
  "  <p>I can help you with <strong>JIRA</strong> tickets and <strong>ITSM</strong> requests.</p>",
  "  <table style='width: 100%; border-collapse: collapse; margin-top: 15px;'>",
  "    <thead>",
  "      <tr style='border-bottom: 2px solid #eee;'>",
  "        <th style='text-align: left; padding: 8px;'>Category</th>",
  "        <th style='text-align: left; padding: 8px;'>Command</th>",
  "        <th style='text-align: left; padding: 8px;'>Action</th>",
  "      </tr>",
  "    </thead>",
  "    <tbody>",
  "      <tr>",
  "        <td rowspan='4' style='vertical-align: top; padding: 10px 8px; font-weight: bold;'>📝 JIRA</td>",
  "        <td style='padding: 5px 8px;'><code>create</code></td>",
  "        <td style='padding: 5px 8px;'>Create a new ticket</td>",
  "      </tr>",
  "      <tr>",
  "        <td style='padding: 5px 8px;'><code>my tickets</code></td>",
  "        <td style='padding: 5px 8px;'>View assigned tickets</td>",
  "      </tr>",
  "      <tr>",
  "        <td style='padding: 5px 8px;'><code>search &lt;q&gt;</code></td>",
  "        <td style='padding: 5px 8px;'>Search for tickets</td>",
  "      </tr>",
  "      <tr style='border-bottom: 1px solid #eee;'>",
  "        <td style='padding: 5px 8px;'><code>view &lt;id&gt;</code></td>",
  "        <td style='padding: 5px 8px;'>View details</td>",
  "      </tr>",
  "      <tr>",
  "        <td rowspan='3' style='vertical-align: top; padding: 10px 8px; font-weight: bold;'>⚙ ITSM</td>",
  "        <td style='padding: 5px 8px;'><code>create</code></td>",
  "        <td style='padding: 5px 8px;'>New ITSM request</td>",
  "      </tr>",
  "      <tr>",
  "        <td style='padding: 5px 8px;'><code>forms</code></td>",
  "        <td style='padding: 5px 8px;'>Show templates</td>",
  "      </tr>",
  "      <tr>",
  "        <td style='padding: 5px 8px;'><code>debug</code></td>",
  "        <td style='padding: 5px 8px;'>Field info</td>",
  "      </tr>",
  "    </tbody>",
  "  </table>",
  "  <p style='margin-top: 20px; font-size: 0.9em;'>Type <b><code>help</code></b> to see this table again.</p>",
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

  async _sendTyping(context) {
    await context.sendActivity({ type: 'typing' })
  }
}
