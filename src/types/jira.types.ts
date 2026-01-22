/**
 * Jira Type Definitions
 * Types for Jira REST API interactions
 */

export interface JiraConfig {
  baseUrl: string
  email: string
  apiToken: string
  projectKey?: string
}

export interface JiraIssue {
  id: string
  key: string
  self: string
  fields: JiraIssueFields
}

export interface JiraIssueFields {
  summary: string
  description?: string | ADFDocument
  status: JiraStatus
  issuetype: JiraIssueType
  priority?: JiraPriority
  assignee?: JiraUser
  reporter?: JiraUser
  created: string
  updated: string
  labels?: string[]
  components?: JiraComponent[]
}

export interface JiraStatus {
  id: string
  name: string
  statusCategory: {
    id: number
    key: string
    name: string
  }
}

export interface JiraIssueType {
  id: string
  name: string
  description?: string
  subtask: boolean
  iconUrl?: string
}

export interface JiraPriority {
  id: string
  name: string
  iconUrl?: string
}

export interface JiraUser {
  accountId: string
  displayName: string
  emailAddress?: string
  avatarUrls?: Record<string, string>
  active: boolean
}

export interface JiraComponent {
  id: string
  name: string
  description?: string
}

export interface JiraSearchResponse {
  startAt: number
  maxResults: number
  total: number
  issues: JiraIssue[]
}

export interface JiraCreateIssueResponse {
  id: string
  key: string
  self: string
}

export interface CreateTicketInput {
  summary: string
  description?: string
  issueType?: string
  priority?: string
  assignee?: string
  labels?: string[]
}

export interface ADFDocument {
  version: number
  type: 'doc'
  content: ADFNode[]
}

export interface ADFNode {
  type: string
  content?: ADFNode[]
  text?: string
  attrs?: Record<string, unknown>
  marks?: ADFMark[]
}

export interface ADFMark {
  type: string
  attrs?: Record<string, unknown>
}

export interface JiraConversationState {
  awaitingTicketDetails: boolean
  step: 'summary' | 'description' | 'type' | 'priority' | 'confirm'
  ticketData: Partial<CreateTicketInput>
}
