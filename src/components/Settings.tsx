import { useState, useEffect } from 'react';
import { getSettings, saveSettings, type AppSettings, DEFAULT_SETTINGS } from '../settings';
import type { Todo } from '../api';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  todoList?: Todo[]; // Pass todoList to check for incomplete subtasks
}

export function Settings({ isOpen, onClose, onLogout, todoList = [] }: SettingsProps) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Always load fresh settings from database when settings modal opens
      setError(null); // Clear any previous errors
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      // Fetch from database
      const loadedSettings = await getSettings();
      setSettings(loadedSettings);
    } catch (error) {
      console.error('Failed to load settings:', error);
      // Fallback to defaults
      setSettings(DEFAULT_SETTINGS);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAutoComplete = async (enabled: boolean) => {
    const newSettings = { ...settings, autoCompleteRecurring: enabled };
    setSettings(newSettings);
    await saveSettings(newSettings);
  };

  const handleThemeChange = async (theme: 'light' | 'dark') => {
    const newSettings = { ...settings, theme };
    setSettings(newSettings);
    try {
      await saveSettings(newSettings);
      // Apply theme immediately after save
      const { applyTheme } = await import('../settings');
      applyTheme(theme);
    } catch (error) {
      console.error('Failed to save theme:', error);
      // Revert on error
      setSettings(settings);
    }
  };

  const handleToggleSubtasks = async (enabled: boolean) => {
    // If disabling, check if there are any tasks with incomplete subtasks
    if (!enabled && settings.enableSubtasks) {
      const tasksWithIncompleteSubtasks = todoList.filter(todo => {
        if (!todo.subtasks || todo.subtasks.length === 0) return false;
        const hasIncomplete = todo.subtasks.some(st => !st.completed);
        return hasIncomplete && !todo.completed; // Only check incomplete tasks
      });

      if (tasksWithIncompleteSubtasks.length > 0) {
        setError(`Cannot disable subtasks. You have ${tasksWithIncompleteSubtasks.length} task(s) with incomplete subtasks. Please complete all subtasks first.`);
        return;
      }
    }

    setError(null);
    const newSettings = { ...settings, enableSubtasks: enabled };
    setSettings(newSettings);
    try {
      await saveSettings(newSettings);
    } catch (err) {
      setError('Failed to save settings. Please try again.');
      // Revert on error
      setSettings(settings);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="settings-modal" onClick={onClose}>
      <div className="settings-content" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2 className="settings-title">Settings</h2>
          <button className="settings-close-btn" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)' }}>
            Loading settings...
          </div>
        )}

        {error && (
          <div className="settings-error-message">
            <span className="settings-error-text">{error}</span>
            <button 
              className="settings-error-close"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

        <div className="settings-section">
          <h3 className="settings-section-title">Recurring Tasks</h3>
          <div className="settings-option">
            <div className="settings-option-label">
              <div className="settings-option-label-title">Auto-complete in-progress tasks</div>
              <div className="settings-option-label-desc">
              </div>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={settings.autoCompleteRecurring}
                onChange={(e) => handleToggleAutoComplete(e.target.checked)}
                disabled={loading}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>

        <div className="settings-section">
          <h3 className="settings-section-title">Tasks</h3>
          <div className="settings-option">
            <div className="settings-option-label">
              <div className="settings-option-label-title">Enable subtasks</div>
              <div className="settings-option-label-desc">
              </div>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={settings.enableSubtasks}
                onChange={(e) => handleToggleSubtasks(e.target.checked)}
                disabled={loading}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>

        <div className="settings-section">
          <h3 className="settings-section-title">Appearance</h3>
          <div className="settings-option">
            <div className="settings-option-label">
              <div className="settings-option-label-title">Theme</div>
              <div className="settings-option-label-desc">
              </div>
            </div>
            <div className="theme-selector">
              <button
                className={`theme-option ${settings.theme === 'light' ? 'active' : ''}`}
                onClick={() => handleThemeChange('light')}
                disabled={loading}
              >
                Light
              </button>
              <button
                className={`theme-option ${settings.theme === 'dark' ? 'active' : ''}`}
                onClick={() => handleThemeChange('dark')}
                disabled={loading}
              >
                Dark
              </button>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h3 className="settings-section-title">Account</h3>
          <button 
            className="settings-logout-btn" 
            onClick={() => {
              onLogout();
              onClose();
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
