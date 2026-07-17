export type CompanionState = 'disconnected' | 'connecting' | 'listening' | 'speaking' | 'error';

export type AssistantTheme = 'cyan' | 'amber' | 'purple' | 'emerald' | 'crimson' | 'aurora';

export interface SuggestedWebsite {
  url: string;
  siteName: string;
  timestamp: string;
}

export interface BrowserTab {
  id: string;
  url: string;
  siteName: string;
  history: string[];
  historyIndex: number;
}

export interface BrowserBookmark {
  url: string;
  siteName: string;
}

export interface BrowserState {
  isOpen: boolean;
  activeTabId: string;
  tabs: BrowserTab[];
  bookmarks: BrowserBookmark[];
  isDesktopView: boolean;
  isPrivate: boolean;
  showHistory: boolean;
  showBookmarks: boolean;
  historyList: { url: string; siteName: string; timestamp: string }[];
  closedTabs?: BrowserTab[];
  isSplitView?: boolean;
  splitActiveTabId?: string;
  zoom?: number;
}

export interface AssistantState {
  status: CompanionState;
  theme: AssistantTheme;
  error: string | null;
  websites: SuggestedWebsite[];
  browser: BrowserState;
}

