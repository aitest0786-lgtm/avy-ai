import { IModule } from '../Core/IModule';
import { logger } from '../../main/agent/core/Logger';
import { setupVoiceServer } from '../../../voice/speechRecognition/voiceServer';

export class VoiceModule implements IModule {
  public readonly name = 'Voice';

  public async initialize(): Promise<boolean> {
    try {
      logger.info('Initializing Voice Module...');
      // Currently, setupVoiceServer handles Express, WebSockets, and Gemini Live
      await setupVoiceServer();
      logger.info('Voice Module initialized successfully.');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Voice Module', error);
      return false;
    }
  }

  public async shutdown(): Promise<void> {
    logger.info('Shutting down Voice Module...');
    // Add logic to cleanly shut down the server when extracted
  }

  public status(): any {
    return { status: 'OK' };
  }
}

export const voiceModule = new VoiceModule();
