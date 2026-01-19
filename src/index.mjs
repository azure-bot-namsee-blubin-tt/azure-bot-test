// index.mjs
import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication } from '@microsoft/agents-hosting'

class SimpleBot extends AgentApplication {
  constructor() {
    super({})
    this.userStates = new Map() // Track user state for calculator mode

    this.onConversationUpdate('membersAdded', this._welcome)
    this.onActivity('message', this._handleMessage)
  }

  _welcome = async context => {
    await context.sendActivity('Welcome! Type "menu" to see available options.')
  }

  _showMenu = async context => {
    const menuText = `📋 **Main Menu**\n\n` +
      `1️⃣ **Calculator** - Type "calc" to start\n` +
      `2️⃣ **Help** - Type "help" for assistance\n` +
      `3️⃣ **Menu** - Type "menu" to show this menu\n\n` +
      `Choose an option by typing the command.`
    await context.sendActivity(menuText)
  }

  _handleMessage = async context => {
    const userId = context.activity.from.id
    const text = context.activity.text?.toLowerCase().trim()
    const userState = this.userStates.get(userId) || { mode: 'normal' }

    // Handle calculator mode
    if (userState.mode === 'calculator') {
      if (text === 'exit' || text === 'quit') {
        this.userStates.set(userId, { mode: 'normal' })
        await context.sendActivity('Exited calculator mode. Type "menu" for options.')
        return
      }
      await this._calculate(context, context.activity.text)
      return
    }

    // Handle normal commands
    switch (text) {
      case 'menu':
        await this._showMenu(context)
        break
      case 'calc':
      case 'calculator':
        this.userStates.set(userId, { mode: 'calculator' })
        await context.sendActivity(
          `🧮 **Calculator Mode**\n\n` +
          `Enter a math expression (e.g., "5 + 3", "10 * 2", "100 / 4")\n` +
          `Supported operators: + - * / ^ (power) % (modulo)\n\n` +
          `Type "exit" to return to main menu.`
        )
        break
      case 'help':
        await context.sendActivity(
          `ℹ️ **Help**\n\n` +
          `• Type "menu" to see all options\n` +
          `• Type "calc" to use the calculator\n` +
          `• Type "help" to see this message`
        )
        break
      default:
        await context.sendActivity(`You said: ${context.activity.text}\n\nType "menu" to see available options.`)
    }
  }

  _calculate = async (context, expression) => {
    try {
      // Sanitize and validate the expression
      const sanitized = expression.replace(/\s+/g, '')
      
      // Only allow numbers and basic operators
      if (!/^[\d+\-*/().^%]+$/.test(sanitized)) {
        await context.sendActivity('❌ Invalid expression. Use only numbers and operators: + - * / ^ %')
        return
      }

      // Replace ^ with ** for power operation
      const jsExpression = sanitized.replace(/\^/g, '**')
      
      // Evaluate the expression safely
      const result = Function(`"use strict"; return (${jsExpression})`)()
      
      if (typeof result !== 'number' || !isFinite(result)) {
        await context.sendActivity('❌ Invalid calculation result.')
        return
      }

      await context.sendActivity(`🧮 ${expression} = **${result}**`)
    } catch (error) {
      await context.sendActivity('❌ Error calculating. Please check your expression.\nExample: "5 + 3" or "10 * 2"')
    }
  }
}

startServer(new SimpleBot())