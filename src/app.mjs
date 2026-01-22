/**
 * Application Entry Point
 * Initializes and starts the Teams bot application
 */
import { JiraBot } from './bot/JiraBot.mjs'
import { createServer, startServer } from './server.mjs'
import { validateConfig } from './config/env.mjs'

validateConfig()

const bot = new JiraBot()

const app = createServer(bot)
startServer(app)
