/**
 * Express Server Setup
 * Configures and starts the HTTP server for the bot
 */
import express from 'express'
import { CloudAdapter, loadAuthConfigFromEnv, getAuthConfigWithDefaults } from '@microsoft/agents-hosting'
import { config } from './config/env.mjs'

/**
 * Create and configure the Express server
 * @param {object} bot - Bot instance to handle messages
 * @returns {object} Express app instance
 */
export function createServer(bot) {
  const app = express()
  app.use(express.json())

  const isLocalDev = process.env.LOCAL_DEV === 'true'

  let authConfig

  if (isLocalDev) {
    authConfig = getAuthConfigWithDefaults({})
  } else {
    authConfig = loadAuthConfigFromEnv()

    if (authConfig.tenantId) {
      authConfig.authority = `https://login.microsoftonline.com/${authConfig.tenantId}`
      authConfig.issuers = [
        ...(authConfig.issuers || []),
        `https://sts.windows.net/${authConfig.tenantId}/`,
        `https://login.microsoftonline.com/${authConfig.tenantId}/v2.0`,
        'https://api.botframework.com',
        'https://sts.windows.net/d6d49420-f39b-4df7-a1dc-d59a935871db/',
      ]
    }

    console.log('Auth config result:', {
      clientId: authConfig.clientId ? authConfig.clientId.slice(0, 8) + '...' : 'NOT SET',
      tenantId: authConfig.tenantId || 'NOT SET (multi-tenant)',
      hasSecret: !!authConfig.clientSecret,
      authority: authConfig.authority || 'default',
    })
  }

  const adapter = new CloudAdapter(authConfig)

  adapter.onTurnError = async (context, error) => {
    console.error('Bot error:', error)
    await context.sendActivity('Sorry, something went wrong.')
  }

  app.post('/api/messages', async (req, res) => {
    console.log('Received message:', req.body.text || req.body.type)
    console.log('ServiceUrl:', req.body.serviceUrl)
    console.log('ChannelId:', req.body.channelId)

    try {
      await adapter.process(req, res, (context) => bot.run(context))
    } catch (error) {
      console.error('Error processing message:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      res.status(500).json({ error: error.message })
    }
  })

  app.post('/test', async (req, res) => {
    console.log('Test request body:', req.body)
    console.log('Content-Type:', req.get('Content-Type'))

    if (!req.body || !req.body.text) {
      return res.status(400).json({ error: 'Missing body or text field. Send: {"text": "your message", "type": "message"}' })
    }

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
