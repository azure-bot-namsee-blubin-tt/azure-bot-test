/**
 * Application Entry Point
 * Uses @microsoft/agents-hosting-express for automatic auth handling
 */
import { startServer } from '@microsoft/agents-hosting-express'
import { JiraBot } from './bot/JiraBot.mjs'
import { validateConfig } from './config/env.mjs'

validateConfig()

const bot = new JiraBot()
startServer(bot)
