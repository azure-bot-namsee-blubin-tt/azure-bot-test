/**
 * ITSM Service - Handles all Jira Service Management API interactions
 * Uses common ApiClient for HTTP requests
 */
import { createBasicAuthClient, ApiClient } from '../common/services/index.mjs'
import { withSpan, itsmMetrics, apiMetrics, log } from '../telemetry/index.mjs'

/**
 * ITSMService class for Jira Service Management operations
 * Provides methods for service desks, request types, forms, and request creation
 */
export class ITSMService {
  /**
   * Create a new ITSMService instance
   * @param {object} config - Configuration object
   * @param {string} config.baseUrl - Jira base URL
   * @param {string} config.email - Jira account email
   * @param {string} config.apiToken - Jira API token
   */
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

  /**
   * Get or create the forms API client (lazy initialization)
   * @private
   * @returns {Promise<ApiClient>} Forms API client
   */
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

  /**
   * Get all service desks
   * @returns {Promise<object[]>} Array of service desk objects
   */
  async getServiceDesks() {
    return withSpan('itsm.getServiceDesks', async (span) => {
      const startTime = Date.now()
      try {
        apiMetrics.requests.add(1, { service: 'itsm', operation: 'getServiceDesks' })
        const result = await this.serviceDeskClient.get('/servicedesk')
        apiMetrics.requestDuration.record(Date.now() - startTime, { service: 'itsm', operation: 'getServiceDesks' })
        span.setAttribute('itsm.service_desk_count', result.values?.length || 0)
        return result.values || []
      } catch (error) {
        apiMetrics.errors.add(1, { service: 'itsm', operation: 'getServiceDesks', error_type: error.name })
        throw error
      }
    })
  }

  /**
   * Get issue types (work types) for a project
   * @param {string} projectKey - Jira project key
   * @returns {Promise<object[]>} Array of issue type objects
   */
  async getWorkTypes(projectKey) {
    const result = await this.apiClient.get(`/project/${projectKey}`)
    return result.issueTypes || []
  }

  /**
   * Get unique work types from request types in a service desk
   * @param {string} serviceDeskId - Service desk ID
   * @returns {Promise<object[]>} Array of work type objects
   */
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

  /**
   * Get portal groups for a service desk
   * @param {string} serviceDeskId - Service desk ID
   * @returns {Promise<object[]>} Array of portal group objects
   */
  async getPortalGroups(serviceDeskId) {
    const result = await this.serviceDeskClient.get(`/servicedesk/${serviceDeskId}/requesttypegroup`)
    return result.values || []
  }

  /**
   * Get request types filtered by portal group
   * @param {string} serviceDeskId - Service desk ID
   * @param {string} groupId - Portal group ID
   * @returns {Promise<object[]>} Array of request type objects
   */
  async getRequestTypesByGroup(serviceDeskId, groupId) {
    const allRequestTypes = await this.getRequestTypes(serviceDeskId)
    return allRequestTypes.filter(rt => rt.groupIds?.includes(groupId.toString()))
  }

  /**
   * Get all request types for a service desk
   * @param {string} serviceDeskId - Service desk ID
   * @returns {Promise<object[]>} Array of request type objects
   */
  async getRequestTypes(serviceDeskId) {
    return withSpan('itsm.getRequestTypes', async (span) => {
      const startTime = Date.now()
      span.setAttribute('itsm.service_desk_id', serviceDeskId)
      try {
        apiMetrics.requests.add(1, { service: 'itsm', operation: 'getRequestTypes' })
        const result = await this.serviceDeskClient.get(`/servicedesk/${serviceDeskId}/requesttype`)
        apiMetrics.requestDuration.record(Date.now() - startTime, { service: 'itsm', operation: 'getRequestTypes' })
        span.setAttribute('itsm.request_type_count', result.values?.length || 0)
        return result.values || []
      } catch (error) {
        apiMetrics.errors.add(1, { service: 'itsm', operation: 'getRequestTypes', error_type: error.name })
        throw error
      }
    })
  }

  /**
   * Get request types filtered by work type (issue type)
   * @param {string} serviceDeskId - Service desk ID
   * @param {string} issueTypeId - Issue type ID
   * @returns {Promise<object[]>} Array of request type objects
   */
  async getRequestTypesByWorkType(serviceDeskId, issueTypeId) {
    const allRequestTypes = await this.getRequestTypes(serviceDeskId)
    return allRequestTypes.filter(rt => rt.issueTypeId === issueTypeId)
  }

