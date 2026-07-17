import { logger } from '../core/Logger';
import { LongTermMemory } from './LongTermMemory';

export interface ConversationState {
  isActive: boolean;
  isListening: boolean;
  isSpeaking: boolean;
}

export class ConversationManager {
  private state: ConversationState = {
    isActive: false,
    isListening: false,
    isSpeaking: false,
  };
  private memory: LongTermMemory;
  
  constructor() {
    this.memory = new LongTermMemory();
  }

  public getMemory(): LongTermMemory {
    return this.memory;
  }

  public startListening() {
    this.state.isListening = true;
    logger.info("ConversationManager: Started listening to user.");
    // In a real implementation, we would activate the mic or speech recognition engine here.
  }

  public stopListening() {
    this.state.isListening = false;
    logger.info("ConversationManager: Stopped listening to user.");
  }

  public async speak(text: string) {
    if (this.state.isSpeaking) {
       logger.warn("ConversationManager: Already speaking. Queuing or interrupting...");
       // Logic to stop current speech if interrupted
       this.stopSpeaking();
    }
    
    this.state.isSpeaking = true;
    logger.info(`ConversationManager: Speaking -> "${text}"`);
    
    // Simulate speech duration based on text length
    const speechSpeed = parseFloat(this.memory.getPreference('speechSpeed') || '50');
    const speechDuration = text.length * speechSpeed; 
    
    return new Promise(resolve => {
       setTimeout(() => {
          this.state.isSpeaking = false;
          logger.info("ConversationManager: Finished speaking.");
          resolve(true);
       }, speechDuration);
    });
  }

  public stopSpeaking() {
    if (this.state.isSpeaking) {
       this.state.isSpeaking = false;
       logger.info("ConversationManager: Speech interrupted/stopped.");
       // Logic to send abort signal to TTS engine
    }
  }

  public onUserInterrupt() {
    logger.info("ConversationManager: User interrupted.");
    this.stopSpeaking();
    this.startListening();
  }
}
