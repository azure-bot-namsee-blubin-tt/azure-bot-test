/**
 * ITSM Service - Handles all Jira Service Management API interactions
 * Uses common ApiClient for HTTP requests
 */
import { createBasicAuthClient, ApiClient } from '../common/services/index.mjs'

export class ITSMService {
  constructor(config) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this._cloudId = null

    const commonHeaders = {
      'X-ExperimentalApi': 'opt-in',
    }

    const clientOptions = {
      timeout: 60000,
      retries: 2,
      headers: commonHeaders,
    }

    this.serviceDeskClient = createBasicAuthClient(
      `${this.baseUrl}/rest/servicedeskapi`,
      config.email,
      config.apiToken,
      clientOptions
    )

    this.apiClient = createBasicAuthClient(
      `${this.baseUrl}/rest/api/3`,
      config.email,
      config.apiToken,
      clientOptions
    )

    this.proformaClient = createBasicAuthClient(
      `${this.baseUrl}/rest/proforma/1`,
      config.email,
      config.apiToken,
      clientOptions
    )

    this._credentials = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64')
  }

  async _getFormsClient() {
    if (this._formsClient) return this._formsClient

    const cloudId = await this.getCloudId()
    this._formsClient = new ApiClient({
      baseUrl: `https://api.atlassian.com/jira/forms/cloud/${cloudId}`,
      defaultHeaders: {
        'Authorization': `Basic ${this._credentials}`,
        'X-ExperimentalApi': 'opt-in',
      },
      timeout: 30000,
      retries: 1,
    })

    return this._formsClient
  }

  async getServiceDesks() {
    const result = await this.serviceDeskClient.get('/servicedesk')
    return result.values || []
  }

  async getWorkTypes(projectKey) {
    const result = await this.apiClient.get(`/project/${projectKey}`)
    return result.issueTypes || []
  }

  async getWorkTypesFromRequestTypes(serviceDeskId) {
    const requestTypes = await this.getRequestTypes(serviceDeskId)
    const workTypeMap = new Map()

    const issueTypeIds = [...new Set(requestTypes.map(rt => rt.issueTypeId))]

    for (const issueTypeId of issueTypeIds) {
      try {
        const issueType = await this.apiClient.get(`/issuetype/${issueTypeId}`)
        workTypeMap.set(issueTypeId, {
          id: issueType.id,
          name: issueType.name,
          description: issueType.description,
          subtask: issueType.subtask || false,
          iconUrl: issueType.iconUrl,
        })
      } catch (error) {
        workTypeMap.set(issueTypeId, {
          id: issueTypeId,
          name: `Work Type ${issueTypeId}`,
          subtask: false,
        })
      }
    }

    return Array.from(workTypeMap.values())
  }

  async getPortalGroups(serviceDeskId) {
    const result = await this.serviceDeskClient.get(`/servicedesk/${serviceDeskId}/requesttypegroup`)
    return result.values || []
  }

  async getRequestTypesByGroup(serviceDeskId, groupId) {
    const allRequestTypes = await this.getRequestTypes(serviceDeskId)
    return allRequestTypes.filter(rt => rt.groupIds?.includes(groupId.toString()))
  }

  async getRequestTypes(serviceDeskId) {
    const result = await this.serviceDeskClient.get(`/servicedesk/${serviceDeskId}/requesttype`)
    return result.values || []
  }

  async getRequestTypesByWorkType(serviceDeskId, issueTypeId) {
    const allRequestTypes = await this.getRequestTypes(serviceDeskId)
    return allRequestTypes.filter(rt => rt.issueTypeId === issueTypeId)
  }

  async getRequestTypesGroupedByWorkType(serviceDeskId) {
    const requestTypes = await this.getRequestTypes(serviceDeskId)
    const workTypes = await this.getWorkTypesFromRequestTypes(serviceDeskId)

    return workTypes.map(workType => ({
      workType,
      requestTypes: requestTypes.filter(rt => rt.issueTypeId === workType.id),
    })).filter(group => group.requestTypes.length > 0)
  }

  async getRequestTypeFields(serviceDeskId, requestTypeId) {
    const result = await this.serviceDeskClient.get(
      `/servicedesk/${serviceDeskId}/requesttype/${requestTypeId}/field`
    )
    return result.requestTypeFields || []
  }

  async getRequiredFields(serviceDeskId, requestTypeId) {
    const fields = await this.getRequestTypeFields(serviceDeskId, requestTypeId)
    return fields.filter(field => field.required && field.visible)
  }

  async getVisibleFields(serviceDeskId, requestTypeId) {
    const fields = await this.getRequestTypeFields(serviceDeskId, requestTypeId)
    return fields.filter(field => field.visible)
  }

  async getAllFields(serviceDeskId, requestTypeId) {
    const result = await this.serviceDeskClient.get(
      `/servicedesk/${serviceDeskId}/requesttype/${requestTypeId}/field`
    )
    console.log('All fields from API:', JSON.stringify(result, null, 2))
    return result.requestTypeFields || []
  }

  async getPortalFields(serviceDeskId, requestTypeId) {
    const result = await this.serviceDeskClient.get(
      `/servicedesk/${serviceDeskId}/requesttype/${requestTypeId}/field`
    )

    const fields = result.requestTypeFields || []

    console.log(`\nPortal Fields for Request Type ${requestTypeId}:`)
    fields.forEach(f => {
      const req = f.required ? '*' : ''
      console.log(`   - ${f.fieldId}: ${f.name}${req} (visible: ${f.visible})`)
    })

    return fields.filter(f => f.visible)
  }

  async getProFormaForms(requestTypeId) {
    try {
      const result = await this.proformaClient.get(`/proforma/1/requesttype/${requestTypeId}/forms`)
      console.log('ProForma forms:', JSON.stringify(result, null, 2))
      return result.forms || result || []
    } catch (error) {
      console.log('ProForma forms not available:', error.message)
      return []
    }
  }

  async getProFormaFormFields(formId) {
    try {
      const result = await this.proformaClient.get(`/proforma/1/form/${formId}`)
      console.log('ProForma form details:', JSON.stringify(result, null, 2))
      return result
    } catch (error) {
      console.log('ProForma form fields not available:', error.message)
      return null
    }
  }

  async getComprehensiveFields(serviceDeskId, requestTypeId, projectKey, issueTypeId) {
    const portalFields = await this.getPortalFields(serviceDeskId, requestTypeId)

    console.log(`\nPortal fields returned: ${portalFields.length}`)
    portalFields.forEach(f => {
      console.log(`   → ${f.fieldId}: "${f.name}" (required: ${f.required})`)
    })

    return portalFields
  }

  async createRequest(input) {
    const requestData = {
      serviceDeskId: input.serviceDeskId,
      requestTypeId: input.requestTypeId,
      requestFieldValues: input.requestFieldValues,
      ...(input.raiseOnBehalfOf && { raiseOnBehalfOf: input.raiseOnBehalfOf }),
      ...(input.requestParticipants && { requestParticipants: input.requestParticipants }),
    }

    return this.serviceDeskClient.post('/request', requestData)
  }

  getFieldType(field) {
    const schemaType = field.jiraSchema?.type
    const fieldId = field.fieldId?.toLowerCase()

    if (fieldId === 'summary') return 'text'
    if (fieldId === 'description') return 'textarea'
    if (fieldId === 'attachment') return 'attachment'
    if (fieldId === 'priority') return 'select'

    if (schemaType === 'array') {
      if (field.jiraSchema?.items === 'attachment') return 'attachment'
      if (field.validValues?.length > 0) return 'multiselect'
      return 'array'
    }

    if (schemaType === 'option' || (field.validValues?.length > 0)) return 'select'
    if (schemaType === 'user') return 'user'
    if (schemaType === 'date') return 'date'
    if (schemaType === 'datetime') return 'datetime'
    if (schemaType === 'number') return 'number'

    return 'text'
  }

  formatFieldValue(field, userInput) {
    const fieldType = this.getFieldType(field)

    switch (fieldType) {
      case 'select':
        return this._formatSelectValue(field, userInput)

      case 'multiselect':
        return this._formatMultiSelectValue(field, userInput)

      case 'user':
        return { accountId: userInput }

      case 'number':
        return parseFloat(userInput) || 0

      case 'date':
        return this._formatDateValue(userInput)

      case 'array':
        return userInput.split(',').map(v => v.trim())

      case 'attachment':
        return null

      default:
        return userInput
    }
  }

  _formatSelectValue(field, userInput) {
    if (!field.validValues?.length) return userInput

    const index = parseInt(userInput, 10) - 1
    if (index >= 0 && index < field.validValues.length) {
      const value = field.validValues[index]
      return { id: value.id || value.value }
    }

    const match = field.validValues.find(
      v => v.name?.toLowerCase() === userInput.toLowerCase() ||
           v.value?.toLowerCase() === userInput.toLowerCase()
    )
    if (match) {
      return { id: match.id || match.value }
    }

    return userInput
  }

  _formatMultiSelectValue(field, userInput) {
    if (!field.validValues?.length) {
      return userInput.split(',').map(v => v.trim())
    }

    const inputs = userInput.split(',').map(v => v.trim())
    const results = []

    for (const input of inputs) {
      const index = parseInt(input, 10) - 1
      if (index >= 0 && index < field.validValues.length) {
        results.push({ id: field.validValues[index].id || field.validValues[index].value })
      } else {
        const match = field.validValues.find(
          v => v.name?.toLowerCase() === input.toLowerCase() ||
               v.value?.toLowerCase() === input.toLowerCase()
        )
        if (match) {
          results.push({ id: match.id || match.value })
        }
      }
    }

    return results
  }

  _formatDateValue(userInput) {
    const date = new Date(userInput)
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0]
    }
    return userInput
  }

  getDisplayValue(field, value) {
    if (value === null || value === undefined) return '(empty)'

    const fieldType = this.getFieldType(field)

    if (fieldType === 'select' && typeof value === 'object' && value.id) {
      const match = field.validValues?.find(v => v.id === value.id)
      return match?.name || match?.value || value.id
    }

    if (fieldType === 'multiselect' && Array.isArray(value)) {
      return value.map(v => {
        if (typeof v === 'object' && v.id) {
          const match = field.validValues?.find(fv => fv.id === v.id)
          return match?.name || match?.value || v.id
        }
        return v
      }).join(', ')
    }

    if (typeof value === 'object') {
      return JSON.stringify(value)
    }

    return String(value)
  }

  getPortalUrl(issueKey) {
    return `${this.baseUrl}/browse/${issueKey}`
  }

  getServiceDeskPortalUrl(serviceDeskId) {
    return `${this.baseUrl}/servicedesk/customer/portal/${serviceDeskId}`
  }

  async getCloudId() {
    if (this._cloudId) return this._cloudId

    const url = `${this.baseUrl}/_edge/tenant_info`
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Failed to get cloud ID: ${response.status}`)
    }

    const data = await response.json()
    this._cloudId = data.cloudId
    return this._cloudId
  }

  /**
   * Get available form templates for a project
   * @param {string} projectKey - The project key (e.g., "I0")
   * @returns {Promise<Array>} - List of form templates
   */
  async getFormTemplates(projectKey) {
    try {
      const client = await this._getFormsClient()
      const result = await client.get(`/project/${projectKey}/form`)
      console.log('Available form templates:', JSON.stringify(result, null, 2))
      return result || []
    } catch (error) {
      console.log('Failed to get form templates:', error.message)
      return []
    }
  }

  /**
   * Get form template for a specific request type (portal form)
   * This returns the ProForma form linked to a request type
   * @param {string} serviceDeskId - Service desk ID
   * @param {string} requestTypeId - Request type ID
   */
  async getRequestTypeForm(serviceDeskId, requestTypeId) {
    try {
      const client = await this._getFormsClient()
      const result = await client.get(
        `/servicedesk/${serviceDeskId}/requesttype/${requestTypeId}/form`
      )
      console.log(`Request Type ${requestTypeId} Form:`, JSON.stringify(result, null, 2))
      return result
    } catch (error) {
      console.log(`No form for request type ${requestTypeId}:`, error.message)
      return null
    }
  }

  extractFormQuestions(formTemplate) {
    if (!formTemplate) return []

    const design = formTemplate.design || formTemplate
    const questions = design.questions || {}

    if (Object.keys(questions).length === 0) return []

    let sections = design.sections
    if (!Array.isArray(sections)) {
      sections = []
    }

    const orderedIds = []
    for (const section of sections) {
      if (section?.questionIds && Array.isArray(section.questionIds)) {
        orderedIds.push(...section.questionIds)
      }
    }

    const questionIds = orderedIds.length > 0 ? orderedIds : Object.keys(questions)

    return questionIds.map(id => {
      const q = questions[id]
      if (!q) return null
      return {
        id,
        label: q.label || q.name || id,
        type: q.type || 'text',
        required: q.validation?.rpiRequired || false,
        description: q.description,
        choices: q.choices || [],
        jiraField: q.jpiMappedJiraField,
      }
    }).filter(Boolean)
  }

  /**
   * Get form template details including fields
   * @param {string} projectKey - The project key
   * @param {string} formId - The form template ID
   */
  async getFormTemplateDetails(projectKey, formId) {
    try {
      const client = await this._getFormsClient()
      const result = await client.get(`/project/${projectKey}/form/${formId}`)
      console.log('Form template details:', JSON.stringify(result, null, 2))
      return result
    } catch (error) {
      console.log('Failed to get form template details:', error.message)
      return null
    }
  }

  /**
   * Attach a form template to an issue
   * @param {string} issueIdOrKey - The issue ID or key (e.g., "10001" or "I0-123")
   * @param {string} formTemplateId - The form template ID/UUID
   * @returns {Promise<object>} - The attached form with its new formId
   */
  async attachFormToIssue(issueIdOrKey, formTemplateId) {
    console.log(`Attaching form ${formTemplateId} to issue ${issueIdOrKey}`)

    // Correct request body format per Atlassian API docs
    const requestBody = {
      formTemplate: {
        id: formTemplateId
      }
    }

    console.log('Request body:', JSON.stringify(requestBody, null, 2))

    const client = await this._getFormsClient()
    const result = await client.post(`/issue/${issueIdOrKey}/form`, requestBody)

    console.log('Form attached successfully:', JSON.stringify(result, null, 2))
    return result
  }

  /**
   * Get forms attached to an issue
   * @param {string} issueKey - The issue key
   */
  async getIssueForms(issueKey) {
    try {
      const client = await this._getFormsClient()
      const result = await client.get(`/issue/${issueKey}/form`)
      console.log('Issue forms:', JSON.stringify(result, null, 2))
      return result || []
    } catch (error) {
      console.log('Failed to get issue forms:', error.message)
      return []
    }
  }

  /**
   * Save form answers on an issue
   * @param {string} issueIdOrKey - The issue ID or key
   * @param {string} formId - The form ID (UUID of attached form, NOT the template ID)
   * @param {object} answers - Form field answers { questionId: { text: "value" } }
   */
  async saveFormAnswers(issueIdOrKey, formId, answers) {
    console.log(`Saving form answers to issue ${issueIdOrKey}, form ${formId}`)
    console.log('Answers:', JSON.stringify(answers, null, 2))

    const client = await this._getFormsClient()
    const result = await client.put(`/issue/${issueIdOrKey}/form/${formId}`, { answers })

    console.log('Form answers saved:', JSON.stringify(result, null, 2))
    return result
  }

  async debugFormsAPI(projectKey, issueIdOrKey = null) {
    const results = {
      cloudId: null,
      templates: [],
      issueForms: [],
      errors: [],
    }

    try {
      results.cloudId = await this.getCloudId()
      console.log('Cloud ID:', results.cloudId)
    } catch (error) {
      results.errors.push(`Cloud ID: ${error.message}`)
    }

    try {
      results.templates = await this.getFormTemplates(projectKey)
      console.log('Templates:', results.templates.length)
    } catch (error) {
      results.errors.push(`Templates: ${error.message}`)
    }

    if (issueIdOrKey) {
      try {
        results.issueForms = await this.getIssueForms(issueIdOrKey)
        console.log('Issue forms:', results.issueForms.length)
      } catch (error) {
        results.errors.push(`Issue forms: ${error.message}`)
      }
    }

    return results
  }

  /**
   * Change form visibility to external (visible to customers in portal)
   * @param {string} issueIdOrKey - The issue ID or key
   * @param {string} formId - The form ID (UUID of attached form)
   */
  async setFormExternal(issueIdOrKey, formId) {
    console.log(`Setting form ${formId} to EXTERNAL on issue ${issueIdOrKey}`)

    const client = await this._getFormsClient()
    const result = await client.put(`/issue/${issueIdOrKey}/form/${formId}/action/external`, {})

    console.log('Form set to external:', JSON.stringify(result, null, 2))
    return result
  }

  /**
   * Change form visibility to internal (not visible to customers)
   * @param {string} issueIdOrKey - The issue ID or key
   * @param {string} formId - The form ID (UUID of attached form)
   */
  async setFormInternal(issueIdOrKey, formId) {
    console.log(`Setting form ${formId} to INTERNAL on issue ${issueIdOrKey}`)

    const client = await this._getFormsClient()
    const result = await client.put(`/issue/${issueIdOrKey}/form/${formId}/action/internal`, {})

    console.log('Form set to internal:', JSON.stringify(result, null, 2))
    return result
  }

  /**
   * Submit a form on an issue
   * @param {string} issueKey - The issue key
   * @param {string} formId - The form ID (UUID of attached form)
   */
  async submitForm(issueKey, formId) {
    try {
      const client = await this._getFormsClient()
      const result = await client.post(`/issue/${issueKey}/form/${formId}/submit`, {})
      console.log('Form submitted:', JSON.stringify(result, null, 2))
      return result
    } catch (error) {
      console.log('Failed to submit form:', error.message)
      throw error
    }
  }

  /**
   * Submit a form on an issue
   * @param {input} input - The input object
   * @param {formAnswers} input.formAnswers - The form answers object
   */
  async createRequestWithForm(input, formAnswers = null) {
    const requestData = {
      serviceDeskId: input.serviceDeskId,
      requestTypeId: input.requestTypeId,
      requestFieldValues: input.requestFieldValues,
      ...(input.raiseOnBehalfOf && { raiseOnBehalfOf: input.raiseOnBehalfOf }),
      ...(input.requestParticipants && { requestParticipants: input.requestParticipants }),
    }

    if (formAnswers) {
      requestData.form = {
        answers: formAnswers,
      }
    }

    return this.serviceDeskClient.post('/request', requestData)
  }
}

/**
 * Create ITSMService from environment variables
 */
export function createITSMServiceFromEnv() {
  const baseUrl = process.env.JIRA_BASE_URL
  const email = process.env.JIRA_EMAIL
  const apiToken = process.env.JIRA_API_TOKEN

  if (!baseUrl || !email || !apiToken) {
    throw new Error(
      'Missing ITSM configuration. Please set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN environment variables.'
    )
  }

  return new ITSMService({ baseUrl, email, apiToken })
}
