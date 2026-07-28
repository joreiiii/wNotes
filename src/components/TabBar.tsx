import { Home, Plus, X } from "lucide-react";
import { useTabsStore } from "../state/tabsStore";

export interface TabBarProps {
  onHome: () => void;
  onAddTab: () => void;
  onSelectTab: (tabId: string) => void;
  isHome: boolean;
}

export default function TabBar({ onHome, onAddTab, onSelectTab, isHome }: TabBarProps) {
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const closeTab = useTabsStore((s) => s.closeTab);

  return (
    <div className="tab-bar">
      <button
        className={"tab-bar-home" + (isHome ? " active" : "")}
        onClick={onHome}
        aria-label="Bibliothek"
      >
        <Home size={18} />
      </button>
      <div className="tab-bar-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={"tab" + (!isHome && tab.id === activeTabId ? " active" : "")}
            onClick={() => onSelectTab(tab.id)}
          >
            <span className="tab-title">{tab.title}</span>
            <span
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
            >
              <X size={13} />
            </span>
          </button>
        ))}
      </div>
      <button className="tab-bar-add" onClick={onAddTab} aria-label="Neuer Tab">
        <Plus size={18} />
      </button>
    </div>
  );
}
