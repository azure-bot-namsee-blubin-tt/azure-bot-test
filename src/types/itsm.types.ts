/**
 * ITSM Type Definitions
 * Types for Jira Service Management API interactions
 */

export interface ITSMConfig {
  baseUrl: string
  email: string
  apiToken: string
}

export interface ServiceDesk {
  id: string
  projectId: string
  projectKey: string
  projectName: string
}

export interface ServiceDeskResponse {
  size: number
  start: number
  limit: number
  isLastPage: boolean
  values: ServiceDesk[]
}

export interface PortalGroup {
  id: string
  name: string
}

export interface PortalGroupResponse {
  size: number
  start: number
  limit: number
  isLastPage: boolean
  values: PortalGroup[]
}

export interface RequestType {
  id: string
  name: string
  description?: string
  issueTypeId: string
  serviceDeskId: string
  groupIds?: string[]
  portalId?: string
}

export interface RequestTypeResponse {
  size: number
  start: number
  limit: number
  isLastPage: boolean
  values: RequestType[]
}

export interface RequestTypeField {
  fieldId: string
  name: string
  description?: string
  required: boolean
  visible: boolean
  defaultValues?: FieldValue[]
  validValues?: FieldValue[]
  jiraSchema?: JiraSchema
  source?: 'portal' | 'form'
  formQuestionId?: string
  rowNumber?: number | null
  isTableField?: boolean
  originalLabel?: string
}

export interface FieldValue {
  id?: string
  name?: string
  value?: string
  label?: string
}

export interface JiraSchema {
  type: string
  items?: string
  system?: string
  custom?: string
  customId?: number
}

export interface RequestTypeFieldResponse {
  requestTypeFields: RequestTypeField[]
  canRaiseOnBehalfOf: boolean
  canAddRequestParticipants: boolean
}

export interface FormTemplate {
  id: string
  name?: string
  description?: string
  templateId?: string
  formTemplate?: {
    id: string
  }
  design?: FormDesign
}

export interface FormDesign {
  settings?: FormSettings
  questions?: Record<string, FormQuestion>
  sections?: FormSection[]
  conditions?: FormCondition[]
}

export interface FormSettings {
  templateId?: string
  name?: string
}

export interface FormQuestion {
  id: string
  label: string
  type: FormQuestionType
  required?: boolean
  description?: string
  validation?: FormValidation
  choices?: FormChoice[]
}

export type FormQuestionType =
  | 'tl'   // Text (single line)
  | 'ml'   // Multi-line text
  | 'rt'   // Rich text
  | 'cd'   // Dropdown
  | 'cs'   // Checkbox
  | 'rs'   // Radio select
  | 'dt'   // Date
  | 'tm'   // Time
  | 'us'   // User picker
  | 'em'   // Email
  | 'ur'   // URL
  | 'nu'   // Number
  | 'ph'   // Phone
  | 'at'   // Attachment
  | 'lb'   // Label (display only)
  | 'hd'   // Hidden

export interface FormValidation {
  required?: boolean
  min?: number
  max?: number
  pattern?: string
}

export interface FormChoice {
  id: string
  label: string
  other?: boolean
}

export interface FormSection {
  id: string
  name?: string
  questions?: string[]
}

export interface FormCondition {
  id: string
  questionId: string
  action: 'show' | 'hide'
  targetQuestions?: string[]
}

export interface IssueForm {
  id: string
  name?: string
  status: 'OPEN' | 'SUBMITTED' | 'LOCKED'
  visibility: 'INTERNAL' | 'EXTERNAL'
  design?: FormDesign
  answers?: FormAnswers
}

export interface FormAnswers {
  [questionId: string]: FormAnswer
}

export interface FormAnswer {
  text?: string
  choices?: string[]
  date?: string
  users?: string[]
}

export interface CreateITSMRequestInput {
  serviceDeskId: string
  requestTypeId: string
  requestFieldValues: Record<string, unknown>
  raiseOnBehalfOf?: string
  requestParticipants?: string[]
}

export interface ITSMRequestResponse {
  issueId: string
  issueKey: string
  requestTypeId: string
  serviceDeskId: string
  createdDate: {
    iso8601: string
    epochMillis: number
  }
  reporter: {
    accountId: string
    displayName: string
  }
  currentStatus: {
    status: string
    statusCategory: string
  }
}

export interface ITSMConversationState {
  awaitingITSMDetails: boolean
  step: ITSMFlowStep
  serviceDesks?: ServiceDesk[]
  selectedServiceDesk?: ServiceDesk
  portalGroups?: PortalGroup[]
  selectedPortalGroup?: PortalGroup
  requestTypes?: RequestType[]
  filteredRequestTypes?: RequestType[]
  selectedRequestType?: RequestType
  formTemplate?: FormTemplate
  fieldCollection?: FieldCollection
  requestTypeFieldsCache?: Record<string, RequestTypeField[]>
  requestTypeFormsCache?: Record<string, FormTemplate | null>
}

export type ITSMFlowStep =
  | 'select_service_desk'
  | 'select_portal_group'
  | 'select_request_type'
  | 'collect_field'
  | 'confirm'

export interface FieldCollection {
  currentFieldIndex: number
  fields: RequestTypeField[]
  collectedValues: Record<string, unknown>
  formAnswers: FormAnswers
  awaitingCustomValue?: boolean
}
