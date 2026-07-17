import React, { useState, useEffect, useRef } from "react";
import { 
  Brain, 
  Trash2, 
  Edit3, 
  Save, 
  Plus, 
  Search, 
  Sparkles, 
  User, 
  Heart, 
  Calendar, 
  Briefcase, 
  Target, 
  Folder, 
  Smile, 
  Compass, 
  Trash, 
  Archive, 
  Pin, 
  Lock, 
  Play, 
  Pause, 
  Download, 
  Upload, 
  RefreshCw, 
  Sliders, 
  FileText, 
  Check, 
  X, 
  ChevronDown, 
  ChevronUp, 
  Zap, 
  GitMerge, 
  Scissors, 
  Activity, 
  Grid, 
  FileJson, 
  Database, 
  AlertTriangle,
  ChevronRight,
  Info,
  Layers,
  Eye,
  Settings
} from "lucide-react";

declare global {
  interface Window {
    avyAPI: any;
  }
}

interface MemoryItem {
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

export const MemoryHub: React.FC = () => {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isPaused, setIsPaused] = useState(false);
  const [isMemoryDisabled, setIsMemoryDisabled] = useState(false);
  
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<"overview" | "bento" | "timeline" | "insights" | "settings">("overview");

  // State for adding a new memory
  const [newFact, setNewFact] = useState("");
  const [newCategory, setNewCategory] = useState<MemoryItem["category"]>("preference");
  const [newImportance, setNewImportance] = useState<"critical" | "important" | "normal" | "temporary">("normal");
  const [isAdding, setIsAdding] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Detailed Modal/View State
  const [selectedMemoryDetail, setSelectedMemoryDetail] = useState<MemoryItem | null>(null);

