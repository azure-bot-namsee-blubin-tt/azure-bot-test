/**
 * Express Server Setup
 * Configures and starts the HTTP server for the bot
 */
import express from 'express'
import { CloudAdapter, getAuthConfigWithDefaults } from '@microsoft/agents-hosting'
import { config } from './config/env.mjs'

/**
 * Create and configure the Express server
 * @param {object} bot - Bot instance to handle messages
 * @returns {object} Express app instance
 */
export function createServer(bot) {
  const app = express()
  app.use(express.json())

  const authConfig = getAuthConfigWithDefaults()
  const adapter = new CloudAdapter(authConfig)

  adapter.onTurnError = async (context, error) => {
    console.error('Bot error:', error)
    await context.sendActivity('Sorry, something went wrong.')
  }

  app.post('/api/messages', async (req, res) => {
    console.log('Received message:', req.body.text || req.body.type)

    try {
      await adapter.process(req, res, (context) => bot.run(context))
    } catch (error) {
      console.error('Error processing message:', error)
      res.status(500).json({ error: error.message })
    }
  })

  // Test endpoint WITHOUT auth
  app.post('/test', async (req, res) => {
    console.log('Test message received:', req.body.text)

    const mockResponses = []
    const mockContext = {
      activity: req.body,
      sendActivity: async (text) => {
        const message = typeof text === 'string' ? text : text.text || JSON.stringify(text)
        mockResponses.push(message)
        console.log('🤖 Bot response:', message)
        return { id: Date.now().toString() }
      }
    }

    try {
      await bot._handleMessage(mockContext)
      res.json({
        success: true,
        responses: mockResponses
      })
    } catch (error) {
      console.error('Error:', error)
      res.status(500).json({ error: error.message })
    }
  })

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      jira: !!bot.jiraService,
      itsm: !!bot.itsmService
    })
  })

  return app
}

/**
 * Start the server
 * @param {object} app - Express app instance
 * @param {number} port - Port number (default from config)
 */
export function startServer(app, port = config.port) {
  app.listen(port, () => {
    console.log(`\nServer running on port ${port}`)
    console.log(`   - Teams endpoint: POST http://localhost:${port}/api/messages`)
    console.log(`   - Test endpoint:  POST http://localhost:${port}/test`)
    console.log(`   - Health check:   GET  http://localhost:${port}/health\n`)
  })
}
