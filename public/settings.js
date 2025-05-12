/**
 * Secure Settings Management System
 * Handles user preferences with validation and sanitization
 */

// Strict setting definitions with validation rules
const SETTINGS_SCHEMA = {
  theme: {
    type: 'string',
    allowed: ['dark', 'light', 'material', 'mint', 'blackred', 'matrix'],
    default: 'dark',
    validate: value => SETTINGS_SCHEMA.theme.allowed.includes(value)
  },
  accentColor: {
    type: 'string',
    allowed: ['purple', 'blue', 'red', 'green', 'pink', 'black'],
    default: 'purple',
    validate: value => SETTINGS_SCHEMA.accentColor.allowed.includes(value)
  },
  notifications: {
    type: 'boolean',
    default: false,
    validate: value => typeof value === 'boolean'
  },
  toastDuration: {
    type: 'number',
    allowed: [2000, 3000, 5000, 8000],
    default: 3000,
    validate: value => SETTINGS_SCHEMA.toastDuration.allowed.includes(Number(value))
  },
  showTimestamps: {
    type: 'boolean',
    default: true,
    validate: value => typeof value === 'boolean'
  },
  fontSize: {
    type: 'string',
    allowed: ['small', 'medium', 'large'],
    default: 'medium',
    validate: value => SETTINGS_SCHEMA.fontSize.allowed.includes(value)
  }
};

// Settings Manager Class
class SettingsManager {
  constructor() {
    this._settings = this._getDefaultSettings();
    this._observers = [];
    this._initialized = false;
    this._previewOriginalTheme = null;
    this._previewOriginalColor = null;
  }

  /**
   * Get default settings values
   * @private
   * @returns {Object} Default settings
   */
  _getDefaultSettings() {
    const defaults = {};
    Object.entries(SETTINGS_SCHEMA).forEach(([key, schema]) => {
      defaults[key] = schema.default;
    });
    return defaults;
  }

  /**
   * Validates a setting against its schema
   * @private
   * @param {string} key - Setting key
   * @param {any} value - Value to validate
   * @returns {boolean} True if valid
   */
  _validateSetting(key, value) {
    const schema = SETTINGS_SCHEMA[key];
    if (!schema) return false;
    
    return schema.validate(value);
  }

  /**
   * Sanitizes all settings to ensure they match schema
   * @private
   * @param {Object} settings - Settings object to sanitize
   * @returns {Object} Sanitized settings
   */
  _sanitizeSettings(settings) {
    const sanitized = { ...this._getDefaultSettings() };
    
    Object.entries(settings).forEach(([key, value]) => {
      if (SETTINGS_SCHEMA[key] && this._validateSetting(key, value)) {
        sanitized[key] = value;
      }
    });
    
    return sanitized;
  }

  /**
   * Preview a theme without saving
   * @public
   * @param {string} theme - Theme to preview
   */
  previewTheme(theme) {
    // Validate theme
    if (!SETTINGS_SCHEMA.theme.allowed.includes(theme)) {
      console.error(`Invalid theme: ${theme}`);
      return;
    }
    
    // Store current theme for reverting
    this._previewOriginalTheme = this._settings.theme;
    
    // Apply the preview theme
    this._applyTheme(theme);
  }

  /**
   * Preview an accent color without saving
   * @public
   * @param {string} color - Accent color to preview
   */
  previewAccentColor(color) {
    // Validate color
    if (!SETTINGS_SCHEMA.accentColor.allowed.includes(color)) {
      console.error(`Invalid accent color: ${color}`);
      return;
    }
    
    // Store current color for reverting
    this._previewOriginalColor = this._settings.accentColor;
    
    // Apply the preview color
    this._applyAccentColor(color);
  }

  /**
   * Cancel any active previews
   * @public
   */
  cancelPreviews() {
    // Revert theme if previewing
    if (this._previewOriginalTheme) {
      this._applyTheme(this._previewOriginalTheme);
      this._previewOriginalTheme = null;
    }
    
    // Revert accent color if previewing
    if (this._previewOriginalColor) {
      this._applyAccentColor(this._previewOriginalColor);
      this._previewOriginalColor = null;
    }
  }

