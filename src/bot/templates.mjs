/**
 * JiraBot Templates
 * HTML templates for bot messages
 */
import { ICONS, HR, boldCode } from '../utils/index.mjs'

// ============================================
// Welcome Message
// ============================================

const WELCOME_CONFIG = [
  {
    icon: ICONS.jira,
    title: 'JIRA',
    commands: [
      { command: 'jira create', description: 'Create a new Jira ticket' },
      { command: 'jira my tickets', description: 'View your assigned tickets' },
      { command: 'jira search <query>', description: 'Search for tickets' },
      { command: 'jira view <KEY-123>', description: 'View ticket details' },
    ],
  },
  {
    icon: ICONS.itsm,
    title: 'ITSM',
    commands: [
      { command: 'itsm create', description: 'Create a new ITSM request' },
      { command: 'itsm forms', description: 'Show available form templates' },
      { command: 'itsm debug', description: 'Debug fields info' },
    ],
  },
]

export function welcomeMessage() {
  const parts = [
    "<div style='font-family: sans-serif;'>",
    "  <h2 style='margin-bottom: 5px;'>👋 Welcome!</h2>",
    "  <p>I can help you with <strong>JIRA</strong> tickets and <strong>ITSM</strong> requests.</p>",
    HR,
  ]

  for (const section of WELCOME_CONFIG) {
    parts.push("  <div style='margin-bottom: 25px;'>")
    parts.push(['    <div>', section.icon, ' <strong>', section.title, '</strong></div>'].join(''))
    parts.push("    <ul style='margin-top: 10px; padding-left: 20px;'>")

    for (const cmd of section.commands) {
      parts.push(['      <li style="margin-bottom: 10px;">', boldCode(cmd.command), ' — ', cmd.description, '</li>'].join(''))
    }

    parts.push('    </ul>')
    parts.push('  </div>')
  }

  parts.push(HR)
  parts.push(['  <p style="margin-bottom: 5px;">Type ', boldCode('help'), ' to show this message again.</p>'].join(''))
  parts.push(['  <p><strong>Ready?</strong> Type ', boldCode('jira create'), ' or ', boldCode('itsm create'), ' to get started!</p>'].join(''))
  parts.push('</div>')

  return parts.join('\n')
}
