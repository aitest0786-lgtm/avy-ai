import { IModule } from './IModule';
import { logger } from '../../main/agent/core/Logger';

export class LoggerModule implements IModule {
  public readonly name = 'Logger';

  public async initialize(): Promise<boolean> {
    try {
      logger.info('Initializing Logger Module...');
      // Ensure the logger can write properly or hook up streams if needed
      logger.info('Logger Module initialized successfully.');
      return true;
    } catch (error) {
      console.error('Failed to initialize Logger Module', error);
      return false; // Logger failure shouldn't crash the app
    }
  }

  public async shutdown(): Promise<void> {
    logger.info('Shutting down Logger Module...');
    // Flush logs, clear intervals if any
  }

  public status(): any {
    return {
      status: 'OK',
      backend: 'Console'
    };
  }
}

export const loggerModule = new LoggerModule();
