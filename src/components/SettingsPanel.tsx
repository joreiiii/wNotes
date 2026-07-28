import { X } from "lucide-react";
import { useSettingsStore, type ThemePreference } from "../state/settingsStore";

export interface SettingsPanelProps {
  onClose: () => void;
}

const THEME_OPTIONS: { id: ThemePreference; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Hell" },
  { id: "dark", label: "Dunkel" },
];

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <h2>Einstellungen</h2>
        <div>
          <div className="settings-group-label">Erscheinungsbild</div>
          <div className="settings-theme-options">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                className={theme === opt.id ? "active" : ""}
                onClick={() => setTheme(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <button className="icon-btn settings-close" onClick={onClose} aria-label="Schließen">
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
