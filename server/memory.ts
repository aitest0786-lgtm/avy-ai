import fs from "fs";
import path from "path";

export interface MemoryItem {
  id: string;
  fact: string;
  category: "identity" | "preference" | "goal" | "project" | "relationship" | "emotional" | "behavioral";
  timestamp: string;
  confidence: number;
  importance?: "critical" | "important" | "normal" | "temporary";
  archived?: boolean;
  pinned?: boolean;
  notes?: string;
}

export interface UserMemories {
  userId: string;
  memories: MemoryItem[];
}

const MEMORY_FILE_PATH = path.join(process.cwd(), "data", "memories.json");
const SETTINGS_FILE_PATH = path.join(process.cwd(), "data", "settings.json");

// Ensure data directory exists
function ensureDataDir() {
  const dir = path.dirname(MEMORY_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export class MemoryManager {
  private static loadSettings(): Record<string, { paused?: boolean }> {
    ensureDataDir();
    if (!fs.existsSync(SETTINGS_FILE_PATH)) {
      return {};
    }
    try {
      const content = fs.readFileSync(SETTINGS_FILE_PATH, "utf8");
      return JSON.parse(content);
    } catch (err) {
      console.error("[MemoryManager] Error reading settings file:", err);
      return {};
    }
  }

  private static saveSettings(data: Record<string, { paused?: boolean }>): void {
    ensureDataDir();
    try {
      fs.writeFileSync(SETTINGS_FILE_PATH, JSON.stringify(data, null, 2), "utf8");
    } catch (err) {
      console.error("[MemoryManager] Error writing settings file:", err);
    }
  }

  public static isMemoryPaused(userId: string): boolean {
    const settings = this.loadSettings();
    return !!settings[userId]?.paused;
  }

  public static setMemoryPaused(userId: string, paused: boolean): void {
    const settings = this.loadSettings();
    if (!settings[userId]) {
      settings[userId] = {};
    }
    settings[userId].paused = paused;
    this.saveSettings(settings);
    console.log(`[MemoryManager] Memory paused setting for ${userId} set to ${paused}`);
  }

  public static clearAllMemories(userId: string): void {
    const all = this.loadAll();
    delete all[userId];
    this.saveAll(all);
    console.log(`[MemoryManager] Cleared all memories for user ${userId}`);
  }

  public static importMemories(userId: string, memories: MemoryItem[]): void {
    const all = this.loadAll();
    // Validate each memory has required fields
    const valid = memories.map((m) => ({
      id: m.id || `mem_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      fact: (m.fact || "").trim(),
      category: m.category || "preference",
      timestamp: m.timestamp || new Date().toISOString(),
      confidence: m.confidence !== undefined ? m.confidence : 1.0,
      importance: m.importance || "normal",
      archived: m.archived !== undefined ? m.archived : false,
      pinned: m.pinned !== undefined ? m.pinned : false,
      notes: m.notes || ""
    })).filter((m) => m.fact.length > 0);

    all[userId] = valid;
    this.saveAll(all);
    console.log(`[MemoryManager] Imported ${valid.length} memories for user ${userId}`);
  }

  private static loadAll(): Record<string, MemoryItem[]> {
    ensureDataDir();
    let data: Record<string, MemoryItem[]> = {};
    try {
      if (fs.existsSync(MEMORY_FILE_PATH)) {
        const content = fs.readFileSync(MEMORY_FILE_PATH, "utf8");
        data = JSON.parse(content);
      }
    } catch (err) {
      console.error("[MemoryManager] Error reading memory file:", err);
    }

    if (!data.default_user || data.default_user.length === 0) {
      data.default_user = [
        {
          id: "mem_seed_1",
          fact: "Rahul loves building products with AI and is currently building the Avy companion project.",
          category: "project",
          timestamp: new Date().toISOString(),
          confidence: 1.0,
          importance: "critical"
        },
        {
          id: "mem_seed_2",
          fact: "Rahul is deeply interested in learning AI, neural networks, and prompt engineering.",
          category: "goal",
          timestamp: new Date().toISOString(),
          confidence: 1.0,
          importance: "important"
        },
        {
          id: "mem_seed_3",
          fact: "Rahul's highly anticipated favorite game is GTA 6.",
          category: "preference",
          timestamp: new Date().toISOString(),
          confidence: 1.0,
          importance: "important"
        },
        {
          id: "mem_seed_4",
          fact: "Rahul prefers Hindi-English code-switching and casual bilingual conversations.",
          category: "behavioral",
          timestamp: new Date().toISOString(),
          confidence: 1.0,
          importance: "important"
        },
        {
          id: "mem_seed_5",
          fact: "Rahul is 24 years old and based in San Francisco.",
          category: "identity",
          timestamp: new Date().toISOString(),
          confidence: 1.0,
          importance: "critical"
        }
      ];
      try {
        fs.writeFileSync(MEMORY_FILE_PATH, JSON.stringify(data, null, 2), "utf8");
      } catch (err) {
        console.error("[MemoryManager] Error writing seeded memories:", err);
      }
    }
    return data;
  }

  private static saveAll(data: Record<string, MemoryItem[]>): void {
    ensureDataDir();
    try {
      fs.writeFileSync(MEMORY_FILE_PATH, JSON.stringify(data, null, 2), "utf8");
    } catch (err) {
      console.error("[MemoryManager] Error writing memory file:", err);
    }
  }

  public static getMemories(userId: string): MemoryItem[] {
    const all = this.loadAll();
    return all[userId] || [];
  }

  public static saveMemory(
    userId: string,
    fact: string,
    category: MemoryItem["category"],
    importance?: MemoryItem["importance"],
    archived?: boolean,
    pinned?: boolean,
    notes?: string
  ): MemoryItem {
    const all = this.loadAll();
    const userMems = all[userId] || [];

    // Create new memory item
    const newItem: MemoryItem = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      fact: fact.trim(),
      category,
      timestamp: new Date().toISOString(),
      confidence: 1.0,
      importance: importance || "normal",
      archived: archived || false,
      pinned: pinned || false,
      notes: notes || ""
    };

    userMems.push(newItem);
    all[userId] = userMems;
    this.saveAll(all);

    console.log(`[MemoryManager] Saved memory for user ${userId}:`, newItem);
    return newItem;
  }

  public static updateMemory(
    userId: string,
    id: string,
    newFact?: string,
    newCategory?: MemoryItem["category"],
    newImportance?: MemoryItem["importance"],
    archived?: boolean,
    pinned?: boolean,
    notes?: string
  ): boolean {
    const all = this.loadAll();
    const userMems = all[userId] || [];

    const index = userMems.findIndex((m) => m.id === id);
    if (index === -1) {
      return false;
    }

    const current = userMems[index];
    userMems[index] = {
      ...current,
      fact: newFact !== undefined ? newFact.trim() : current.fact,
      category: newCategory !== undefined ? newCategory : current.category,
      importance: newImportance !== undefined ? newImportance : (current.importance || "normal"),
      archived: archived !== undefined ? archived : current.archived,
      pinned: pinned !== undefined ? pinned : current.pinned,
      notes: notes !== undefined ? notes : current.notes,
      timestamp: new Date().toISOString()
    };

    all[userId] = userMems;
    this.saveAll(all);

    console.log(`[MemoryManager] Updated memory ${id} for user ${userId}:`, userMems[index]);
    return true;
  }

  public static forgetMemory(userId: string, id: string): boolean {
    const all = this.loadAll();
    const userMems = all[userId] || [];

    const index = userMems.findIndex((m) => m.id === id);
    if (index === -1) {
      return false;
    }

    const removed = userMems.splice(index, 1)[0];
    all[userId] = userMems;
    this.saveAll(all);

    console.log(`[MemoryManager] Forgot memory ${id} for user ${userId}:`, removed);
    return true;
  }

  public static searchMemories(
    userId: string,
    query?: string,
    category?: string
  ): MemoryItem[] {
    const memories = this.getMemories(userId);
    let filtered = memories;

    if (category && category !== "all") {
      filtered = filtered.filter((m) => m.category === category);
    }

    if (query) {
      const lowerQuery = query.toLowerCase();
      filtered = filtered.filter((m) => m.fact.toLowerCase().includes(lowerQuery));
    }

    return filtered;
  }

  public static formatIdentityMemoriesForPrompt(userId: string): string {
    const memories = this.getMemories(userId);
    const identityMemories = memories.filter((m) => m.category === "identity");
    
    if (identityMemories.length === 0) {
      return "(No identity memories saved yet. If they introduce themselves, be sure to store it using saveMemory.)";
    }

    return identityMemories
      .map((m) => `- [ID: ${m.id}] ${m.fact}`)
      .join("\n");
  }

  public static formatEssentialMemoriesForPrompt(userId: string): string {
    const memories = this.getMemories(userId);
    if (memories.length === 0) {
      return "(No prior memories saved yet. If they introduce themselves or share preferences, store them using saveMemory.)";
    }

    // Filter essential memories
    const essentials = memories.filter((m) => {
      // Identity is always essential
      if (m.category === "identity") return true;
      // Pinned or high importance is essential
      if (m.pinned || m.importance === "critical" || m.importance === "important") return true;
      // Language and speech preferences are essential
      const factLower = m.fact.toLowerCase();
      if (
        factLower.includes("language") ||
        factLower.includes("speak") ||
        factLower.includes("hindi") ||
        factLower.includes("english") ||
        factLower.includes("bilingual") ||
        factLower.includes("tone") ||
        factLower.includes("style")
      ) {
        return true;
      }
      return false;
    });

    if (essentials.length === 0) {
      return "(No identity, pinned, or language memories saved yet. Ask questions and store them!)";
    }

    return essentials
      .map((m) => `- [ID: ${m.id}] [Category: ${m.category}] [Importance: ${m.importance || "normal"}] ${m.fact}${m.pinned ? " (PINNED)" : ""}`)
      .join("\n");
  }

  public static formatMemoriesForPrompt(userId: string): string {
    const memories = this.getMemories(userId);
    if (memories.length === 0) {
      return "(No prior long-term memories saved yet. Introduce yourself and share your interests!)";
    }

    // Group memories by category
    const categories: Record<string, string[]> = {
      identity: [],
      preference: [],
      goal: [],
      project: [],
      relationship: [],
      emotional: [],
      behavioral: []
    };

    memories.forEach((m) => {
      if (categories[m.category]) {
        categories[m.category].push(`- [ID: ${m.id}] ${m.fact}`);
      } else {
        categories.preference.push(`- [ID: ${m.id}] ${m.fact} (category: ${m.category})`);
      }
    });

    let formatted = "";
    const categoryLabels: Record<string, string> = {
      identity: "IDENTITY (Who the user is)",
      preference: "PREFERENCES (What they like/dislike, creators, colors, music)",
      goal: "GOALS & ASPIRATIONS",
      project: "ONGOING PROJECTS",
      relationship: "RELATIONSHIPS (Friends, family mentioned)",
      emotional: "EMOTIONALLY SIGNIFICANT EVENTS",
      behavioral: "BEHAVIORAL HABITS & CONVERSATION PREFERENCES"
    };

    Object.keys(categoryLabels).forEach((cat) => {
      const items = categories[cat];
      if (items && items.length > 0) {
        formatted += `### ${categoryLabels[cat]}\n${items.join("\n")}\n\n`;
      }
    });

    return formatted.trim();
  }
}
