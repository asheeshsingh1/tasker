// Settings management utilities
import { userSettings, type UserPreferences } from './api';

export interface AppSettings {
  autoCompleteRecurring: boolean;
  theme: 'light' | 'dark';
  enableSubtasks: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoCompleteRecurring: false,
  theme: 'light',
  enableSubtasks: false,
};

// Get settings from database only (no localStorage)
export async function getSettings(): Promise<AppSettings> {
  try {
    const response = await userSettings.get();
    const dbSettings: AppSettings = {
      autoCompleteRecurring: response.preferences.autoCompleteRecurring ?? DEFAULT_SETTINGS.autoCompleteRecurring,
      theme: response.preferences.theme ?? DEFAULT_SETTINGS.theme,
      enableSubtasks: response.preferences.enableSubtasks ?? DEFAULT_SETTINGS.enableSubtasks,
    };
    return dbSettings;
  } catch (error) {
    // If API fails (e.g., not logged in), return defaults
    console.warn('Failed to fetch settings from server, using defaults:', error);
    return DEFAULT_SETTINGS;
  }
}

// Save settings to database only
export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    // Save to database
    const response = await userSettings.update({
      autoCompleteRecurring: settings.autoCompleteRecurring,
      theme: settings.theme,
      enableSubtasks: settings.enableSubtasks,
    });
    console.log('Settings saved successfully:', response);
    // Apply theme immediately
    applyTheme(settings.theme);
  } catch (error) {
    console.error('Failed to save settings to server:', error);
    throw error;
  }
}

export async function updateSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K]
): Promise<void> {
  const settings = await getSettings();
  settings[key] = value;
  await saveSettings(settings);
}

export function applyTheme(theme: 'light' | 'dark'): void {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark-theme');
  } else {
    root.classList.remove('dark-theme');
  }
}

// Initialize theme on load (use default, will be updated when settings load)
export function initializeSettings(): void {
  // Use default theme until settings are loaded from database
  applyTheme(DEFAULT_SETTINGS.theme);
}

// Load settings from database on app start
export async function loadSettingsFromServer(): Promise<AppSettings> {
  return await getSettings();
}

