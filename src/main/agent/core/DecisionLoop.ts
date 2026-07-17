import { logger } from './Logger';
import { TaskStep } from '../../../../ai/planner/TaskPlanner';
import { TaskManager, Task, CancellationError } from '../../../../ai/taskScheduler/TaskManager';
import { SafetyManager } from './SafetyManager';
import { ErrorRecovery } from '../../../../ai/recoveryEngine/ErrorRecovery';
import { ScreenPerception } from '../../../../vision/screenReader/ScreenPerception';
import { ActionEngine } from '../actions/ActionEngine';
import { VerificationEngine } from '../../../../ai/verificationEngine/VerificationEngine';
import { ChromeController } from '../../../../desktop/browserController/ChromeController';
import { VSCodeController } from '../../../../desktop/applicationManager/VSCodeController';
import { WhatsAppController } from '../../../../desktop/applicationManager/WhatsAppController';
import { ExplorerController } from '../../../../desktop/applicationManager/ExplorerController';
import { TerminalController } from '../../../../desktop/applicationManager/TerminalController';
import { NotepadController } from '../../../../desktop/applicationManager/NotepadController';
import { CalculatorController } from '../../../../desktop/applicationManager/CalculatorController';
import { YouTubeController } from '../../../../desktop/browserController/YouTubeController';

export class DecisionLoop {
  private taskManager: TaskManager;
  private safetyManager: SafetyManager;
  private errorRecovery: ErrorRecovery;
  public perception: ScreenPerception;
  private isRunning: boolean = false;
  private MAX_RETRIES = 3;

  public actions: ActionEngine;
  public verifier: VerificationEngine;
  
  public chromeController: ChromeController;
  public vscodeController: VSCodeController;
  public whatsappController: WhatsAppController;
  public explorerController: ExplorerController;
  public terminalController: TerminalController;
  public notepadController: NotepadController;
  public calculatorController: CalculatorController;
  public youtubeController: YouTubeController;

  constructor() {
    this.taskManager = TaskManager.getInstance();
    this.safetyManager = new SafetyManager();
    this.perception = new ScreenPerception();
    this.verifier = new VerificationEngine(this.perception);
    
    // Wire up verification callbacks to KeyboardEngine via ActionEngine
    const verifyFocusBind = () => this.verifier.verifyFocus();
    const getActiveWindowBind = () => this.perception.getActiveWindow();
    
    this.actions = new ActionEngine(verifyFocusBind, getActiveWindowBind);
    this.errorRecovery = new ErrorRecovery(this.taskManager, this.perception); 
    
    // Instantiate controllers
    this.chromeController = new ChromeController(this.actions, this.perception, this.verifier);
    this.vscodeController = new VSCodeController(this.actions, this.perception, this.verifier);
    this.whatsappController = new WhatsAppController(this.actions, this.perception, this.verifier);
    this.explorerController = new ExplorerController(this.actions, this.perception, this.verifier);
    this.terminalController = new TerminalController(this.actions, this.perception, this.verifier);
    this.notepadController = new NotepadController(this.actions, this.perception, this.verifier);
    this.calculatorController = new CalculatorController(this.actions, this.perception, this.verifier);
    this.youtubeController = new YouTubeController(this.actions, this.perception, this.verifier);
  }

  public async executeTask(userRequest: string, initialSteps: TaskStep[]) {
    // 1. PLAN
    logger.info("PLAN: Formulating task execution steps.");
    const taskId = this.taskManager.addTask({
       id: `task_${Date.now()}`,
       name: userRequest,
       steps: initialSteps,
       priority: 'normal',
       dependencies: []
    });
    
    if (!this.isRunning) {
       this.isRunning = true;
       this.runLoop();
    }
  }

  private async runLoop() {
    while (this.isRunning) {
      const activeTask = this.taskManager.getNextExecutableTask();
      
      if (!activeTask) {
          await this.wait(1000);
          continue;
      }

      const step = this.taskManager.getNextStepForTask(activeTask.id);
      if (!step) {
          await this.wait(1000);
          continue;
      }

      // SAFETY CHECK
      if (this.safetyManager.isDangerousAction(step)) {
          const confirmed = await this.safetyManager.requestConfirmation(step);
          if (!confirmed) {
             logger.error(`Task aborted: User denied dangerous action on step: ${step.description}`);
             this.taskManager.markTaskFailed(activeTask.id, new Error("User denied confirmation"));
             continue;
          }
      }

      let success = false;
      let attempts = 0;
      let actionStartTime = 0;
      let cancelled = false;

      while (!success && attempts < this.MAX_RETRIES) {
        attempts++;
        try {
          // Check cancellation before starting attempt
          if (this.taskManager.isCancelled(activeTask.id)) {
            throw new CancellationError();
          }

          logger.action(`Executing step: ${step.description} (Attempt ${attempts})`);
          actionStartTime = Date.now();
          
          // 2. OBSERVE
          logger.info("OBSERVE: Checking current screen/system state before acting.");
          await this.observeState();

          // 3. ACT
          logger.info("ACT: Executing the step.");
          await this.actOnStep(step);

          // 4. VERIFY
          logger.info("VERIFY: Checking if the action was successful.");
          success = await this.verifyOutcome(step);

          const duration = Date.now() - actionStartTime;
          logger.timing(`Step: ${step.description}`, duration);

          if (success) {
            logger.verify(step.description, true);
            this.taskManager.markTaskStepCompleted(activeTask.id);
          } else {
            logger.verify(step.description, false, "Verification failed");
            
            // 5. IF FAILED -> RECOVER
            if (attempts >= this.MAX_RETRIES) {
              logger.error(`Task step failed after max retries: ${step.description}`);
              const aborted = await this.errorRecovery.handleFailure(step, new Error("Verification failed max retries"), activeTask.id);
              if (aborted) {
                 break; // Abort Task
              }
            } else {
              logger.retry(step.description, attempts + 1, this.MAX_RETRIES);
              await this.errorRecovery.attemptInlineRecovery(step);
              await this.wait(2000); // Wait before retry -> CONTINUE
            }
          }
        } catch (error) {
          if (error instanceof CancellationError || this.taskManager.isCancelled(activeTask.id)) {
            logger.warn(`Task execution halted due to cancellation: ${activeTask.name}`);
            this.taskManager.markTaskCancelled(activeTask.id);
            cancelled = true;
            break; // Break attempts loop
          }

          logger.error(`Error executing step ${step.description}`, error);
          if (attempts >= this.MAX_RETRIES) {
             const aborted = await this.errorRecovery.handleFailure(step, error, activeTask.id);
             if (aborted) break;
          } else {
             logger.retry(step.description, attempts + 1, this.MAX_RETRIES);
             await this.errorRecovery.attemptInlineRecovery(step);
             await this.wait(2000);
          }
        }
      }

      if (cancelled) {
        // Skip further processing for this cancelled task
        continue;
      }
    }
  }

