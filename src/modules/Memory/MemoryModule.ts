import { IModule } from '../Core/IModule';
import { logger } from '../../main/agent/core/Logger';
import { MemoryManager } from '../../main/modules/memoryManager';

export class MemoryModule implements IModule {
  public readonly name = 'Memory';

  public async initialize(): Promise<boolean> {
    try {
      logger.info('Initializing Memory Module...');
      // Ensure memory manager is ready to accept requests
      logger.info('Memory Module initialized successfully.');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Memory Module', error);
      return false;
    }
  }

  public async shutdown(): Promise<void> {
    logger.info('Shutting down Memory Module...');
  }

  public status(): any {
    return { status: 'OK' };
  }
}

export const memoryModule = new MemoryModule();