  /**
   * Initialize settings from localStorage with XSS protection
   * @public
   */
  initialize() {
    if (this._initialized) return;
    
    try {
      const storedSettings = localStorage.getItem('vincioChatSettings');
      
      if (storedSettings) {
        // Try-catch to handle invalid JSON
        try {
          const parsedSettings = JSON.parse(storedSettings);
          // Sanitize settings to prevent XSS or invalid values
          this._settings = this._sanitizeSettings(parsedSettings);
        } catch (error) {
          console.error('Failed to parse settings from localStorage:', error);
          // Reset to defaults on parse error
          this._settings = this._getDefaultSettings();
        }
      }
      
      // Apply settings immediately
      this.applySettings();
      this._initialized = true;
    } catch (error) {
      console.error('Error initializing settings:', error);
      // Fallback to defaults on any error
      this._settings = this._getDefaultSettings();
    }
  }

  /**
   * Validate CSS color to prevent CSS injection attacks
   * @private
   * @param {string} color - CSS color string to validate
   * @returns {boolean} True if valid
   */
  _isValidCSSColor(color) {
    // Only allow valid hex colors or specific named colors
    const hexPattern = /^#([0-9A-F]{3}){1,2}$/i;
    const allowedNamedColors = [
      'black', 'white', 'red', 'green', 'blue', 'yellow', 
      'purple', 'pink', 'orange', 'cyan', 'magenta', 'gray'
    ];
    
    return hexPattern.test(color) || allowedNamedColors.includes(color);
  }

/**
   * Validate CSS gradient to prevent CSS injection
   * @private
   * @param {string} gradient - CSS gradient string to validate
   * @returns {boolean} True if valid
   */
_isValidCSSGradient(gradient) {
  // Only allow linear-gradient with specific pattern
  const safePattern = /^linear-gradient\(135deg, #([0-9A-F]{3}){1,2}, #([0-9A-F]{3}){1,2}\)$/i;
  return safePattern.test(gradient);
}

/**
 * Safely set a CSS custom property
 * @private
 * @param {HTMLElement} element - Element to set property on
 * @param {string} property - CSS property name
 * @param {string} value - CSS property value
 */
_safelySetCSSProperty(element, property, value) {
  // Validate property name (only allow specific properties)
  const allowedProperties = [
    '--accent-primary', '--accent-secondary', '--accent-tertiary', '--accent-hover',
    '--gradient-accent', '--gradient-accent-hover', '--base-font-size'
  ];
  
  if (!allowedProperties.includes(property)) {
    console.error(`Attempted to set disallowed CSS property: ${property}`);
    return;
  }
  
  // Validate the value based on property type
  let isValid = false;
  
  if (property.startsWith('--accent')) {
    isValid = this._isValidCSSColor(value);
  } else if (property.startsWith('--gradient')) {
    isValid = this._isValidCSSGradient(value);
  } else if (property === '--base-font-size') {
    isValid = /^\d+(\.\d+)?rem$/.test(value);
  }
  
  if (!isValid) {
    console.error(`Invalid value for CSS property ${property}: ${value}`);
    return;
  }
  
  // Apply the validated property
  element.style.setProperty(property, value);
}

/**
 * Get current settings (read-only)
 * @public
 * @returns {Object} Current settings
 */
getSettings() {
  // Return a deep copy to prevent modification
  return JSON.parse(JSON.stringify(this._settings));
}

/**
 * Update specific settings with validation
 * @public
 * @param {Object} newSettings - New settings to apply
 * @returns {boolean} Success status
 */
updateSettings(newSettings) {
  if (!newSettings || typeof newSettings !== 'object') return false;
  
  let isValid = true;
  const updates = {};
  
  // Validate each setting before applying
  Object.entries(newSettings).forEach(([key, value]) => {
    if (SETTINGS_SCHEMA[key]) {
      if (this._validateSetting(key, value)) {
        updates[key] = value;
      } else {
        console.warn(`Invalid setting value: ${key}=${value}`);
        isValid = false;
      }
    }
  });
  
  if (!isValid) return false;
  
  // Apply valid updates
  this._settings = { ...this._settings, ...updates };
  
  // Save to localStorage
  try {
    localStorage.setItem('vincioChatSettings', JSON.stringify(this._settings));
  } catch (error) {
    console.error('Failed to save settings:', error);
    return false;
  }
  
  // Apply the settings to the UI
  this.applySettings();
  
  // Notify observers
  this._notifyObservers();
  
  return true;
}

/**
 * Reset settings to defaults
 * @public
 */
resetSettings() {
  this._settings = this._getDefaultSettings();
  
  try {
    localStorage.setItem('vincioChatSettings', JSON.stringify(this._settings));
  } catch (error) {
    console.error('Failed to save default settings:', error);
  }
  
  this.applySettings();
  this._notifyObservers();
}

/**
 * Register a settings change observer
 * @public
 * @param {Function} callback - Observer callback
 */
addObserver(callback) {
  if (typeof callback === 'function') {
    this._observers.push(callback);
  }
}

/**
 * Remove a settings observer
 * @public
 * @param {Function} callback - Observer to remove
 */
removeObserver(callback) {
  this._observers = this._observers.filter(obs => obs !== callback);
}

/**
 * Notify all observers of settings changes
 * @private
 */
_notifyObservers() {
  const settings = this.getSettings();
  this._observers.forEach(callback => {
    try {
      callback(settings);
    } catch (error) {
      console.error('Error in settings observer:', error);
    }
  });
}

/**
 * Apply current settings to the UI
 * @public
 */
applySettings() {
  // Apply theme
  this._applyTheme(this._settings.theme);
  
  // Apply accent color
  this._applyAccentColor(this._settings.accentColor);
  
  // Apply font size
  this._applyFontSize(this._settings.fontSize);
  
  // Apply timestamp visibility
  this._applyTimestampVisibility(this._settings.showTimestamps);
  
  // Apply toast duration to global variable for toast system
  window.toastDuration = this._settings.toastDuration;
}

/**
 * Apply the selected theme
 * @private
 * @param {string} theme - Theme name
 */
_applyTheme(theme) {
  // Safety check
  if (!SETTINGS_SCHEMA.theme.allowed.includes(theme)) {
    theme = SETTINGS_SCHEMA.theme.default;
  }
  
  // Remove all theme classes
  SETTINGS_SCHEMA.theme.allowed.forEach(themeName => {
    if (themeName === 'dark') {
      document.documentElement.classList.toggle('light-theme', false);
    } else {
      document.documentElement.classList.toggle(`${themeName}-theme`, false);
    }
  });
  
  // Add the selected theme class
  if (theme === 'light') {
    document.documentElement.classList.add('light-theme');
  } else if (theme !== 'dark') {
    document.documentElement.classList.add(`${theme}-theme`);
  }
}

/**
 * Apply the selected accent color
 * @private
 * @param {string} color - Accent color name
 */
_applyAccentColor(color) {
  // Safety check
  if (!SETTINGS_SCHEMA.accentColor.allowed.includes(color)) {
    color = SETTINGS_SCHEMA.accentColor.default;
  }
  
  // Remove any existing accent color classes
  SETTINGS_SCHEMA.accentColor.allowed.forEach(colorName => {
    document.documentElement.classList.remove(`accent-${colorName}`);
  });
  
  // Only add class if not default purple
  if (color !== 'purple') {
    document.documentElement.classList.add(`accent-${color}`);
  }
  
  // Apply CSS variables based on color
  const root = document.documentElement;
  
  switch (color) {
    case 'blue':
      this._setThemeVariables(root, '#4285f4', '#3367d6', '#2a56c6', '#5a95f5');
      break;
    case 'red':
      this._setThemeVariables(root, '#ff3333', '#e60000', '#cc0000', '#ff5c5c');
      break;
    case 'green':
      this._setThemeVariables(root, '#34a853', '#2e9549', '#1e8e3e', '#46bf65');
      break;
    case 'pink':
      this._setThemeVariables(root, '#e84e8a', '#d84177', '#c13b6b', '#ec699b');
      break;
    case 'black':
      this._setThemeVariables(root, '#4d4d4d', '#1a1a1a', '#262626', '#333333');
      break;
    default: // Purple (default)
      this._setThemeVariables(root, '#8a54fd', '#6a3dd8', '#4728a0', '#9d73ff');
      break;
  }
}

/**
 * Set theme variables safely
 * @private
 * @param {Element} root - Root element
 * @param {string} primary - Primary color
 * @param {string} secondary - Secondary color
 * @param {string} tertiary - Tertiary color
 * @param {string} hover - Hover color
 */
_setThemeVariables(root, primary, secondary, tertiary, hover) {
  // Validate hex colors to prevent CSS injection
  const hexColorPattern = /^#([0-9A-F]{3}){1,2}$/i;
  
  if (!hexColorPattern.test(primary) || 
      !hexColorPattern.test(secondary) || 
      !hexColorPattern.test(tertiary) || 
      !hexColorPattern.test(hover)) {
    console.error('Invalid color values detected');
    return;
  }
  
  root.style.setProperty('--accent-primary', primary);
  root.style.setProperty('--accent-secondary', secondary);
  root.style.setProperty('--accent-tertiary', tertiary);
  root.style.setProperty('--accent-hover', hover);
  
  // Update gradient variables
  root.style.setProperty(
    '--gradient-accent', 
    `linear-gradient(135deg, ${primary}, ${tertiary})`
  );
  root.style.setProperty(
    '--gradient-accent-hover', 
    `linear-gradient(135deg, ${hover}, ${secondary})`
  );
}

/**
 * Apply font size setting
 * @private
 * @param {string} size - Font size setting
 */
_applyFontSize(size) {
  // Safety check
  if (!SETTINGS_SCHEMA.fontSize.allowed.includes(size)) {
    size = SETTINGS_SCHEMA.fontSize.default;
  }
  
  // Remove existing font size classes
  document.documentElement.classList.remove('font-small', 'font-medium', 'font-large');
  
  // Add selected font size class if not default
  if (size !== 'medium') {
    document.documentElement.classList.add(`font-${size}`);
  }
  
  // Set CSS variable based on font size
  const root = document.documentElement;
  switch (size) {
    case 'small':
      root.style.setProperty('--base-font-size', '0.9rem');
      break;
    case 'large':
      root.style.setProperty('--base-font-size', '1.1rem');
      break;
    default: // medium
      root.style.setProperty('--base-font-size', '1rem');
      break;
  }
}

/**
 * Apply timestamp visibility setting
 * @private
 * @param {boolean} show - Whether to show timestamps
 */
_applyTimestampVisibility(show) {
  const timestamps = document.querySelectorAll('.timestamp');
  timestamps.forEach(timestamp => {
    timestamp.style.display = show ? 'block' : 'none';
  });
}
}

// Create singleton instance
const settingsManager = new SettingsManager();

// Initialize on document ready
document.addEventListener('DOMContentLoaded', () => {
settingsManager.initialize();

// Bind form elements to settings manager
bindSettingsFormControls();
});

/**
* Bind settings form controls to the settings manager
*/
function bindSettingsFormControls() {
const themeSelect = document.getElementById('theme-select');
const accentColorSelect = document.getElementById('accent-color-select');
const notificationToggle = document.getElementById('notification-toggle');
const toastDurationSelect = document.getElementById('toast-duration-select');
const timestampToggle = document.getElementById('message-timestamp-toggle');
const fontSizeSelect = document.getElementById('font-size-select');
const settingsModal = document.getElementById('settings-modal');

if (!settingsModal) {
  console.error('Settings modal not found in the DOM');
  return;
}

// Get current settings
const settings = settingsManager.getSettings();

// Update form to match current settings
if (themeSelect) themeSelect.value = settings.theme;
if (accentColorSelect) accentColorSelect.value = settings.accentColor;
if (notificationToggle) notificationToggle.checked = settings.notifications;
if (toastDurationSelect) toastDurationSelect.value = settings.toastDuration.toString();
if (timestampToggle) timestampToggle.checked = settings.showTimestamps;
if (fontSizeSelect) fontSizeSelect.value = settings.fontSize;

// Add theme select preview handler
if (themeSelect) {
  themeSelect.addEventListener('change', function() {
    settingsManager.previewTheme(this.value);
  });
}

// Add accent color preview handler
if (accentColorSelect) {
  accentColorSelect.addEventListener('change', function() {
    settingsManager.previewAccentColor(this.value);
  });
}

// Add save button handler
const saveSettingsBtn = document.getElementById('save-settings-btn');
if (saveSettingsBtn) {
  saveSettingsBtn.addEventListener('click', () => {
    const newSettings = {
      theme: themeSelect ? themeSelect.value : settings.theme,
      accentColor: accentColorSelect ? accentColorSelect.value : settings.accentColor,
      notifications: notificationToggle ? notificationToggle.checked : settings.notifications,
      toastDuration: toastDurationSelect ? parseInt(toastDurationSelect.value) : settings.toastDuration,
      showTimestamps: timestampToggle ? timestampToggle.checked : settings.showTimestamps,
      fontSize: fontSizeSelect ? fontSizeSelect.value : settings.fontSize
    };
    
    const success = settingsManager.updateSettings(newSettings);
    
    if (success) {
      showToast('Settings saved successfully', 'success');
      // Hide the modal
      if (settingsModal) {
        settingsModal.style.display = 'none';
      }
    } else {
      showToast('Failed to save settings', 'error');
    }
  });
}

// Add reset button handler
const resetSettingsBtn = document.getElementById('reset-settings-btn');
if (resetSettingsBtn) {
  resetSettingsBtn.addEventListener('click', () => {
    settingsManager.resetSettings();
    
    // Update form to match reset settings
    const resetSettings = settingsManager.getSettings();
    if (themeSelect) themeSelect.value = resetSettings.theme;
    if (accentColorSelect) accentColorSelect.value = resetSettings.accentColor;
    if (notificationToggle) notificationToggle.checked = resetSettings.notifications;
    if (toastDurationSelect) toastDurationSelect.value = resetSettings.toastDuration.toString();
    if (timestampToggle) timestampToggle.checked = resetSettings.showTimestamps;
    if (fontSizeSelect) fontSizeSelect.value = resetSettings.fontSize;
    
    showToast('Settings reset to defaults', 'info');
  });
}

// Add cancel button handler
const cancelSettingsBtn = document.querySelector('#settings-modal .close-modal');
if (cancelSettingsBtn) {
  cancelSettingsBtn.addEventListener('click', () => {
    settingsManager.cancelPreviews();
    settingsModal.style.display = 'none';
  });
}

// Update the settings button click handler
const settingsBtn = document.getElementById('settings-btn');
if (settingsBtn) {
  settingsBtn.addEventListener('click', () => {
    // Update form values to current settings before showing
    const currentSettings = settingsManager.getSettings();
    if (themeSelect) themeSelect.value = currentSettings.theme;
    if (accentColorSelect) accentColorSelect.value = currentSettings.accentColor;
    if (notificationToggle) notificationToggle.checked = currentSettings.notifications;
    if (toastDurationSelect) toastDurationSelect.value = currentSettings.toastDuration.toString();
    if (timestampToggle) timestampToggle.checked = currentSettings.showTimestamps;
    if (fontSizeSelect) fontSizeSelect.value = currentSettings.fontSize;
    
    // Show the modal
    settingsModal.style.display = 'flex';
  });
}
}

// Function to show toast notifications
function showToast(message, type = 'info') {
const toastContainer = document.getElementById('toast-container');
if (!toastContainer) return;

// Create toast element
const toast = document.createElement('div');
toast.classList.add('toast', type);

// Create icon based on toast type
const icon = document.createElement('i');
icon.style.marginRight = '8px';

switch(type) {
  case 'success':
    icon.className = 'fas fa-check-circle';
    icon.style.color = 'var(--success)';
    break;
  case 'error':
    icon.className = 'fas fa-exclamation-circle';
    icon.style.color = 'var(--danger)';
    break;
  default:
    icon.className = 'fas fa-info-circle';
    icon.style.color = 'var(--accent-primary)';
}

// Create message text element
const messageSpan = document.createElement('span');
messageSpan.textContent = message;

// Add elements to toast
toast.appendChild(icon);
toast.appendChild(messageSpan);

// Add to container
toastContainer.appendChild(toast);

// Use configurable duration or default to 3000ms
const duration = window.toastDuration || 3000;

// Auto-remove after duration
setTimeout(() => {
  toast.style.opacity = '0';
  toast.style.transform = 'translateX(20px)';
  setTimeout(() => {
    if (toast.parentNode === toastContainer) {
      toastContainer.removeChild(toast);
    }
  }, 300);
}, duration);
}

// Export for use in other scripts
window.settingsManager = settingsManager;
window.showToast = showToast;
