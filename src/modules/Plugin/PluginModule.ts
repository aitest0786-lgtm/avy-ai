import { IModule } from '../Core/IModule';
import { logger } from '../../main/agent/core/Logger';

export class PluginModule implements IModule {
  public readonly name = 'Plugins';

  public async initialize(): Promise<boolean> {
    try {
      logger.info('Initializing Plugin Module...');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Plugin Module', error);
      return false;
    }
  }

  public async shutdown(): Promise<void> {
    logger.info('Shutting down Plugin Module...');
  }

  public status(): any {
    return { status: 'OK' };
  }
}

export const pluginModule = new PluginModule();
