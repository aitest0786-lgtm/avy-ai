import { IModule } from './IModule';
import { logger } from '../../../src/main/agent/core/Logger';

export class StartupManager {
  private modules: Map<string, IModule> = new Map();
  private initializationOrder: string[] = [
    'Configuration',
    'Logger',
    'Backend',
    'IPC',
    'Voice',
    'AI',
    'DesktopAutomation',
    'Vision',
    'Memory',
    'Planner'
  ];

  public registerModule(module: IModule) {
    this.modules.set(module.name, module);
  }

  public async initializeAll(): Promise<boolean> {
    logger.info('Starting AVY Initialization Sequence...');
    let overallSuccess = true;

    for (const moduleName of this.initializationOrder) {
      const module = this.modules.get(moduleName);
      if (!module) {
        logger.warn(`Module [${moduleName}] is registered in initialization order but was not provided.`);
        continue;
      }

      try {
        logger.info(`Initializing Module: ${moduleName}...`);
        const startTime = Date.now();
        const success = await module.initialize();
        const duration = Date.now() - startTime;
        
        if (success) {
          logger.info(`Module [${moduleName}] initialized successfully in ${duration}ms.`);
        } else {
          logger.warn(`Module [${moduleName}] failed to initialize but reported non-critical failure.`);
          overallSuccess = false;
        }
      } catch (error) {
        logger.error(`CRITICAL: Module [${moduleName}] threw an error during initialization.`, error);
        overallSuccess = false;
        // Continue where possible, never crash the application as per requirements.
      }
    }

    logger.info(`AVY Initialization Sequence Complete. Overall Status: ${overallSuccess ? 'SUCCESS' : 'WARNING/ERRORS'}`);
    return overallSuccess;
  }

  public async shutdownAll(): Promise<void> {
    logger.info('Starting AVY Shutdown Sequence...');
    // Shutdown in reverse order
    const reverseOrder = [...this.initializationOrder].reverse();
    
    for (const moduleName of reverseOrder) {
      const module = this.modules.get(moduleName);
      if (module) {
        try {
          await module.shutdown();
          logger.info(`Module [${moduleName}] shut down successfully.`);
        } catch (error) {
          logger.error(`Error shutting down Module [${moduleName}].`, error);
        }
      }
    }
  }

  public getStatusReport(): Record<string, any> {
    const report: Record<string, any> = {};
    for (const [name, module] of this.modules.entries()) {
      try {
        report[name] = module.status();
      } catch (e) {
        report[name] = { error: 'Failed to get status' };
      }
    }
    return report;
  }

  public getModuleStatus(moduleName: string): any {
    const module = this.modules.get(moduleName);
    if (!module) {
      return { error: `Module [${moduleName}] not found` };
    }
    try {
      return module.status();
    } catch (e) {
      return { error: 'Failed to get status' };
    }
  }
}

export const startupManager = new StartupManager();