  /**
   * Get request types grouped by their work type
   * @param {string} serviceDeskId - Service desk ID
   * @returns {Promise<object[]>} Array of {workType, requestTypes} objects
   */
  async getRequestTypesGroupedByWorkType(serviceDeskId) {
    const requestTypes = await this.getRequestTypes(serviceDeskId)
    const workTypes = await this.getWorkTypesFromRequestTypes(serviceDeskId)

    return workTypes.map(workType => ({
      workType,
      requestTypes: requestTypes.filter(rt => rt.issueTypeId === workType.id),
    })).filter(group => group.requestTypes.length > 0)
  }
  /**
   * Get all fields for a request type
   * @param {string} serviceDeskId - Service desk ID
   * @param {string} requestTypeId - Request type ID
   * @returns {Promise<object[]>} Array of field objects
   */  async getRequestTypeFields(serviceDeskId, requestTypeId) {
    const result = await this.serviceDeskClient.get(
      `/servicedesk/${serviceDeskId}/requesttype/${requestTypeId}/field`
    )
    return result.requestTypeFields || []
  }

  /**
   * Get required and visible fields for a request type
   * @param {string} serviceDeskId - Service desk ID
   * @param {string} requestTypeId - Request type ID
   * @returns {Promise<object[]>} Array of required field objects
   */
  async getRequiredFields(serviceDeskId, requestTypeId) {
    const fields = await this.getRequestTypeFields(serviceDeskId, requestTypeId)
    return fields.filter(field => field.required && field.visible)
  }

  /**
   * Get all visible fields for a request type
   * @param {string} serviceDeskId - Service desk ID
   * @param {string} requestTypeId - Request type ID
   * @returns {Promise<object[]>} Array of visible field objects
   */
  async getVisibleFields(serviceDeskId, requestTypeId) {
    const fields = await this.getRequestTypeFields(serviceDeskId, requestTypeId)
    return fields.filter(field => field.visible)
  }

  /**
   * Get all fields for a request type (including hidden)
   * @param {string} serviceDeskId - Service desk ID
   * @param {string} requestTypeId - Request type ID
   * @returns {Promise<object[]>} Array of all field objects
   */
  async getAllFields(serviceDeskId, requestTypeId) {
    const result = await this.serviceDeskClient.get(
      `/servicedesk/${serviceDeskId}/requesttype/${requestTypeId}/field`
    )
    console.log('All fields from API:', JSON.stringify(result, null, 2))
    return result.requestTypeFields || []
  }

  /**
   * Get visible portal fields for a request type
   * @param {string} serviceDeskId - Service desk ID
   * @param {string} requestTypeId - Request type ID
   * @returns {Promise<object[]>} Array of visible field objects
   */
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

  /**
   * Get ProForma forms for a request type (legacy API)
   * @param {string} requestTypeId - Request type ID
   * @returns {Promise<object[]>} Array of form objects
   */
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

  /**
   * Get ProForma form fields by form ID (legacy API)
   * @param {string} formId - Form ID
   * @returns {Promise<object|null>} Form details or null if not found
   */
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

  /**
   * Get comprehensive fields including portal and form fields
   * @param {string} serviceDeskId - Service desk ID
   * @param {string} requestTypeId - Request type ID
   * @param {string} projectKey - Project key (unused, kept for compatibility)
   * @param {string} issueTypeId - Issue type ID (unused, kept for compatibility)
   * @returns {Promise<object[]>} Array of portal field objects
   */
  async getComprehensiveFields(serviceDeskId, requestTypeId, projectKey, issueTypeId) {
    const portalFields = await this.getPortalFields(serviceDeskId, requestTypeId)

    console.log(`\nPortal fields returned: ${portalFields.length}`)
    portalFields.forEach(f => {
      console.log(`   → ${f.fieldId}: "${f.name}" (required: ${f.required})`)
    })

    return portalFields
  }

