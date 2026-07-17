import { logger } from './Logger';
import { TaskStep, TaskPlanner } from '../../../../ai/planner/TaskPlanner';

export class SafetyManager {
  private dangerousKeywords = [
    'rm', 'del', 'format', 'drop', 'delete', 'overwrite', 
    'sudo', 'chmod', 'chown', 'kill', 'shutdown', 'reboot'
  ];

  public isDangerousAction(step: TaskStep): boolean {
    if (step.actionType === 'terminal_command' && step.payload) {
      const command = (step.payload.command || '').toLowerCase();
      return this.dangerousKeywords.some(keyword => command.includes(keyword));
    }
    
    if (step.actionType === 'file_delete' || step.actionType === 'file_overwrite') {
      return true;
    }

    if (step.actionType === 'change_setting') {
      return true;
    }

    // New check for keyboard shortcuts that destroy data (like hitting DELETE in Explorer)
    if (step.actionType === 'shortcut' || step.actionType === 'type') {
      const payloadKey = (step.payload?.key || step.payload?.text || '').toLowerCase();
      if (payloadKey === 'delete' || payloadKey === 'backspace') {
         // Could check active window to see if it's Explorer vs Editor, but for now we flag it if explicitly a step
         if (step.targetApp?.toLowerCase().includes('explorer')) {
            return true;
         }
      }
    }

    return false;
  }

  public async requestConfirmation(step: TaskStep): Promise<boolean> {
    logger.warn(`Action requires user confirmation: ${step.description}`, { type: step.actionType });
    // In a real app, this would emit an IPC event to the renderer and wait for a response.
    return new Promise(resolve => {
      // TODO: Wire this up to actual Electron IPC.
      logger.info('Simulating user confirmation for dangerous action.');
      setTimeout(() => resolve(true), 1000); 
    });
  }
}
