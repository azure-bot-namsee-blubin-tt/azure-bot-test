// Initialize OpenTelemetry FIRST - before any other imports
import './telemetry/index.mjs'

// DEV
/**
 * Application Entry Point
 */
import { JiraBot } from './bot/JiraBot.mjs'
import { validateConfig } from './config/env.mjs'
import { createServer, startServer } from './server.mjs'

validateConfig()

const bot = new JiraBot()
const app = createServer(bot)

startServer(app)


// PROD
/**
 * Application Entry Point
 */
// import { JiraBot } from './bot/JiraBot.mjs'
// import { validateConfig } from './config/env.mjs'
// import { startServer } from '@microsoft/agents-hosting-express'                                                                                       

// validateConfig()

// const bot = new JiraBot()

// startServer(bot)
