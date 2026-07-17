import { ipcMain, dialog } from 'electron';
import * as os from 'os';
import { exec } from 'child_process';
let robot: any;

try {
  robot = require('robotjs');
  robot.setMouseDelay(2);
  robot.setKeyboardDelay(5);
} catch (err) {
  console.log("WARNING: robotjs failed to load. Desktop control will not work without it.");
}

let permissionGranted = true; // Auto-grant for now since we are native, or we can require explicit UI trigger. For seamless integration we allow it.

export function getScreenState() {
  const screenSize = robot ? robot.getScreenSize() : { width: 1920, height: 1080 };
  return {
    success: true,
    os: os.platform(),
    os_release: os.release(),
    screen_width: screenSize.width,
    screen_height: screenSize.height,
    active_window: "Unknown",
    open_windows: []
  };
}

export function mouseMove(xPct: number, yPct: number) {
  if (!permissionGranted || !robot) return { success: false, error: 'Permission denied or robotjs missing' };
  const screenSize = robot.getScreenSize();
  const targetX = Math.round((xPct / 100) * screenSize.width);
  const targetY = Math.round((yPct / 100) * screenSize.height);
  robot.moveMouse(targetX, targetY);
  return { success: true };
}

export function mouseClick(type: 'left' | 'right' | 'double') {
  if (!permissionGranted || !robot) return { success: false };
  if (type === 'double') {
    robot.mouseClick('left', true);
  } else {
    robot.mouseClick(type, false);
  }
  return { success: true };
}

export function keyboardType(text: string) {
  if (!permissionGranted || !robot) return { success: false };
  robot.typeString(text);
  return { success: true };
}

export function keyboardPress(key: string) {
  if (!permissionGranted || !robot) return { success: false };
  key = key.toLowerCase();
  if (key.includes('+')) {
    const parts = key.split('+').map(p => p.trim());
    const primary = parts[parts.length - 1];
    const modifiers = parts.slice(0, parts.length - 1);
    robot.keyTap(primary, modifiers);
  } else {
    robot.keyTap(key);
  }
  return { success: true };
}

export function launchApp(appName: string) {
  if (!permissionGranted) return { success: false, error: 'Permission denied' };
  appName = appName.toLowerCase();
  let cmd = "";
  const isWin = os.platform() === 'win32';
  
  if (appName.includes("chrome")) {
    cmd = isWin ? "start chrome" : "open -a 'Google Chrome'";
  } else if (appName.includes("notepad") || appName.includes("text")) {
    cmd = isWin ? "notepad" : "open -a TextEdit";
  } else if (appName.includes("settings")) {
    cmd = isWin ? "start ms-settings:" : "open -a 'System Settings'";
  } else {
    cmd = isWin ? `start "" "${appName}"` : `open -a "${appName}"`;
  }

  exec(cmd, (err) => {
    if (err) console.error("Launch error:", err);
  });
  return { success: true };
}

export function setupDesktopControl() {
  ipcMain.handle('desktop:requestPermission', async () => {
    return permissionGranted;
  });

  ipcMain.handle('desktop:getScreenState', () => getScreenState());
  ipcMain.handle('desktop:mouseMove', (_, x, y) => mouseMove(x, y));
  ipcMain.handle('desktop:mouseClick', (_, type) => mouseClick(type));
  ipcMain.handle('desktop:keyboardType', (_, text) => keyboardType(text));
  ipcMain.handle('desktop:keyboardPress', (_, key) => keyboardPress(key));
  ipcMain.handle('desktop:launchApp', (_, appName) => launchApp(appName));
  
  ipcMain.handle('desktop:windowControl', (_, controlType: 'minimize' | 'maximize' | 'close') => {
    if (!permissionGranted || !robot) return { success: false };
    const isWin = os.platform() === 'win32';
    if (controlType === 'close') {
      isWin ? robot.keyTap('f4', ['alt']) : robot.keyTap('w', ['command']);
    } else if (controlType === 'minimize') {
      isWin ? robot.keyTap('d', ['command']) : robot.keyTap('m', ['command']);
    } else if (controlType === 'maximize') {
      isWin ? robot.keyTap('up', ['command']) : robot.keyTap('f', ['command', 'control']);
    }
    return { success: true };
  });

  ipcMain.handle('desktop:mouseDragDrop', (_, fromX: number, fromY: number, toX: number, toY: number) => {
    if (!permissionGranted || !robot) return { success: false };
    const screenSize = robot.getScreenSize();
    const fX = Math.round((fromX / 100) * screenSize.width);
    const fY = Math.round((fromY / 100) * screenSize.height);
    const tX = Math.round((toX / 100) * screenSize.width);
    const tY = Math.round((toY / 100) * screenSize.height);
    
    robot.moveMouse(fX, fY);
    robot.mouseToggle("down", "left");
    robot.moveMouse(tX, tY);
    robot.mouseToggle("up", "left");
    return { success: true };
  });

  ipcMain.handle('desktop:executeTerminalCommand', async (_, command) => {
    return await executeTerminalCommand(command);
  });
}

export async function executeTerminalCommand(command: string): Promise<any> {
  if (!permissionGranted) return { success: false, error: 'Permission denied' };
  
  return new Promise((resolve) => {
    // For Windows, default to powershell to support complex commands and better listing
    const shellStr = os.platform() === 'win32' ? 'powershell.exe' : '/bin/bash';
    
    exec(command, { shell: shellStr }, (error, stdout, stderr) => {
      if (error) {
        resolve({
          success: false,
          error: error.message,
          stderr: stderr || "",
          stdout: stdout || ""
        });
      } else {
        resolve({
          success: true,
          stdout: stdout || "",
          stderr: stderr || ""
        });
      }
    });
  });
}