  /**
   * Create a new ITSM request
   * @param {object} input - Request input data
   * @param {string} input.serviceDeskId - Service desk ID
   * @param {string} input.requestTypeId - Request type ID
   * @param {object} input.requestFieldValues - Field values for the request
   * @param {string} [input.raiseOnBehalfOf] - Account ID to raise request on behalf of
   * @param {string[]} [input.requestParticipants] - Array of participant account IDs
   * @returns {Promise<object>} Created request object with issueId and issueKey
   */
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

  /**
   * Determine the field type from field schema
   * @param {object} field - Field object with jiraSchema and validValues
   * @returns {string} Field type: 'text', 'textarea', 'select', 'multiselect', 'date', 'datetime', 'user', 'number', 'attachment', or 'array'
   */
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

  /**
   * Format user input value based on field type for API submission
   * @param {object} field - Field definition object
   * @param {string} userInput - Raw user input string
   * @returns {*} Formatted value for Jira API
   */
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

  /**
   * Format select field value from user input
   * @private
   * @param {object} field - Field definition with validValues
   * @param {string} userInput - User input (index or name)
   * @returns {object|string} Formatted value with id or raw input
   */
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

  /**
   * Format multi-select field value from user input
   * @private
   * @param {object} field - Field definition with validValues
   * @param {string} userInput - Comma-separated indices or names
   * @returns {object[]} Array of formatted values with ids
   */
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

  /**
   * Format date value to ISO format
   * @private
   * @param {string} userInput - User input date string
   * @returns {string} ISO date string (YYYY-MM-DD) or original input
   */
  _formatDateValue(userInput) {
    const date = new Date(userInput)
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0]
    }
    return userInput
  }

  /**
   * Get display-friendly value for a field
   * @param {object} field - Field definition object
   * @param {*} value - Stored field value
   * @returns {string} Human-readable display value
   */
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

  /**
   * Get browse URL for an issue
   * @param {string} issueKey - Issue key (e.g., 'PROJ-123')
   * @returns {string} Full URL to browse the issue
   */
  getPortalUrl(issueKey) {
    return `${this.baseUrl}/browse/${issueKey}`
  }

  /**
   * Get service desk portal URL
   * @param {string} serviceDeskId - Service desk ID
   * @returns {string} Full URL to the service desk portal
   */
  getServiceDeskPortalUrl(serviceDeskId) {
    return `${this.baseUrl}/servicedesk/customer/portal/${serviceDeskId}`
  }

  /**
   * Get Atlassian Cloud ID for the instance
   * @returns {Promise<string>} Cloud ID for the Jira instance
   * @throws {Error} If cloud ID cannot be retrieved
   */
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

  /**
   * Debug helper to test Forms API connectivity
   * @param {string} projectKey - Project key to test
   * @param {string} [issueIdOrKey] - Optional issue to test forms on
   * @returns {Promise<object>} Debug results with cloudId, templates, issueForms, errors
   */
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
    return withSpan('itsm.createRequestWithForm', async (span) => {
      const startTime = Date.now()
      span.setAttributes({
        'itsm.service_desk_id': input.serviceDeskId,
        'itsm.request_type_id': input.requestTypeId,
        'itsm.has_form_answers': !!formAnswers,
      })

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

      try {
        apiMetrics.requests.add(1, { service: 'itsm', operation: 'createRequest' })
        const result = await this.serviceDeskClient.post('/request', requestData)

        itsmMetrics.requestsCreated.add(1, {
          service_desk_id: input.serviceDeskId,
          request_type_id: input.requestTypeId,
        })
        apiMetrics.requestDuration.record(Date.now() - startTime, { service: 'itsm', operation: 'createRequest' })

        span.setAttribute('itsm.issue_key', result.issueKey || result.key)
        log(`ITSM request created: ${result.issueKey || result.key}`, 'INFO', {
          issueKey: result.issueKey || result.key,
          serviceDeskId: input.serviceDeskId,
        })

        return result
      } catch (error) {
        apiMetrics.errors.add(1, { service: 'itsm', operation: 'createRequest', error_type: error.name })
        log(`Failed to create ITSM request: ${error.message}`, 'ERROR', { error: error.stack })
        throw error
      }
    })
  }
}

/**
 * Create ITSMService instance from environment variables
 * @returns {ITSMService} Configured ITSMService instance
 * @throws {Error} If required environment variables are missing
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
