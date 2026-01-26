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