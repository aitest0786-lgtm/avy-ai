import { IModule } from '../Core/IModule';
import { logger } from '../../main/agent/core/Logger';
import { setupDesktopControl } from '../../main/modules/desktopControl';

export class DesktopModule implements IModule {
  public readonly name = 'DesktopAutomation';

  public async initialize(): Promise<boolean> {
    try {
      logger.info('Initializing Desktop Automation Module...');
      setupDesktopControl();
      logger.info('Desktop Automation Module initialized successfully.');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Desktop Automation Module', error);
      return false;
    }
  }

  public async shutdown(): Promise<void> {
    logger.info('Shutting down Desktop Automation Module...');
  }

  public status(): any {
    return { status: 'OK' };
  }
}

export const desktopModule = new DesktopModule();
