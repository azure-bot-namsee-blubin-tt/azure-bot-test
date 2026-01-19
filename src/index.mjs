// index.mjs
import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication } from '@microsoft/agents-hosting'

class SimpleBot extends AgentApplication {
  constructor() {
    super({})

    this.onConversationUpdate('membersAdded', this._welcome)
    this.onActivity('message', this._handleMessage)
  }

  _welcome = async context => {
    await context.sendActivity('Welcome! Say "hi" to get started.')
  }

  _handleMessage = async context => {
    const text = context.activity.text?.toLowerCase().trim()
    
    if (text === 'hi') {
      await context.sendActivity('hello')
    } else {
      await context.sendActivity(`You said: ${context.activity.text}`)
    }
  }
}

startServer(new SimpleBot())