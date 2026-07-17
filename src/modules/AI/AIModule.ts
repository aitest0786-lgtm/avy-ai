import { IModule } from '../Core/IModule';
import { logger } from '../../main/agent/core/Logger';
import { DecisionLoop } from '../../main/agent/core/DecisionLoop';

export class AIModule implements IModule {
  public readonly name = 'AI';
  public decisionLoop: DecisionLoop | null = null;

  public async initialize(): Promise<boolean> {
    try {
      logger.info('Initializing AI Module (DecisionLoop & VerificationEngine)...');
      this.decisionLoop = new DecisionLoop();
      logger.info('AI Module initialized successfully.');
      return true;
    } catch (error) {
      logger.error('Failed to initialize AI Module', error);
      return false;
    }
  }

  public async shutdown(): Promise<void> {
    logger.info('Shutting down AI Module...');
    this.decisionLoop = null;
  }

  public status(): any {
    return { status: 'OK' };
  }
}

export const aiModule = new AIModule();