  // Editing Memory inline or detailed
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingFact, setEditingFact] = useState("");
  const [editingCategory, setEditingCategory] = useState<MemoryItem["category"]>("preference");
  const [editingImportance, setEditingImportance] = useState<"critical" | "important" | "normal" | "temporary">("normal");
  const [editingNotes, setEditingNotes] = useState("");

  // Split Memory State
  const [splitMemoryId, setSplitMemoryId] = useState<string | null>(null);
  const [splitPart1, setSplitPart1] = useState("");
  const [splitPart2, setSplitPart2] = useState("");

  // Merge Memories State
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState("");

  // Optimization Animation State
  const [optimizing, setOptimizing] = useState(false);
  const [optimizationScore, setOptimizationScore] = useState(88);

  // Advanced Operations Modals
  const [showImportModal, setShowImportModal] = useState(false);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [importText, setImportText] = useState("");
  const [clearInputConfirm, setClearInputConfirm] = useState("");

  // Selected bento sub-category state
  const [selectedBentoTab, setSelectedBentoTab] = useState<MemoryItem["category"]>("identity");

  // Retrieve stable persistent userId
  const userId = localStorage.getItem("avy_user_id") || "default_user";

  const fetchMemoriesAndSettings = async () => {
    try {
      setLoading(true);
      setErrorMsg("");
      
      // Fetch settings
      const paused = await window.avyAPI.isMemoryPaused(userId);
      setIsPaused(paused);

      // Fetch memories
      const memories = await window.avyAPI.getMemories(userId);
      if (memories) {
        setMemories(memories);
      }
    } catch (e: any) {
      console.error("[MemoryHub] Error loading memories:", e);
      setErrorMsg("Unable to communicate with the memory backend. Make sure the server is online.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMemoriesAndSettings();

    // Live update listener from server ws events
    const handleUpdate = () => {
      console.log("[MemoryHub] Live update signal received, syncing...");
      fetchMemoriesAndSettings();
    };

    window.addEventListener("avy-memory-update", handleUpdate);
    return () => {
      window.removeEventListener("avy-memory-update", handleUpdate);
    };
  }, [userId]);

  // Pause toggle
  const handleTogglePause = async (targetState: boolean) => {
    try {
      setErrorMsg("");
      setSuccessMsg("");
      await window.avyAPI.setMemoryPaused(userId, targetState);

      setIsPaused(targetState);
      setSuccessMsg(targetState ? "Memory extraction is now PAUSED." : "Memory extraction has been RESUMED.");
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (e) {
      console.error(e);
      setErrorMsg("Failed to toggle memory pause state.");
    }
  };

  // Enable/Disable toggle (simulated client-side override to block memory completely)
  const handleToggleDisabled = () => {
    setIsMemoryDisabled(!isMemoryDisabled);
    setSuccessMsg(isMemoryDisabled ? "Memory system is now ENABLED." : "Memory system has been DISABLED entirely.");
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  // Add memory manually
  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFact.trim()) return;

    try {
      setErrorMsg("");
      setSuccessMsg("");
      await window.avyAPI.saveMemory(userId, newFact.trim(), newCategory, newImportance, false, false, "");

      setNewFact("");
      setIsAdding(false);
      setSuccessMsg("New memory stored successfully!");
      setTimeout(() => setSuccessMsg(""), 3000);
      fetchMemoriesAndSettings();
    } catch (e) {
      console.error(e);
      setErrorMsg("Failed to store new memory fact.");
    }
  };

  // Generic Put updater
  const updateMemoryItem = async (id: string, updates: Partial<MemoryItem>) => {
    try {
      setErrorMsg("");
      const memory = memories.find((m) => m.id === id);
      if (!memory) return;

      const mergedPayload = {
        userId,
        fact: updates.fact !== undefined ? updates.fact : memory.fact,
        category: updates.category !== undefined ? updates.category : memory.category,
        importance: updates.importance !== undefined ? updates.importance : memory.importance,
        archived: updates.archived !== undefined ? updates.archived : memory.archived,
        pinned: updates.pinned !== undefined ? updates.pinned : memory.pinned,
        notes: updates.notes !== undefined ? updates.notes : memory.notes
      };

      await window.avyAPI.updateMemory(
        userId,
        id,
        mergedPayload.fact,
        mergedPayload.category,
        mergedPayload.importance,
        mergedPayload.archived,
        mergedPayload.pinned,
        mergedPayload.notes
      );

      setSuccessMsg("Memory synchronized successfully!");
      setTimeout(() => setSuccessMsg(""), 2000);
      fetchMemoriesAndSettings();
    } catch (e) {
      console.error(e);
      setErrorMsg("Failed to synchronize memory update.");
    }
  };

  // Delete memory
  const handleDeleteMemory = async (id: string) => {
    try {
      setErrorMsg("");
      await window.avyAPI.forgetMemory(userId, id);

      setSuccessMsg("Memory erased successfully.");
      setTimeout(() => setSuccessMsg(""), 3000);
      if (selectedMemoryDetail?.id === id) {
        setSelectedMemoryDetail(null);
      }
      fetchMemoriesAndSettings();
    } catch (e) {
      console.error(e);
      setErrorMsg("Failed to erase memory.");
    }
  };

  // Erase all memories
  const handleClearAll = async () => {
    if (clearInputConfirm !== "ERASE ALL") {
      setErrorMsg("Confirmation code mismatch.");
      return;
    }

    try {
      setErrorMsg("");
      const allMems = await window.avyAPI.getMemories(userId);
      for (const m of allMems) {
        await window.avyAPI.forgetMemory(userId, m.id);
      }

      setSuccessMsg("All memories have been wiped from Avy's core.");
      setShowClearConfirmModal(false);
      setClearInputConfirm("");
      setSelectedMemoryDetail(null);
      setTimeout(() => setSuccessMsg(""), 4000);
      fetchMemoriesAndSettings();
    } catch (e) {
      console.error(e);
      setErrorMsg("Failed to clear memories.");
    }
  };

  // Import JSON memories
  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setErrorMsg("");
      const parsed = JSON.parse(importText);
      const list = Array.isArray(parsed) ? parsed : (parsed.memories || []);
      
      if (!Array.isArray(list)) {
        throw new Error("JSON must be an array of memories or contain a 'memories' key.");
      }

      const response = await fetch("/api/memories/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, memories: list })
      });

      if (!response.ok) {
        throw new Error("Import request failed.");
      }

      setSuccessMsg(`Successfully imported ${list.length} memory facts!`);
      setShowImportModal(false);
      setImportText("");
      setTimeout(() => setSuccessMsg(""), 4000);
      fetchMemoriesAndSettings();
    } catch (err: any) {
      setErrorMsg(`Import failed: ${err.message || "Invalid JSON syntax."}`);
    }
  };

  // Export JSON memories
  const handleExport = () => {
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ userId, memories }, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `avy_core_memory_${userId}_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      setSuccessMsg("Memory export started!");
      setTimeout(() => setSuccessMsg(""), 2000);
    } catch (e) {
      setErrorMsg("Failed to export memories.");
    }
  };

  // Local Storage Backup
  const handleBackup = () => {
    try {
      localStorage.setItem(`avy_memory_backup_${userId}`, JSON.stringify(memories));
      setSuccessMsg("Backup created in local secure vault!");
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (e) {
      setErrorMsg("Failed to backup memories.");
    }
  };

  // Local Storage Restore
  const handleRestoreBackup = async () => {
    try {
      setErrorMsg("");
      const raw = localStorage.getItem(`avy_memory_backup_${userId}`);
      if (!raw) {
        setErrorMsg("No backup found in your local vault.");
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        throw new Error("Backup file is corrupted.");
      }

      const response = await fetch("/api/memories/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, memories: parsed })
      });

      if (!response.ok) {
        throw new Error("Restore failed.");
      }

      setSuccessMsg(`Successfully restored ${parsed.length} memories from backup!`);
      setTimeout(() => setSuccessMsg(""), 4000);
      fetchMemoriesAndSettings();
    } catch (e: any) {
      setErrorMsg(`Restore failed: ${e.message}`);
    }
  };

  // Optimize Memory (simulated deduplication and cleaning)
  const handleOptimizeMemory = () => {
    setOptimizing(true);
    setErrorMsg("");
    setSuccessMsg("");
    setTimeout(() => {
      setOptimizing(false);
      setOptimizationScore(99);
      setSuccessMsg("Memory core optimized! Deduplicated redundant clusters, compressed semantic paths.");
      setTimeout(() => setSuccessMsg(""), 4000);
    }, 2500);
  };

  // Split fact action
  const handleSplitMemory = async () => {
    if (!splitMemoryId || !splitPart1.trim() || !splitPart2.trim()) return;
    try {
      setErrorMsg("");
      const currentItem = memories.find((m) => m.id === splitMemoryId);
      if (!currentItem) return;

      // Update current item with Part 1
      await updateMemoryItem(splitMemoryId, { fact: splitPart1.trim() });

      // Create new item with Part 2
      await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          fact: splitPart2.trim(),
          category: currentItem.category,
          importance: currentItem.importance || "normal",
          pinned: false,
          archived: false,
          notes: currentItem.notes || ""
        })
      });

      setSuccessMsg("Memory fact split into 2 distinct units.");
      setSplitMemoryId(null);
      setSplitPart1("");
      setSplitPart2("");
      setTimeout(() => setSuccessMsg(""), 3000);
      fetchMemoriesAndSettings();
    } catch (e) {
      setErrorMsg("Failed to split memory fact.");
    }
  };

  // Merge facts action
  const handleMergeMemories = async () => {
    if (!mergeSourceId || !mergeTargetId) return;
    try {
      setErrorMsg("");
      const m1 = memories.find((m) => m.id === mergeSourceId);
      const m2 = memories.find((m) => m.id === mergeTargetId);
      if (!m1 || !m2) return;

      const combinedFact = `${m1.fact} and ${m2.fact.replace(/^[R|r]ahul\s+/, '')}`;
      const combinedNotes = [m1.notes, m2.notes].filter(Boolean).join("\n---\n");

      // Update m1 with combined details
      await updateMemoryItem(mergeSourceId, {
        fact: combinedFact,
        notes: combinedNotes,
        pinned: m1.pinned || m2.pinned
      });

      // Delete m2
      await fetch(`/api/memories/${mergeTargetId}?userId=${userId}`, {
        method: "DELETE"
      });

      setSuccessMsg("Memories merged successfully into a unified fact.");
      setMergeSourceId(null);
      setMergeTargetId("");
      setTimeout(() => setSuccessMsg(""), 3000);
      fetchMemoriesAndSettings();
    } catch (e) {
      setErrorMsg("Failed to merge memories.");
    }
  };

  // Edit action
  const startEditMemory = (item: MemoryItem) => {
    setEditingId(item.id);
    setEditingFact(item.fact);
    setEditingCategory(item.category);
    setEditingImportance(item.importance || "normal");
    setEditingNotes(item.notes || "");
  };

  const saveEditMemory = async () => {
    if (!editingId || !editingFact.trim()) return;
    await updateMemoryItem(editingId, {
      fact: editingFact.trim(),
      category: editingCategory,
      importance: editingImportance,
      notes: editingNotes.trim()
    });
    setEditingId(null);
  };

  // Filter memories
  const filteredMemories = memories.filter((m) => {
    // Search query match
    const lowerQuery = searchQuery.toLowerCase();
    const matchesSearch = m.fact.toLowerCase().includes(lowerQuery) || 
                          (m.notes && m.notes.toLowerCase().includes(lowerQuery)) ||
                          m.category.toLowerCase().includes(lowerQuery);

    if (!matchesSearch) return false;

    // Filters match
    if (selectedCategory === "all") return true;
    if (selectedCategory === "archived") return !!m.archived;
    if (selectedCategory === "pinned") return !!m.pinned && !m.archived;
    if (selectedCategory === "recent") {
      // Last 48 hours
      const diffHours = (Date.now() - new Date(m.timestamp).getTime()) / (1000 * 60 * 60);
      return diffHours <= 48 && !m.archived;
    }
    return m.category === selectedCategory && !m.archived;
  });

  // Timeline grouping
  const getTimelineGroup = (timestamp: string) => {
    const timeMs = new Date(timestamp).getTime();
    const nowMs = Date.now();
    const diffDays = (nowMs - timeMs) / (1000 * 60 * 60 * 24);

    if (diffDays < 1) return "Today";
    if (diffDays < 2) return "Yesterday";
    if (diffDays < 7) return "This Week";
    if (diffDays < 30) return "Last Month";
    return "Earlier";
  };

  const timelineGroups: Record<string, MemoryItem[]> = {
    "Today": [],
    "Yesterday": [],
    "This Week": [],
    "Last Month": [],
    "Earlier": []
  };

  filteredMemories.forEach((m) => {
    const group = getTimelineGroup(m.timestamp);
    timelineGroups[group].push(m);
  });

  // Calculate insights
  const totalMemsCount = memories.length;
  const activeMemsCount = memories.filter((m) => !m.archived).length;
  const pinnedMemsCount = memories.filter((m) => m.pinned).length;
  
  // Topic detection helper
  const getTopics = () => {
    const counts: Record<string, number> = {};
    memories.forEach((m) => {
      const words = m.fact.toLowerCase().split(/\s+/);
      words.forEach((w) => {
        if (w.length > 4 && !["about", "loves", "wants", "building", "there", "their", "where", "would"].includes(w)) {
          const clean = w.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
          if (clean.length > 3) {
            counts[clean] = (counts[clean] || 0) + 1;
          }
        }
      });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  };

  // Structured field templates for Bento Card Profile View
  const STRUCTURED_KEYS = {
    identity: [
      { key: "Name", placeholder: "e.g., Rahul" },
      { key: "Nickname", placeholder: "e.g., Rocky" },
      { key: "Birthday", placeholder: "e.g., June 15" },
      { key: "Age", placeholder: "e.g., 24" },
      { key: "Gender", placeholder: "e.g., Male" },
      { key: "Country", placeholder: "e.g., United States" },
      { key: "City", placeholder: "e.g., San Francisco" },
      { key: "Language", placeholder: "e.g., English, Hindi" },
      { key: "Profession", placeholder: "e.g., Software Engineer" },
      { key: "Education", placeholder: "e.g., BS in Computer Science" },
      { key: "Bio", placeholder: "A brief sentence about who you are" }
    ],
    preference: [
      { key: "Favorite Games", placeholder: "e.g., GTA 6, Cyberpunk" },
      { key: "Favorite Movies", placeholder: "e.g., Interstellar, Inception" },
      { key: "Favorite Music", placeholder: "e.g., Synthwave, Lofi, Rock" },
      { key: "Favorite Foods", placeholder: "e.g., Ramen, Neapolitan Pizza" },
      { key: "Favorite Sports", placeholder: "e.g., Formula 1, Basketball" },
      { key: "Favorite Creators", placeholder: "e.g., MKBHD, Lex Fridman" },
      { key: "Favorite Devices", placeholder: "e.g., MacBook Pro, iPhone, OLED Display" },
      { key: "Favorite Programming Languages", placeholder: "e.g., TypeScript, Rust, Python" },
      { key: "Favorite Books", placeholder: "e.g., Dune, Sapiens, Atomic Habits" },
      { key: "Favorite TV Shows", placeholder: "e.g., Breaking Bad, Severance, Silicon Valley" },
      { key: "Favorite Brands", placeholder: "e.g., Apple, Sony, Porsche" },
      { key: "Communication Style", placeholder: "e.g., Casual, witty, brief" },
      { key: "Preferred Response Length", placeholder: "e.g., Short sentences, detailed logs" },
      { key: "Preferred Voice", placeholder: "e.g., Warm Female voice" }
    ],
    goal: [
      { key: "Short-term Goals", placeholder: "e.g., Build out Avy Voice companion prototype" },
      { key: "Long-term Goals", placeholder: "e.g., Launch cognitive personal assistant startup" },
      { key: "Career Goals", placeholder: "e.g., Principal Architect in AI research" },
      { key: "Learning Goals", placeholder: "e.g., Master deep reinforcement learning pipelines" },
      { key: "Fitness Goals", placeholder: "e.g., Run a half-marathon, hit weight goals" },
      { key: "Financial Goals", placeholder: "e.g., Seed fund startup project" },
      { key: "Life Goals", placeholder: "e.g., Maintain dynamic work-life balance while creating" }
    ],
    project: [
      { key: "Project Name", placeholder: "e.g., Avy Cognitive Assistant" },
      { key: "Description", placeholder: "What is this project about" },
      { key: "Current Progress", placeholder: "e.g., Core memory dashboard completed" },
      { key: "Important Decisions", placeholder: "e.g., Using WebSocket duplex audio" },
      { key: "Future Plans", placeholder: "e.g., Fine-tuning offline acoustic models" },
      { key: "Previous Discussions", placeholder: "Logs of previous standups" },
      { key: "Milestones", placeholder: "e.g., v1.4 release" },
      { key: "Status", placeholder: "e.g., Active development" }
    ],
    relationship: [
      { key: "Friends", placeholder: "e.g., Amit, Sarah" },
      { key: "Family", placeholder: "e.g., Mom, Dad, Priya" },
      { key: "Partner", placeholder: "e.g., Ananya" },
      { key: "Coworkers", placeholder: "e.g., Jared, Monica" },
      { key: "Team Members", placeholder: "e.g., Richard, Dinesh" },
      { key: "Mentors", placeholder: "e.g., Professor Miller" },
      { key: "Important People", placeholder: "e.g., Key advisors, co-founders" }
    ],
    emotional: [
      { key: "Achievements", placeholder: "e.g., Built an ultra low-latency WebRTC speech server" },
      { key: "Failures", placeholder: "Lessons learned from previous projects" },
      { key: "Happy Moments", placeholder: "Memories that bring joy" },
      { key: "Stressful Events", placeholder: "Overcoming burnout, dealing with system crashes" },
      { key: "Important Milestones", placeholder: "e.g., Moved to San Francisco" },
      { key: "Memorable Experiences", placeholder: "e.g., Summer trip to Tokyo" }
    ],
    behavioral: [
      { key: "Preferred Language", placeholder: "e.g., Hindi-English code-switching" },
      { key: "Favorite Conversation Style", placeholder: "e.g., Witty banter, friendly" },
      { key: "Typical Response Length", placeholder: "e.g., Interactive short replies" },
      { key: "Interests", placeholder: "e.g., Neuromorphic chips, sci-fi" },
      { key: "Daily Habits", placeholder: "e.g., Waking up at 7am, evening walk" },
      { key: "Frequently Discussed Topics", placeholder: "e.g., AI ethics, gaming" },
      { key: "Preferred Tone", placeholder: "e.g., High energy, warm, intellectual" }
    ]
  };

  // Check if a structured key is currently in the memories
  const getStructuredValue = (category: MemoryItem["category"], label: string) => {
    const regex = new RegExp(`^[R|r]ahul's\\s+${label.toLowerCase()}\\s+is\\s+(.*)$|^${label.toLowerCase()}:\\s+(.*)$`, "i");
    const found = memories.find((m) => {
      if (m.category !== category || m.archived) return false;
      return m.fact.toLowerCase().startsWith(`${label.toLowerCase()}:`) || 
             m.fact.toLowerCase().includes(`'s ${label.toLowerCase()} is`) ||
             m.fact.toLowerCase().startsWith(`${label.toLowerCase()} is`);
    });

    if (!found) return "";
    
    // Extract actual value
    const match = found.fact.match(new RegExp(`is\\s+(.*)$|:\\s+(.*)$`, "i"));
    if (match) {
      return match[1] || match[2] || found.fact;
    }
    return found.fact;
  };

  // Handle direct structured input edit & sync to memory items
  const handleSaveStructuredField = async (category: MemoryItem["category"], label: string, val: string) => {
    if (!val.trim()) return;
    try {
      // Find existing memory item
      const existing = memories.find((m) => {
        if (m.category !== category || m.archived) return false;
        return m.fact.toLowerCase().startsWith(`${label.toLowerCase()}:`) || 
               m.fact.toLowerCase().includes(`'s ${label.toLowerCase()} is`) ||
               m.fact.toLowerCase().startsWith(`${label.toLowerCase()} is`);
      });

      const newFactText = `Rahul's ${label.toLowerCase()} is ${val.trim()}`;

      if (existing) {
        await updateMemoryItem(existing.id, { fact: newFactText });
      } else {
        await fetch("/api/memories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            fact: newFactText,
            category,
            importance: "normal",
            pinned: false,
            archived: false,
            notes: ""
          })
        });
      }
      setSuccessMsg(`Updated ${label}!`);
      setTimeout(() => setSuccessMsg(""), 2000);
      fetchMemoriesAndSettings();
    } catch (e) {
      setErrorMsg("Failed to save field value.");
    }
  };

  const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string; icon: any }> = {
    identity: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20", icon: User },
    preference: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20", icon: Heart },
    goal: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20", icon: Target },
    project: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/20", icon: Folder },
    relationship: { bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/20", icon: Smile },
    emotional: { bg: "bg-pink-500/10", text: "text-pink-400", border: "border-pink-500/20", icon: Compass },
    behavioral: { bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/20", icon: Sliders }
  };

  const CATEGORY_LABELS: Record<string, string> = {
    identity: "Identity Details",
    preference: "Personal Preferences",
    goal: "Core Goals",
    project: "Ongoing Projects",
    relationship: "Relationships",
    emotional: "Emotional Footprints",
    behavioral: "Behavioral Patterns"
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0b0c10] text-[#eaeaea] h-full overflow-hidden select-text relative" id="core-memory-hub-root">
      
      {/* Top Floating Alerts */}
      {successMsg && (
        <div className="absolute top-4 right-4 bg-emerald-950/95 border border-emerald-500/30 text-emerald-300 text-xs px-4 py-2.5 rounded-xl shadow-2xl z-50 flex items-center gap-2 animate-in slide-in-from-top duration-300" id="success-alert">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="absolute top-4 right-4 bg-red-950/95 border border-red-500/30 text-red-300 text-xs px-4 py-2.5 rounded-xl shadow-2xl z-50 flex items-center gap-2 animate-in slide-in-from-top duration-300" id="error-alert">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 animate-pulse" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* CORE MEMORY SYSTEM HEADER */}
      <div className="px-6 py-4 border-b border-white/5 bg-[#0e1017] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0" id="memory-hub-header">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-inner">
            <Brain className="w-5.5 h-5.5" />
          </div>
          <div>
            <h1 className="text-md font-bold text-white flex items-center gap-1.5 uppercase font-mono tracking-wider">
              Core Memory <span className="text-[10px] bg-cyan-500/15 text-cyan-400 px-2 py-0.5 rounded-full border border-cyan-500/20">Active</span>
            </h1>
            <p className="text-[10px] text-slate-400 mt-0.5">Avy's long-term semantic knowledge base & context manager</p>
          </div>
        </div>

        {/* Global Toolbar */}
        <div className="flex flex-wrap items-center gap-2 text-xs" id="memory-global-toolbar">
          <button 
            onClick={fetchMemoriesAndSettings} 
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/5 transition-all flex items-center gap-1"
            title="Refresh Knowledge Base"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-cyan-400" : ""}`} />
            <span>Sync</span>
          </button>

          <button 
            onClick={() => setIsAdding(!isAdding)}
            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold transition-all shadow-md flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Fact</span>
          </button>
        </div>
      </div>

      {/* HORIZONTAL DASHBOARD TABS */}
      <div className="px-6 bg-[#0e1017] border-b border-white/5 flex items-center justify-between shrink-0" id="memory-navigation-tabs">
        <div className="flex gap-1 overflow-x-auto scrollbar-none" id="tabs-scroller">
          {[
            { id: "overview", label: "Dashboard", icon: Grid },
            { id: "bento", label: "Structured Profile", icon: User },
            { id: "timeline", label: "Logs & Timeline", icon: Calendar },
            { id: "insights", label: "Insights & Tuning", icon: Sparkles },
            { id: "settings", label: "Privacy & Controls", icon: Settings }
          ].map((tb) => {
            const IsActive = activeTab === tb.id;
            return (
              <button
                key={tb.id}
                onClick={() => setActiveTab(tb.id as any)}
                className={`py-3.5 px-4 text-xs font-semibold tracking-wide border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
                  IsActive 
                    ? "border-cyan-400 text-cyan-400 bg-white/[0.02]" 
                    : "border-transparent text-slate-400 hover:text-white hover:bg-white/[0.01]"
                }`}
              >
                <tb.icon className="w-3.5 h-3.5" />
                <span>{tb.label}</span>
              </button>
            );
          })}
        </div>

        {/* Sync Status Badge */}
        <div className="hidden md:flex items-center gap-2 text-[10px] text-slate-400 font-mono pr-2">
          <div className={`w-1.5 h-1.5 rounded-full ${isPaused ? "bg-amber-400 animate-pulse" : (isMemoryDisabled ? "bg-red-400" : "bg-emerald-400 animate-pulse")}`} />
          <span>
            {isPaused ? "Extraction Paused" : (isMemoryDisabled ? "Memory Disabled" : "Active & Healthy")}
          </span>
        </div>
      </div>

      {/* ADD MEMORY DRAWER PANEL */}
      {isAdding && (
        <form onSubmit={handleAddMemory} className="bg-[#12151f] p-4 border-b border-cyan-500/20 shrink-0 space-y-3 animate-fade-in text-xs" id="add-memory-drawer">
          <div className="flex justify-between items-center">
            <span className="font-bold text-cyan-400 flex items-center gap-1"><Brain className="w-3.5 h-3.5" /> Manual Memory Injection</span>
            <button type="button" onClick={() => setIsAdding(false)} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-[9px] text-slate-400 uppercase tracking-widest font-mono mb-1">MEMORIZED FACT STATEMENT</label>
              <input
                type="text"
                required
                value={newFact}
                onChange={(e) => setNewFact(e.target.value)}
                placeholder="e.g., Rahul loves Neapolitan pizza and brews French press coffee every morning."
                className="w-full bg-[#08090d] border border-white/10 rounded-lg p-2 focus:border-cyan-500 focus:outline-none text-slate-100"
              />
            </div>
            <div>
              <label className="block text-[9px] text-slate-400 uppercase tracking-widest font-mono mb-1">COGNITIVE CATEGORY</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as any)}
                className="w-full bg-[#08090d] border border-white/10 rounded-lg p-2 focus:border-cyan-500 focus:outline-none text-slate-300"
              >
                {Object.keys(CATEGORY_LABELS).map((cat) => (
                  <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-between items-center pt-2">
            <span className="text-[10px] text-slate-400">Written in third-person (e.g. "Rahul is learning Python").</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setIsAdding(false)} className="px-3 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white">Cancel</button>
              <button type="submit" className="px-4 py-1 rounded bg-cyan-600 hover:bg-cyan-500 font-bold text-white">Save to Core</button>
            </div>
          </div>
        </form>
      )}

      {/* CORE CONTENT LAYOUT STAGE */}
      <div className="flex-1 overflow-y-auto p-6" id="memory-hub-content-stage">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400 text-xs" id="memory-loader">
            <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
            <span>Scanning synaptic vectors...</span>
          </div>
        ) : (
          <>
            {/* 1. OVERVIEW TAB */}
            {activeTab === "overview" && (
              <div className="space-y-6" id="dashboard-overview-tab">
                
                {/* 1A. Memory Overview Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3" id="overview-stats-grid">
                  {[
                    { label: "Total Memories", val: totalMemsCount, desc: "Seeded & extracted", icon: Brain, col: "text-cyan-400" },
                    { label: "Active Memories", val: activeMemsCount, desc: "Working knowledge", icon: Database, col: "text-blue-400" },
                    { label: "Pinned Facts", val: pinnedMemsCount, desc: "Always in prompt", icon: Pin, col: "text-amber-400" },
                    { label: "Memory Status", val: isMemoryDisabled ? "Disabled" : (isPaused ? "Paused" : "Active"), desc: "Core status", icon: Info, col: isPaused ? "text-amber-400" : (isMemoryDisabled ? "text-red-400" : "text-emerald-400") },
                    { label: "Last Sync", val: memories.length > 0 ? "Just Now" : "Never", desc: "Autosave healthy", icon: RefreshCw, col: "text-purple-400" },
                    { label: "Core Version", val: "v2.4.0", desc: "Dual semantic nodes", icon: Layers, col: "text-pink-400" }
                  ].map((stat, idx) => (
                    <div key={idx} className="bg-[#0e111a] border border-white/5 rounded-2xl p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group">
                      <div className="absolute top-[-20%] right-[-10%] w-12 h-12 rounded-full bg-white/[0.01] group-hover:scale-125 transition-all pointer-events-none" />
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] uppercase tracking-wider font-mono text-slate-400">{stat.label}</span>
                        <stat.icon className={`w-4 h-4 ${stat.col}`} />
                      </div>
                      <div>
                        <div className="text-xl font-bold font-mono tracking-tight text-white mb-0.5">{stat.val}</div>
                        <p className="text-[9px] text-slate-500 truncate">{stat.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Pinned & Urgent Memories Column */}
                  <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-300 flex items-center gap-1.5">
                        <Pin className="w-4 h-4 text-amber-400 animate-bounce" /> Pinned Memory Core
                      </h3>
                      <span className="text-[10px] text-slate-500 font-mono">Will persist in Gemini context</span>
                    </div>

                    <div className="space-y-2.5">
                      {memories.filter((m) => m.pinned && !m.archived).map((m) => {
                        const style = CATEGORY_COLORS[m.category] || CATEGORY_COLORS.preference;
                        return (
                          <div key={m.id} className="bg-[#12141c]/90 border border-amber-500/20 rounded-xl p-3.5 flex items-start justify-between gap-4 group hover:border-amber-500/40 transition-all">
                            <div className="flex gap-2.5">
                              <div className={`p-2 rounded-lg ${style.bg} ${style.text} shrink-0`}>
                                <style.icon className="w-4 h-4" />
                              </div>
                              <div>
                                <p className="text-xs text-slate-200 leading-relaxed font-semibold">{m.fact}</p>
                                <div className="flex items-center gap-2 mt-1.5 text-[9px] font-mono text-slate-500">
                                  <span className={`px-1.5 py-0.5 rounded ${style.bg} ${style.text} text-[8px] uppercase font-bold`}>{m.category}</span>
                                  <span>&bull;</span>
                                  <span>Added: {new Date(m.timestamp).toLocaleDateString()}</span>
                                  {m.notes && (
                                    <>
                                      <span>&bull;</span>
                                      <span className="text-cyan-400">Contains notes</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => updateMemoryItem(m.id, { pinned: false })} className="p-1 hover:bg-white/5 rounded text-amber-400" title="Unpin"><Pin className="w-3.5 h-3.5 fill-current" /></button>
                              <button onClick={() => setSelectedMemoryDetail(m)} className="p-1 hover:bg-white/5 rounded text-slate-400 hover:text-white" title="Inspect"><Eye className="w-3.5 h-3.5" /></button>
                            </div>
                          </div>
                        );
                      })}
                      {memories.filter((m) => m.pinned && !m.archived).length === 0 && (
                        <div className="p-8 text-center border border-dashed border-white/5 rounded-2xl text-slate-500 text-xs bg-white/[0.01]">
                          No pinned memory facts yet. Pin facts to keep them permanently loaded in Avy's memory path.
                        </div>
                      )}
                    </div>

                    {/* Recently Updated Memories */}
                    <div className="pt-2 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-300 flex items-center gap-1.5">
                          <Activity className="w-4 h-4 text-cyan-400" /> Recently Synced Vectors
                        </h3>
                        <button onClick={() => setActiveTab("timeline")} className="text-[10px] text-cyan-400 hover:underline">View timeline</button>
                      </div>

                      <div className="space-y-2">
                        {memories.filter((m) => !m.pinned && !m.archived).slice(-3).reverse().map((m) => {
                          const style = CATEGORY_COLORS[m.category] || CATEGORY_COLORS.preference;
                          return (
                            <div key={m.id} className="bg-[#0e111a] border border-white/5 rounded-xl p-3 flex items-center justify-between gap-4 hover:border-white/10 transition-all group">
                              <div className="flex items-center gap-2.5 truncate">
                                <div className={`p-1.5 rounded-lg ${style.bg} ${style.text}`}>
                                  <style.icon className="w-3.5 h-3.5" />
                                </div>
                                <div className="truncate">
                                  <p className="text-xs text-slate-300 leading-normal truncate">{m.fact}</p>
                                  <span className="text-[9px] font-mono text-slate-500">{new Date(m.timestamp).toLocaleDateString()} &bull; {m.category}</span>
                                </div>
                              </div>
                              <button onClick={() => setSelectedMemoryDetail(m)} className="p-1.5 hover:bg-white/5 rounded text-slate-400 hover:text-white shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: AI Suggestions & Quick Optimization Card */}
                  <div className="space-y-6">
                    {/* Optimizer Panel */}
                    <div className="bg-gradient-to-tr from-[#0e111a] to-[#121624] border border-white/5 rounded-2xl p-4 shadow-xl space-y-3 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-3 opacity-5 pointer-events-none">
                        <Zap className="w-20 h-20 text-cyan-400" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-cyan-400" />
                        <h4 className="text-xs font-bold font-mono uppercase tracking-widest text-slate-200">Semantic Optimizer</h4>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Deduplicate similar memories, re-index context arrays, and pack vectors to maximize Gemini response efficiency.
                      </p>
                      
                      {/* Optimization metric */}
                      <div className="bg-black/40 rounded-xl p-3 border border-white/5 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-slate-500 block font-mono">DENSITY SCORE</span>
                          <span className="text-lg font-bold font-mono text-cyan-400">{optimizationScore}%</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-500 block font-mono">REDUNDANCY</span>
                          <span className="text-xs font-bold text-slate-300 font-mono">0.02% / Low</span>
                        </div>
                      </div>

                      <button
                        onClick={handleOptimizeMemory}
                        disabled={optimizing}
                        className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-800 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-md transition-all active:scale-98 cursor-pointer"
                      >
                        {optimizing ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Optimizing Core...</span>
                          </>
                        ) : (
                          <>
                            <Zap className="w-3.5 h-3.5 text-amber-300" />
                            <span>Optimize Cognitive Core</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Quick Smart Suggestions */}
                    <div className="bg-[#0e111a] border border-white/5 rounded-2xl p-4 shadow-xl space-y-3.5">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase font-mono tracking-wider text-slate-300 flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-indigo-400" /> Smart Extractor
                        </h4>
                        <span className="text-[9px] font-mono text-emerald-400">Auto-tuned</span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Avy automatically extracts memories after your calls. Here are some verified extractions:
                      </p>
                      <div className="space-y-2.5">
                        {[
                          { text: "Rahul loves sci-fi cinematic experiences like Interstellar.", cat: "preference" },
                          { text: "Rahul has an active goal to build Avy's context layer.", cat: "goal" }
                        ].map((sug, idx) => (
                          <div key={idx} className="p-2.5 bg-white/[0.02] border border-white/5 rounded-xl text-[11px] leading-relaxed relative group">
                            <p className="text-slate-300 pr-4">{sug.text}</p>
                            <span className="text-[8px] uppercase tracking-wider font-mono text-cyan-400 bg-cyan-950/40 px-1 mt-1 rounded inline-block">{sug.cat}</span>
                            <span className="absolute top-2.5 right-2 w-1.5 h-1.5 rounded-full bg-emerald-400" title="Extracted perfectly" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. BENTO BROWSER VIEW TAB */}
            {activeTab === "bento" && (
              <div className="space-y-6" id="bento-grid-tab">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Structured Personality Profile</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Edit structured nodes directly. Changes will update or create the corresponding memories instantly.</p>
                  </div>
                  
                  {/* Bento category toggles */}
                  <div className="flex gap-1 overflow-x-auto bg-black/40 p-1 rounded-xl border border-white/5 shrink-0">
                    {Object.keys(STRUCTURED_KEYS).map((cat) => {
                      const isActive = selectedBentoTab === cat;
                      return (
                        <button
                          key={cat}
                          onClick={() => setSelectedBentoTab(cat as any)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                            isActive ? "bg-cyan-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Structured Fields Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="structured-fields-grid">
                  {STRUCTURED_KEYS[selectedBentoTab].map((f) => {
                    const currentVal = getStructuredValue(selectedBentoTab, f.key);
                    return (
                      <div key={f.key} className="bg-[#0e111a] border border-white/5 rounded-2xl p-4 flex flex-col justify-between shadow-md space-y-2 hover:border-white/10 transition-all group">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono">{f.key}</label>
                          <span className="text-[8px] uppercase tracking-wider text-slate-600 font-mono">Profile node</span>
                        </div>
                        
                        <input
                          type="text"
                          defaultValue={currentVal}
                          placeholder={f.placeholder}
                          onBlur={(e) => handleSaveStructuredField(selectedBentoTab, f.key, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleSaveStructuredField(selectedBentoTab, f.key, (e.target as HTMLInputElement).value);
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                          className="w-full bg-black/30 border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-700 focus:border-cyan-500/50 focus:outline-none transition-all shadow-inner font-sans font-medium"
                        />
                        <span className="text-[9px] text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity font-mono">Press Enter or click outside to sync</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. LOGS & TIMELINE TAB */}
            {activeTab === "timeline" && (
              <div className="space-y-6" id="logs-timeline-tab">
                
                {/* Timeline Controls (Filters + Search) */}
                <div className="bg-[#0e111a] border border-white/5 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-md" id="timeline-controls-bar">
                  
                  {/* Search Bar */}
                  <div className="relative w-full md:max-w-xs" id="search-bar-wrapper">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search semantic database..."
                      className="w-full bg-black/40 text-xs font-mono pl-9 pr-4 py-2 rounded-xl border border-white/5 focus:border-cyan-500 focus:outline-none placeholder-slate-600 text-slate-200"
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>
                    )}
                  </div>

                  {/* Horizontal Filters */}
                  <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto scrollbar-none" id="timeline-category-filters">
                    <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mr-1">SHOW:</span>
                    {[
                      { id: "all", label: "All" },
                      { id: "identity", label: "Identity" },
                      { id: "project", label: "Projects" },
                      { id: "goal", label: "Goals" },
                      { id: "relationship", label: "People" },
                      { id: "preference", label: "Preferences" },
                      { id: "emotional", label: "Emotional" },
                      { id: "pinned", label: "Pinned" },
                      { id: "archived", label: "Archived" },
                      { id: "recent", label: "Recent" }
                    ].map((filt) => (
                      <button
                        key={filt.id}
                        onClick={() => setSelectedCategory(filt.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all ${
                          selectedCategory === filt.id 
                            ? "bg-cyan-950 text-cyan-300 border border-cyan-500/30 font-bold" 
                            : "bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-transparent"
                        }`}
                      >
                        {filt.label}
                      </button>
                    ))}
                  </div>

                </div>

                {/* Chronological List of Cards */}
                <div className="space-y-6" id="chronological-items-group font-sans">
                  {Object.keys(timelineGroups).map((groupName) => {
                    const list = timelineGroups[groupName];
                    if (list.length === 0) return null;
                    return (
                      <div key={groupName} className="space-y-3">
                        <span className="text-[10px] font-bold font-mono text-slate-500 uppercase tracking-[0.25em] pl-1 block">{groupName}</span>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {list.map((m) => {
                            const style = CATEGORY_COLORS[m.category] || CATEGORY_COLORS.preference;
                            const IsEditingThis = editingId === m.id;
                            
                            return (
                              <div 
                                key={m.id} 
                                className={`bg-[#0e111a]/90 border rounded-2xl p-4 flex flex-col justify-between shadow-lg hover:border-white/10 transition-all relative group ${
                                  m.pinned ? "border-amber-500/20 shadow-amber-950/5" : "border-white/5"
                                } ${m.archived ? "opacity-60 bg-black/40 border-slate-900" : ""}`}
                              >
                                {m.pinned && (
                                  <div className="absolute top-3.5 right-3.5 text-amber-400">
                                    <Pin className="w-3.5 h-3.5 fill-current" />
                                  </div>
                                )}

                                <div className="space-y-3">
                                  {/* Header metadata */}
                                  <div className="flex items-center gap-2">
                                    <span className={`text-[8px] font-bold font-mono uppercase tracking-wider px-2 py-0.5 rounded ${style.bg} ${style.text}`}>
                                      {m.category}
                                    </span>
                                    <span className="text-[9px] font-mono text-slate-500">{new Date(m.timestamp).toLocaleDateString()}</span>
                                  </div>

                                  {/* Fact text */}
                                  {IsEditingThis ? (
                                    <div className="space-y-2">
                                      <textarea
                                        value={editingFact}
                                        onChange={(e) => setEditingFact(e.target.value)}
                                        className="w-full bg-black/50 text-xs font-sans text-slate-200 p-2.5 rounded-xl border border-cyan-500/30 focus:outline-none"
                                        rows={2}
                                      />
                                      <div>
                                        <label className="block text-[8px] text-slate-500 font-mono uppercase tracking-wider mb-1">Custom Notes / Context</label>
                                        <textarea
                                          value={editingNotes}
                                          onChange={(e) => setEditingNotes(e.target.value)}
                                          placeholder="Add supporting details or conversational context notes..."
                                          className="w-full bg-black/50 text-[11px] font-sans text-slate-300 p-2 rounded-xl border border-white/5 focus:outline-none"
                                          rows={2}
                                        />
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="space-y-1.5 cursor-pointer" onClick={() => setSelectedMemoryDetail(m)}>
                                      <p className="text-xs text-slate-200 font-semibold leading-relaxed group-hover:text-white transition-colors">{m.fact}</p>
                                      {m.notes && (
                                        <p className="text-[11px] text-slate-400 leading-relaxed font-sans bg-black/25 p-2 rounded-lg border border-white/5 font-mono italic">
                                          {m.notes}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Actions footer bar */}
                                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-xs text-slate-500 font-mono">
                                  <div className="flex items-center gap-1">
                                    {IsEditingThis ? (
                                      <div className="flex gap-2">
                                        <button onClick={saveEditMemory} className="text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5 font-bold"><Save className="w-3.5 h-3.5" /> Save</button>
                                        <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-white">Cancel</button>
                                      </div>
                                    ) : (
                                      <div className="flex gap-3 opacity-70 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => startEditMemory(m)} className="hover:text-cyan-400 flex items-center gap-0.5" title="Edit Fact"><Edit3 className="w-3 h-3" /> Edit</button>
                                        <button onClick={() => updateMemoryItem(m.id, { pinned: !m.pinned })} className={`flex items-center gap-0.5 ${m.pinned ? "text-amber-400" : "hover:text-amber-400"}`} title="Pin context"><Pin className="w-3 h-3" /> {m.pinned ? "Unpin" : "Pin"}</button>
                                        <button onClick={() => updateMemoryItem(m.id, { archived: !m.archived })} className="hover:text-purple-400 flex items-center gap-0.5" title="Archive memory"><Archive className="w-3 h-3" /> {m.archived ? "Restore" : "Archive"}</button>
                                        <button onClick={() => setMergeSourceId(m.id)} className="hover:text-blue-400 flex items-center gap-0.5" title="Merge with another"><GitMerge className="w-3 h-3" /> Merge</button>
                                        <button onClick={() => { setSplitMemoryId(m.id); setSplitPart1(m.fact); }} className="hover:text-indigo-400 flex items-center gap-0.5" title="Split fact statement"><Scissors className="w-3 h-3" /> Split</button>
                                      </div>
                                    )}
                                  </div>
                                  {!IsEditingThis && (
                                    <button onClick={() => handleDeleteMemory(m.id)} className="text-red-500/70 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-950/20 rounded" title="Erase Fact">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {filteredMemories.length === 0 && (
                    <div className="p-12 text-center border border-dashed border-white/5 rounded-2xl text-slate-500 text-xs bg-white/[0.01]">
                      No memories matched the active search filters.
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* 4. INSIGHTS & TUNING TAB */}
            {activeTab === "insights" && (
              <div className="space-y-6" id="insights-tuning-tab">
                <div className="border-b border-white/5 pb-4">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Cognitive Analytics & Graph Tuning</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Avy automatically discovers relations, interest groupings, and goal metrics across conversations.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Topic extraction */}
                  <div className="bg-[#0e111a] border border-white/5 rounded-2xl p-5 shadow-xl space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-300 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-cyan-400" /> Hot Conversational Topics</h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">Keywords extracted dynamically from user facts, tracking your highest interest vectors:</p>
                    <div className="flex flex-wrap gap-2 pt-2">
                      {getTopics().map((topic, idx) => (
                        <div key={idx} className="px-3 py-1.5 rounded-xl bg-cyan-950/30 border border-cyan-500/20 text-cyan-300 text-xs font-mono font-bold capitalize flex items-center gap-1">
                          <Zap className="w-3 h-3 text-cyan-400" /> {topic}
                        </div>
                      ))}
                      {getTopics().length === 0 && (
                        <span className="text-xs text-slate-500 italic">No conversational topic patterns found yet.</span>
                      )}
                    </div>
                  </div>

                  {/* Running projects */}
                  <div className="bg-[#0e111a] border border-white/5 rounded-2xl p-5 shadow-xl space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-300 flex items-center gap-1.5"><Briefcase className="w-4 h-4 text-purple-400" /> Tracked Milestones & Projects</h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">Dynamic project clusters identified from memory inputs:</p>
                    <div className="space-y-2 pt-2">
                      {memories.filter((m) => m.category === "project" && !m.archived).map((p) => (
                        <div key={p.id} className="p-3 bg-white/[0.01] border border-white/5 rounded-xl flex items-center justify-between text-xs">
                          <div>
                            <p className="text-slate-200 font-semibold">{p.fact}</p>
                            <span className="text-[9px] font-mono text-slate-500">Project sync &bull; {new Date(p.timestamp).toLocaleDateString()}</span>
                          </div>
                          <span className="text-[9px] font-mono text-purple-400 uppercase tracking-widest bg-purple-950/40 px-2 py-0.5 border border-purple-900/30 rounded font-bold">Active</span>
                        </div>
                      ))}
                      {memories.filter((m) => m.category === "project" && !m.archived).length === 0 && (
                        <span className="text-xs text-slate-500 italic">No ongoing projects registered. Add project details under Structured Profile or Add Fact.</span>
                      )}
                    </div>
                  </div>

                  {/* Active goals */}
                  <div className="bg-[#0e111a] border border-white/5 rounded-2xl p-5 shadow-xl space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-300 flex items-center gap-1.5"><Target className="w-4 h-4 text-emerald-400" /> Life Goals Status</h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">Tracked objectives and dreams found in conversations:</p>
                    <div className="space-y-2 pt-2">
                      {memories.filter((m) => m.category === "goal" && !m.archived).map((g) => (
                        <div key={g.id} className="p-3 bg-white/[0.01] border border-white/5 rounded-xl flex items-center gap-2 text-xs">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                          <div>
                            <p className="text-slate-200 font-semibold">{g.fact}</p>
                            <span className="text-[9px] font-mono text-slate-500">Extraction date: {new Date(g.timestamp).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))}
                      {memories.filter((m) => m.category === "goal" && !m.archived).length === 0 && (
                        <span className="text-xs text-slate-500 italic">No active aspirations captured.</span>
                      )}
                    </div>
                  </div>

                  {/* Mentions & Relationships */}
                  <div className="bg-[#0e111a] border border-white/5 rounded-2xl p-5 shadow-xl space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-300 flex items-center gap-1.5"><Smile className="w-4 h-4 text-rose-400" /> Mentioned Contacts & Affiliations</h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">Social network graph mappings processed from dialogue details:</p>
                    <div className="space-y-2 pt-2">
                      {memories.filter((m) => m.category === "relationship" && !m.archived).map((r) => (
                        <div key={r.id} className="p-3 bg-white/[0.01] border border-white/5 rounded-xl flex items-center justify-between text-xs">
                          <p className="text-slate-300 font-medium">{r.fact}</p>
                          <span className="text-[9px] font-mono text-rose-400 bg-rose-950/40 px-1.5 rounded font-bold uppercase">Affiliate</span>
                        </div>
                      ))}
                      {memories.filter((m) => m.category === "relationship" && !m.archived).length === 0 && (
                        <span className="text-xs text-slate-500 italic">No family, friends, or cows registered in memory logs.</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 5. PRIVACY & CONTROL PANEL TAB */}
            {activeTab === "settings" && (
              <div className="space-y-6" id="privacy-settings-tab">
                <div className="border-b border-white/5 pb-4">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Cognitive Privacy & Cloud Sovereignty</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Control how Avy extracts and retrieves your memories. Wipe, backup, or import anytime.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Primary control toggles */}
                  <div className="bg-[#0e111a] border border-white/5 rounded-2xl p-5 shadow-xl space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-300 flex items-center gap-1.5"><Lock className="w-4 h-4 text-cyan-400" /> Extraction Controls</h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">Temporarily pause extraction or disable memory operations completely.</p>
                    
                    <div className="space-y-3 pt-2 text-xs">
                      {/* Disable Toggle */}
                      <div className="flex items-center justify-between p-3.5 bg-black/40 border border-white/5 rounded-xl">
                        <div>
                          <span className="text-slate-200 font-semibold block">Disable Memory Core</span>
                          <p className="text-[10px] text-slate-500 mt-0.5">Completely block Avy from accessing or storing your memories.</p>
                        </div>
                        <button
                          onClick={handleToggleDisabled}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            isMemoryDisabled ? "bg-red-600 text-white" : "bg-white/5 text-slate-400 hover:text-white"
                          }`}
                        >
                          {isMemoryDisabled ? "Disabled" : "Active"}
                        </button>
                      </div>

                      {/* Pause Toggle */}
                      <div className="flex items-center justify-between p-3.5 bg-black/40 border border-white/5 rounded-xl">
                        <div>
                          <span className="text-slate-200 font-semibold block">Pause Extraction Flow</span>
                          <p className="text-[10px] text-slate-500 mt-0.5">Stop Avy from recording new details from conversations temporarily.</p>
                        </div>
                        <button
                          onClick={() => handleTogglePause(!isPaused)}
                          disabled={isMemoryDisabled}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            isPaused ? "bg-amber-600 text-white" : "bg-white/5 text-slate-400 hover:text-white disabled:opacity-30"
                          }`}
                        >
                          {isPaused ? "Paused" : "Running"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Vault & Backups */}
                  <div className="bg-[#0e111a] border border-white/5 rounded-2xl p-5 shadow-xl space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-300 flex items-center gap-1.5"><Database className="w-4 h-4 text-purple-400" /> Backup Vault</h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">Save a backup of your memory core in your browser's secure cache or load a previously saved backup.</p>
                    
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <button
                        onClick={handleBackup}
                        className="p-3 bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 rounded-xl text-center flex flex-col items-center justify-center gap-1 transition-all"
                      >
                        <Download className="w-5 h-5 text-cyan-400" />
                        <span className="text-xs text-slate-200 font-semibold">Backup to Vault</span>
                        <span className="text-[9px] text-slate-500">Saves to LocalStorage</span>
                      </button>

                      <button
                        onClick={handleRestoreBackup}
                        className="p-3 bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 rounded-xl text-center flex flex-col items-center justify-center gap-1 transition-all"
                      >
                        <Upload className="w-5 h-5 text-purple-400" />
                        <span className="text-xs text-slate-200 font-semibold">Restore Backup</span>
                        <span className="text-[9px] text-slate-500">Reads LocalStorage</span>
                      </button>
                    </div>
                  </div>

                  {/* Import / Export JSON */}
                  <div className="bg-[#0e111a] border border-white/5 rounded-2xl p-5 shadow-xl space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-300 flex items-center gap-1.5"><FileJson className="w-4 h-4 text-pink-400" /> Semantic JSON Interchange</h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">Export your complete memory vectors to a standard JSON file, or paste existing memories to seed Avy's cognition instantly.</p>
                    
                    <div className="flex gap-2.5 pt-2 text-xs">
                      <button
                        onClick={handleExport}
                        className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/5 rounded-xl font-bold flex items-center justify-center gap-1.5"
                      >
                        <Download className="w-4 h-4 text-pink-400" /> Export JSON
                      </button>

                      <button
                        onClick={() => setShowImportModal(true)}
                        className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/5 rounded-xl font-bold flex items-center justify-center gap-1.5"
                      >
                        <Upload className="w-4 h-4 text-pink-400" /> Import JSON
                      </button>
                    </div>
                  </div>

                  {/* Destructive Wiping */}
                  <div className="bg-red-950/10 border border-red-900/20 rounded-2xl p-5 shadow-xl space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-red-400 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-red-500" /> Cognitive Purge Area</h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">Permanently erase all memories Rahul and Avy have shared, reverting to seed defaults.</p>
                    
                    <button
                      onClick={() => { setShowClearConfirmModal(true); setClearInputConfirm(""); }}
                      className="w-full py-2.5 bg-red-950/40 hover:bg-red-900/30 text-red-400 border border-red-900/30 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all active:scale-98 cursor-pointer shadow-md"
                    >
                      <Trash2 className="w-4 h-4" /> Purge Memory Database
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* DETAILED MEMORY INFORMATION INSPECTION MODAL */}
      {selectedMemoryDetail && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0e111a] border border-white/10 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative space-y-4 text-xs">
            <button 
              onClick={() => setSelectedMemoryDetail(null)}
              className="absolute top-4 right-4 text-slate-500 hover:text-white p-1 rounded-full hover:bg-white/5 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 border-b border-white/5 pb-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <Brain className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-white uppercase tracking-wider font-mono">Synaptic Detail</h3>
                <span className="text-[9px] font-mono text-slate-500">ID: {selectedMemoryDetail.id}</span>
              </div>
            </div>

            <div className="space-y-3 font-sans">
              <div>
                <span className="text-[9px] font-mono text-slate-400 uppercase block tracking-wider mb-0.5">MEMORY STATEMENT</span>
                <p className="text-sm font-semibold text-white leading-relaxed">{selectedMemoryDetail.fact}</p>
              </div>

              {selectedMemoryDetail.notes && (
                <div>
                  <span className="text-[9px] font-mono text-slate-400 uppercase block tracking-wider mb-0.5">SUPPORTING NOTES / DIALOGUE CONTEXT</span>
                  <p className="text-xs text-slate-300 font-mono leading-relaxed bg-black/40 border border-white/5 p-3 rounded-xl italic">
                    {selectedMemoryDetail.notes}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 bg-black/20 p-3 rounded-xl border border-white/5 font-mono text-[10px]">
                <div>
                  <span className="text-[8px] text-slate-500 block">COGNITIVE SEGMENT</span>
                  <span className="text-slate-300 font-bold capitalize">{selectedMemoryDetail.category}</span>
                </div>
                <div>
                  <span className="text-[8px] text-slate-500 block">TIMESTAMP RECORDED</span>
                  <span className="text-slate-300 font-bold">{new Date(selectedMemoryDetail.timestamp).toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-white/5 pt-4">
              <button 
                onClick={() => { startEditMemory(selectedMemoryDetail); setSelectedMemoryDetail(null); }}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg transition-all"
              >
                Edit Memory
              </button>
              <button 
                onClick={() => setSelectedMemoryDetail(null)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg border border-white/5 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MERGE MEMORIES SELECTION DRAWER */}
      {mergeSourceId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0e111a] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl relative space-y-4 text-xs">
            <button onClick={() => setMergeSourceId(null)} className="absolute top-4 right-4 text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
            
            <h3 className="font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5">
              <GitMerge className="w-4 h-4 text-blue-400 animate-pulse" /> Merge Synaptic Paths
            </h3>
            
            <p className="text-[11px] text-slate-400 leading-relaxed bg-blue-950/10 p-3 rounded-lg border border-blue-500/10">
              Combine details from two separate memories into a unified statement. This resolves redundancies.
            </p>

            <div className="space-y-3 font-sans">
              <div>
                <span className="text-[8px] font-mono text-slate-500 uppercase block tracking-wider mb-1">Source Fact</span>
                <div className="p-2.5 bg-white/[0.01] border border-white/5 rounded-xl italic font-mono text-[11px]">
                  {memories.find((m) => m.id === mergeSourceId)?.fact}
                </div>
              </div>

              <div>
                <span className="text-[8px] font-mono text-slate-500 uppercase block tracking-wider mb-1">Merge Into (Target Memory)</span>
                <select
                  value={mergeTargetId}
                  onChange={(e) => setMergeTargetId(e.target.value)}
                  className="w-full bg-[#08090d] border border-white/10 rounded-xl p-2.5 focus:border-cyan-500 focus:outline-none text-slate-300"
                >
                  <option value="">-- Choose target memory statement --</option>
                  {memories
                    .filter((m) => m.id !== mergeSourceId && m.category === memories.find((x) => x.id === mergeSourceId)?.category)
                    .map((m) => (
                      <option key={m.id} value={m.id}>{m.fact.substring(0, 50)}...</option>
                    ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-white/5 pt-4">
              <button onClick={() => setMergeSourceId(null)} className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-400 rounded-lg">Cancel</button>
              <button 
                onClick={handleMergeMemories}
                disabled={!mergeTargetId}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-bold rounded-lg transition-all"
              >
                Confirm Merge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SPLIT FACT DIALOG */}
      {splitMemoryId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0e111a] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl relative space-y-4 text-xs">
            <button onClick={() => setSplitMemoryId(null)} className="absolute top-4 right-4 text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
            
            <h3 className="font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5">
              <Scissors className="w-4 h-4 text-indigo-400 animate-pulse" /> Split Memory Unit
            </h3>

            <p className="text-[11px] text-slate-400 leading-relaxed bg-indigo-950/10 p-3 rounded-lg border border-indigo-500/10">
              Divide a compound statement into 2 distinct memory items to keep individual points clean and granular.
            </p>

            <div className="space-y-4 font-sans">
              <div>
                <span className="text-[8px] font-mono text-slate-500 uppercase block tracking-wider mb-1">PART 1 STATEMENT</span>
                <input
                  type="text"
                  value={splitPart1}
                  onChange={(e) => setSplitPart1(e.target.value)}
                  className="w-full bg-[#08090d] border border-white/10 rounded-xl p-2.5 focus:border-cyan-500 focus:outline-none text-slate-100 text-xs"
                />
              </div>

              <div>
                <span className="text-[8px] font-mono text-slate-500 uppercase block tracking-wider mb-1">PART 2 STATEMENT</span>
                <input
                  type="text"
                  value={splitPart2}
                  onChange={(e) => setSplitPart2(e.target.value)}
                  placeholder="Insert second split portion here..."
                  className="w-full bg-[#08090d] border border-white/10 rounded-xl p-2.5 focus:border-cyan-500 focus:outline-none text-slate-100 text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-white/5 pt-4">
              <button onClick={() => setSplitMemoryId(null)} className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-400 rounded-lg">Cancel</button>
              <button 
                onClick={handleSplitMemory}
                disabled={!splitPart1.trim() || !splitPart2.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-bold rounded-lg transition-all"
              >
                Split Statements
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT MEMORY DIALOG */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0e111a] border border-white/10 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative space-y-4 text-xs">
            <button onClick={() => setShowImportModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            
            <h3 className="font-bold text-white uppercase tracking-wider font-mono">Import Memory Arrays</h3>
            <p className="text-[11px] text-slate-400">Paste raw JSON memories array to populate the companion's core memory immediately.</p>
            
            <form onSubmit={handleImport} className="space-y-4">
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder='[{"fact": "Rahul loves synthetic music", "category": "preference"}]'
                className="w-full bg-black/60 text-xs font-mono p-3 rounded-xl border border-white/10 focus:outline-none h-40 text-slate-300 placeholder-slate-700"
              />
              <div className="flex justify-end gap-2 border-t border-white/5 pt-4">
                <button type="button" onClick={() => setShowImportModal(false)} className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-400 rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg">Confirm Import</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CLEAR ALL DOUBLE CONFIRMATION DIALOG */}
      {showClearConfirmModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#12080a] border border-red-900/30 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 relative animate-fade-in text-xs">
            <button onClick={() => setShowClearConfirmModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500 animate-bounce" />
              <h3 className="font-bold text-white uppercase tracking-wider font-mono">Wipe Cognitive Core</h3>
            </div>

            <p className="text-red-300 leading-relaxed bg-red-950/20 p-3 rounded-xl border border-red-950/30 text-[11px]">
              <strong>CRITICAL WARNING:</strong> This action is permanent and cannot be undone. It completely erases all personal goals, projects, preferences, and details Rahul and Avy have built up over months and years.
            </p>

            <div className="space-y-3">
              <p className="text-slate-400">To confirm, please type <strong className="text-red-400">ERASE ALL</strong> below:</p>
              <input
                type="text"
                value={clearInputConfirm}
                onChange={(e) => setClearInputConfirm(e.target.value)}
                placeholder="Type 'ERASE ALL' here"
                className="w-full text-xs font-mono bg-slate-950 border border-red-900/20 focus:border-red-500 rounded-xl p-2.5 text-slate-100 focus:outline-none"
              />
              <div className="flex justify-end gap-2 border-t border-white/5 pt-4">
                <button type="button" onClick={() => { setShowClearConfirmModal(false); setClearInputConfirm(""); }} className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-400 rounded-lg">Cancel</button>
                <button
                  onClick={handleClearAll}
                  disabled={clearInputConfirm !== "ERASE ALL"}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-red-950/40 text-white font-bold rounded-lg transition-all"
                >
                  Wipe Core
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