  private async observeState() {
    await this.perception.captureScreen();
  }

  private async actOnStep(step: TaskStep) {
    const { actionType, payload, targetApp } = step;
    logger.info(`ActOnStep: routing action type '${actionType}' for target '${targetApp}'`);
    
    switch (actionType) {
      case 'open_app':
        await this.handleOpenApp(targetApp);
        break;
      case 'click':
        if (payload?.elementName) {
          const controller = this.getControllerForApp(targetApp);
          if (controller && 'clickElement' in controller) {
            await (controller as any).clickElement(payload.elementName);
          } else {
            const coords = await this.perception.findElementCoordinates(payload.elementName);
            if (coords) {
              await this.actions.moveMouseSmooth(coords.x, coords.y);
              await this.actions.click(payload.clickButton || 'left', payload.doubleClick || false);
            }
          }
        } else if (payload?.x !== undefined && payload?.y !== undefined) {
          const robot = require('robotjs');
          const screenSize = robot.getScreenSize();
          const targetX = Math.round((payload.x / 100) * screenSize.width);
          const targetY = Math.round((payload.y / 100) * screenSize.height);
          await this.actions.moveMouseSmooth(targetX, targetY);
          await this.actions.click(payload.clickButton || 'left', payload.doubleClick || false);
        }
        break;
      case 'type':
        if (payload?.text) {
          const controller = this.getControllerForApp(targetApp);
          if (controller && targetApp?.toLowerCase().includes('notepad') && 'writeText' in controller) {
            await (controller as any).writeText(payload.text);
          } else {
            await this.actions.typeString(payload.text);
          }
        }
        break;
      case 'type_code':
        if (payload?.code) {
          await this.actions.typeCode(payload.code);
        }
        break;
      case 'shortcut':
        if (payload?.key) {
          await this.actions.pressKey(payload.key, payload.modifiers || []);
        }
        break;
      case 'terminal_command':
        if (payload?.command) {
          await this.terminalController.executeCommand(payload.command, payload.visually || false);
        }
        break;
      case 'scroll':
        await this.actions.scroll(payload?.amount || 5, payload?.direction || 'down');
        break;
      default:
        logger.warn(`No native action implementation for actionType: ${actionType}`);
    }
  }

  private async handleOpenApp(app?: string) {
    if (!app) return;
    const controller = this.getControllerForApp(app);
    if (controller) {
      await controller.open();
    } else {
      const launcher = new (require('../../../../desktop/applicationManager/AppLauncher').AppLauncher)(this.actions.keyboard);
      await launcher.launchApp(app);
    }
  }

  private getControllerForApp(app?: string) {
    if (!app) return null;
    const name = app.toLowerCase();
    if (name.includes('chrome')) return this.chromeController;
    if (name.includes('vs code') || name.includes('vscode')) return this.vscodeController;
    if (name.includes('whatsapp')) return this.whatsappController;
    if (name.includes('explorer') || name.includes('file')) return this.explorerController;
    if (name.includes('terminal') || name.includes('powershell') || name.includes('cmd')) return this.terminalController;
    if (name.includes('notepad')) return this.notepadController;
    if (name.includes('calculator') || name.includes('calc')) return this.calculatorController;
    if (name.includes('youtube')) return this.youtubeController;
    return null;
  }

  private async verifyOutcome(step: TaskStep): Promise<boolean> {
    return await this.verifier.verifyStep(step);
  }

  private wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public stop() {
    this.isRunning = false;
    logger.info("Decision loop stopped manually.");
  }

  public pauseTask(taskId: string) {
    this.taskManager.pauseTask(taskId);
  }

  public resumeTask(taskId: string) {
    this.taskManager.resumeTask(taskId);
  }

  public increaseTypingSpeed() {
    this.actions.typingEngine.increaseSafeSpeed();
  }
}
