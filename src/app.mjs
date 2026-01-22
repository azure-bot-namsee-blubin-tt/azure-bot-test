/**
 * Application Entry Point
 * Uses custom server for flexible auth (supports local dev without auth)
 */
import { JiraBot } from './bot/JiraBot.mjs'
import { validateConfig } from './config/env.mjs'
import { createServer, startServer } from './server.mjs'

validateConfig()

const bot = new JiraBot()
const app = createServer(bot)
startServer(app)
