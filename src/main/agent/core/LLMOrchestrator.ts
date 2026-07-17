import { logger } from './Logger';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface CacheEntry {
  response: string;
  timestamp: number;
}

export class LLMOrchestrator {
  private static instance: LLMOrchestrator | null = null;
  private geminiClient: GoogleGenAI | null = null;
  
  // Cache for LLM responses
  private cache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache TTL

  private constructor() {
    this.initClients();
  }

  public static getInstance(): LLMOrchestrator {
    if (!LLMOrchestrator.instance) {
      LLMOrchestrator.instance = new LLMOrchestrator();
    }
    return LLMOrchestrator.instance;
  }

  private initClients() {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      this.geminiClient = new GoogleGenAI({ apiKey: geminiKey });
      logger.info("LLMOrchestrator: Gemini Client initialized successfully.");
    } else {
      logger.warn("LLMOrchestrator: GEMINI_API_KEY is not defined in environment variables.");
    }

    const openAIKey = process.env.OPENAI_API_KEY;
    if (openAIKey) {
      logger.info("LLMOrchestrator: OpenAI API configuration detected.");
    } else {
      logger.info("LLMOrchestrator: No OpenAI API key configured. Will use Gemini Pro as fallback for reasoning tasks.");
    }
  }

  /**
   * Generates a cache key based on model and message payload.
   */
  private generateCacheKey(model: string, systemInstruction: string, messages: ChatMessage[]): string {
    const serialized = JSON.stringify({ model, systemInstruction, messages });
    // Simple fast hashing function for key string
    let hash = 0;
    for (let i = 0; i < serialized.length; i++) {
      const char = serialized.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return `${model}_${hash}`;
  }

  /**
   * Retrieves a cached response if valid, otherwise returns null.
   */
  private getCachedResponse(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }
    
    logger.info(`LLMOrchestrator: Cache HIT for key: ${key}`);
    return entry.response;
  }

  /**
   * Caches a response.
   */
  private setCachedResponse(key: string, response: string) {
    this.cache.set(key, {
      response,
      timestamp: Date.now()
    });
  }

  /**
   * Main routing entry point. Automatically routes requests to OpenAI (or fallback Gemini Pro)
   * for reasoning/planning, or Gemini Flash for low-latency conversational queries.
   */
  public async generateText(
    prompt: string, 
    taskType: 'conversational' | 'planning' | 'coding' | 'general' = 'general',
    systemInstruction = ""
  ): Promise<string> {
    const isReasoning = taskType === 'planning' || taskType === 'coding';
    const openaiKey = process.env.OPENAI_API_KEY;

    if (isReasoning && openaiKey) {
      // Route reasoning tasks to OpenAI (gpt-4o or o3-mini)
      const model = "gpt-4o"; // Or o3-mini/o1
      const messages: ChatMessage[] = [];
      if (systemInstruction) {
        messages.push({ role: 'system', content: systemInstruction });
      }
      messages.push({ role: 'user', content: prompt });
      
      return this.generateOpenAIResponse(model, messages, systemInstruction);
    } else {
      // Conversational or fallback to Gemini Pro/Flash
      const model = isReasoning ? "gemini-2.5-pro" : "gemini-2.5-flash";
      const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
      
      return this.generateGeminiResponse(model, messages, systemInstruction);
    }
  }

  /**
   * Directly call OpenAI REST API using native fetch
   */
  public async generateOpenAIResponse(
    model: string,
    messages: ChatMessage[],
    systemInstruction = ""
  ): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OpenAI API Key is missing.");
    }

    const cacheKey = this.generateCacheKey(model, systemInstruction, messages);
    const cached = this.getCachedResponse(cacheKey);
    if (cached) return cached;

    logger.info(`LLMOrchestrator: Routing reasoning task to OpenAI model '${model}'`);
    
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          temperature: 0.2 // Lower temperature for structured planning/coding tasks
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API error: ${response.statusText}. ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      const result = data.choices?.[0]?.message?.content || "";
      
      if (result) {
        this.setCachedResponse(cacheKey, result);
      }
      return result;
    } catch (err: any) {
      logger.error(`LLMOrchestrator: OpenAI generation failed: ${err.message}. Falling back to Gemini.`);
      // Fallback to Gemini
      return this.generateGeminiResponse("gemini-2.5-pro", messages, systemInstruction);
    }
  }

  /**
   * Directly call Gemini API using the @google/genai SDK
   */
  public async generateGeminiResponse(
    model: string,
    messages: ChatMessage[],
    systemInstruction = ""
  ): Promise<string> {
    if (!this.geminiClient) {
      throw new Error("Gemini client is not initialized.");
    }

    const cacheKey = this.generateCacheKey(model, systemInstruction, messages);
    const cached = this.getCachedResponse(cacheKey);
    if (cached) return cached;

    logger.info(`LLMOrchestrator: Routing task to Gemini model '${model}'`);

    try {
      const formattedContent = messages.map(m => m.content).join("\n");
      const response = await this.geminiClient.models.generateContent({
        model: model,
        contents: formattedContent,
        config: {
          systemInstruction: systemInstruction || undefined,
          temperature: model.includes("pro") ? 0.2 : 0.7
        }
      });

      const result = response.text || "";
      if (result) {
        this.setCachedResponse(cacheKey, result);
      }
      return result;
    } catch (err: any) {
      logger.error(`LLMOrchestrator: Gemini generation failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Executes multiple independent tasks in parallel
   */
  public async executeParallel<T>(tasks: Promise<T>[]): Promise<T[]> {
    logger.info(`LLMOrchestrator: Executing ${tasks.length} independent tasks in parallel.`);
    return Promise.all(tasks);
  }
}
