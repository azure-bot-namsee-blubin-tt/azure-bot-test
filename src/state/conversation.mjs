/**
 * Conversation State Management
 * Handles storing and retrieving conversation state for multi-turn dialogs
 */

// In-memory state storage (use Redis/DB in production)
const conversationStates = new Map()

/**
 * Get conversation state
 * @param {string} conversationId
 * @returns {object} State object or empty object
 */
export function getState(conversationId) {
  return conversationStates.get(conversationId) || {}
}

/**
 * Set conversation state
 * @param {string} conversationId
 * @param {object} state
 */
export function setState(conversationId, state) {
  conversationStates.set(conversationId, state)
}

/**
 * Update conversation state (merge with existing)
 * @param {string} conversationId
 * @param {object} updates
 */
export function updateState(conversationId, updates) {
  const current = getState(conversationId)
  conversationStates.set(conversationId, { ...current, ...updates })
}

/**
 * Delete conversation state
 * @param {string} conversationId
 */
export function deleteState(conversationId) {
  conversationStates.delete(conversationId)
}

/**
 * Check if conversation has active state
 * @param {string} conversationId
 * @returns {boolean}
 */
export function hasState(conversationId) {
  return conversationStates.has(conversationId)
}

/**
 * Clear all states (for testing)
 */
export function clearAllStates() {
  conversationStates.clear()
}
