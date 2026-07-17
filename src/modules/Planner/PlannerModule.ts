import { IModule } from '../Core/IModule';
import { logger } from '../../main/agent/core/Logger';
import { TaskPlanner } from '../../../ai/planner/TaskPlanner';

export class PlannerModule implements IModule {
  public readonly name = 'Planner';
  public planner: TaskPlanner | null = null;

  public async initialize(): Promise<boolean> {
    try {
      logger.info('Initializing Planner Module...');
      this.planner = new TaskPlanner();
      logger.info('Planner Module initialized successfully.');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Planner Module', error);
      return false;
    }
  }

  public async shutdown(): Promise<void> {
    logger.info('Shutting down Planner Module...');
    this.planner = null;
  }

  public status(): any {
    return { status: 'OK' };
  }
}

export const plannerModule = new PlannerModule();
