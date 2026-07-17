import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StartupManager } from '../StartupManager';
import { IModule } from '../IModule';

describe('StartupManager', () => {
  let manager: StartupManager;
  let mockModule1: IModule;
  let mockModule2: IModule;

  beforeEach(() => {
    manager = new StartupManager();
    
    mockModule1 = {
      name: 'Module1',
      initialize: vi.fn().mockResolvedValue(true),
      shutdown: vi.fn().mockResolvedValue(undefined),
      status: vi.fn().mockReturnValue({ status: 'OK' })
    };

    mockModule2 = {
      name: 'Module2',
      initialize: vi.fn().mockResolvedValue(true),
      shutdown: vi.fn().mockResolvedValue(undefined),
      status: vi.fn().mockReturnValue({ status: 'OK' })
    };
  });

  it('should register modules correctly', () => {
    manager.registerModule(mockModule1);
    expect(manager.getModuleStatus('Module1')).toEqual({ status: 'OK' });
  });

  it('should initialize all modules successfully', async () => {
    manager.registerModule(mockModule1);
    manager.registerModule(mockModule2);

    const success = await manager.initializeAll();
    
    expect(success).toBe(true);
    expect(mockModule1.initialize).toHaveBeenCalledOnce();
    expect(mockModule2.initialize).toHaveBeenCalledOnce();
  });

  it('should continue initialization even if a non-critical module fails', async () => {
    mockModule1.initialize = vi.fn().mockResolvedValue(false);
    
    manager.registerModule(mockModule1);
    manager.registerModule(mockModule2);

    const success = await manager.initializeAll();
    
    // As per current architecture, it might return true or false depending on how we handle non-critical,
    // but the next module should still be initialized if the first one failed without throwing.
    expect(mockModule1.initialize).toHaveBeenCalledOnce();
    expect(mockModule2.initialize).toHaveBeenCalledOnce();
  });

  it('should shutdown all modules', async () => {
    manager.registerModule(mockModule1);
    await manager.initializeAll();
    await manager.shutdownAll();

    expect(mockModule1.shutdown).toHaveBeenCalledOnce();
  });
});
