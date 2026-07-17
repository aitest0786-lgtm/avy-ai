import { spawn, ChildProcess } from 'child_process';
import { logger } from '../agent/core/Logger';

export class PowerShellWorker {
  private static instance: PowerShellWorker | null = null;
  private proc: ChildProcess | null = null;
  private queue: { cmd: string; resolve: (val: string) => void; reject: (err: any) => void }[] = [];
  private isProcessing = false;
  private buffer = "";
  private readonly delimiter = "---AVY_CMD_FINISHED---";

  private constructor() {
    this.start();
  }

  public static getInstance(): PowerShellWorker {
    if (!PowerShellWorker.instance) {
      PowerShellWorker.instance = new PowerShellWorker();
    }
    return PowerShellWorker.instance;
  }

  private start() {
    logger.info("PowerShellWorker: Launching persistent background process...");
    
    // Spawn PowerShell without logo, in interactive mode via standard input
    this.proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-NoExit', '-Command', '-'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Write bootstrap command to register Win32 API calls
    const bootstrapCmd = `
$sig = @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public class Win32Input {
    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }
    [StructLayout(LayoutKind.Explicit)]
    public struct INPUT_UNION {
        [FieldOffset(0)]
        public KEYBDINPUT ki;
    }
    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT {
        public uint type;
        public INPUT_UNION u;
    }
    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
    [DllImport("user32.dll")]
    public static extern IntPtr GetMessageExtraInfo();
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")]
    public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int lpdwProcessId);
    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, IntPtr dwExtraInfo);
    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vKey);
    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);
    [StructLayout(LayoutKind.Sequential)]
    public struct POINT {
        public int X;
        public int Y;
    }
    [DllImport("user32.dll")]
    public static extern bool GetCursorPos(out POINT lpPoint);
    [DllImport("user32.dll")]
    public static extern int GetSystemMetrics(int nIndex);

    public const uint INPUT_KEYBOARD = 1;
    public const uint KEYEVENTF_KEYUP = 0x0002;
    public const uint KEYEVENTF_UNICODE = 0x0004;

    public static void SendKey(ushort wVk, bool up) {
        INPUT[] inputs = new INPUT[1];
        inputs[0].type = INPUT_KEYBOARD;
        inputs[0].u.ki.wVk = wVk;
        inputs[0].u.ki.wScan = 0;
        inputs[0].u.ki.dwFlags = up ? KEYEVENTF_KEYUP : 0;
        inputs[0].u.ki.time = 0;
        inputs[0].u.ki.dwExtraInfo = GetMessageExtraInfo();
        SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
    }

    public static void SendUnicodeChar(char ch, bool up) {
        INPUT[] inputs = new INPUT[1];
        inputs[0].type = INPUT_KEYBOARD;
        inputs[0].u.ki.wVk = 0;
        inputs[0].u.ki.wScan = (ushort)ch;
        inputs[0].u.ki.dwFlags = KEYEVENTF_UNICODE | (up ? KEYEVENTF_KEYUP : 0);
        inputs[0].u.ki.time = 0;
        inputs[0].u.ki.dwExtraInfo = GetMessageExtraInfo();
        SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
    }

    public static void ReleaseAllModifiersAndMouse() {
        ushort[] modifierVks = new ushort[] { 0x10, 0x11, 0x12, 0x5B, 0x5C, 0x5D };
        foreach (ushort vk in modifierVks) {
            if ((GetAsyncKeyState(vk) & 0x8000) != 0) {
                SendKey(vk, true);
            }
        }
        if ((GetAsyncKeyState(0x01) & 0x8000) != 0) {
            mouse_event(0x0004, 0, 0, 0, IntPtr.Zero); // MOUSEEVENTF_LEFTUP
        }
        if ((GetAsyncKeyState(0x02) & 0x8000) != 0) {
            mouse_event(0x0010, 0, 0, 0, IntPtr.Zero); // MOUSEEVENTF_RIGHTUP
        }
        if ((GetAsyncKeyState(0x04) & 0x8000) != 0) {
            mouse_event(0x0040, 0, 0, 0, IntPtr.Zero); // MOUSEEVENTF_MIDDLEUP
        }
    }

    public static bool IsMouseButtonPressed() {
        return (GetAsyncKeyState(0x01) & 0x8000) != 0 || 
               (GetAsyncKeyState(0x02) & 0x8000) != 0 || 
               (GetAsyncKeyState(0x04) & 0x8000) != 0;
    }

    public static bool IsContextMenuOpen() {
        return FindWindow("#32768", null) != IntPtr.Zero;
    }

    public static void RestoreFocus(int pid) {
        try {
            System.Diagnostics.Process proc = System.Diagnostics.Process.GetProcessById(pid);
            IntPtr hwnd = proc.MainWindowHandle;
            if (hwnd != IntPtr.Zero) {
                ShowWindow(hwnd, 9); // SW_RESTORE
                SetForegroundWindow(hwnd);
            }
        } catch {}
    }

    public static string GetActiveWindowJson() {
        IntPtr hwnd = GetForegroundWindow();
        if (hwnd == IntPtr.Zero) {
            return "{\\"title\\":\\"Desktop\\",\\"app\\":\\"Explorer\\",\\"pid\\":0}";
        }
        StringBuilder title = new StringBuilder(256);
        GetWindowText(hwnd, title, 256);
        int pid;
        GetWindowThreadProcessId(hwnd, out pid);
        string appName = "Unknown";
        try {
            appName = System.Diagnostics.Process.GetProcessById(pid).ProcessName;
        } catch {}
        string titleEscaped = title.ToString().Replace("\\\\", "\\\\\\\\").Replace("\\"", "\\\\\\"").Replace("\\n", " ").Replace("\\r", "");
        return "{\\"title\\":\\"" + titleEscaped + "\\",\\"app\\":\\"" + appName + "\\",\\"pid\\":" + pid + "}";
    }

    public static string GetCursorPosJson() {
        POINT p;
        GetCursorPos(out p);
        return "{\\"x\\":" + p.X + ",\\"y\\":" + p.Y + "}";
    }
    
    public static string GetScreenSizeJson() {
        int w = GetSystemMetrics(0); // SM_CXSCREEN
        int h = GetSystemMetrics(1); // SM_CYSCREEN
        return "{\\"width\\":" + w + ",\\"height\\":" + h + "}";
    }

    public static void PerformMouseEvent(uint dwFlags, uint dx, uint dy, uint dwData) {
        mouse_event(dwFlags, dx, dy, dwData, IntPtr.Zero);
    }
    
    public static void SetCursorPosition(int x, int y) {
        SetCursorPos(x, y);
    }
}
'@
Add-Type -TypeDefinition $sig -ErrorAction SilentlyContinue
\r\n`;

    this.proc.stdin?.write(bootstrapCmd);

    this.proc.stdout?.on('data', (data) => {
      this.buffer += data.toString();
      this.checkBuffer();
    });

    this.proc.stderr?.on('data', (data) => {
      logger.error(`PowerShellWorker error stream: ${data.toString()}`);
    });

    this.proc.on('close', (code) => {
      logger.warn(`PowerShellWorker: Process exited with code ${code}. Restarting...`);
      this.proc = null;
      this.isProcessing = false;
      this.start();
      // If we had a pending command, reject it so it can retry
      if (this.queue.length > 0) {
        const pending = this.queue.shift();
        pending?.reject(new Error("PowerShell process restarted during execution"));
      }
      this.processQueue();
    });
  }

  public async getActiveWindow(): Promise<{ title: string; app: string; pid: number }> {
    try {
      const result = await this.execute('[Win32Input]::GetActiveWindowJson()');
      return JSON.parse(result.trim());
    } catch (err) {
      logger.error("PowerShellWorker: failed to get active window:", err);
      return { title: "Unknown", app: "Unknown", pid: 0 };
    }
  }

  public async sendKey(wVk: number, up: boolean): Promise<void> {
    await this.execute(`[Win32Input]::SendKey(${wVk}, ${up ? '$true' : '$false'})`);
  }

  public async sendUnicodeChar(charStr: string, up: boolean): Promise<void> {
    const charCode = charStr.charCodeAt(0);
    await this.execute(`[Win32Input]::SendUnicodeChar([char]${charCode}, ${up ? '$true' : '$false'})`);
  }

  public async releaseAllModifiersAndMouse(): Promise<void> {
    await this.execute('[Win32Input]::ReleaseAllModifiersAndMouse()');
  }

  public async isMouseButtonPressed(): Promise<boolean> {
    const result = await this.execute('[Win32Input]::IsMouseButtonPressed()');
    return result.trim().toLowerCase() === 'true';
  }

  public async isContextMenuOpen(): Promise<boolean> {
    const result = await this.execute('[Win32Input]::IsContextMenuOpen()');
    return result.trim().toLowerCase() === 'true';
  }

  public async restoreFocus(pid: number): Promise<void> {
    await this.execute(`[Win32Input]::RestoreFocus(${pid})`);
  }

  public async getCursorPos(): Promise<{ x: number; y: number }> {
    try {
      const result = await this.execute('[Win32Input]::GetCursorPosJson()');
      return JSON.parse(result.trim());
    } catch (err) {
      return { x: 0, y: 0 };
    }
  }

  public async getScreenSize(): Promise<{ width: number; height: number }> {
    try {
      const result = await this.execute('[Win32Input]::GetScreenSizeJson()');
      return JSON.parse(result.trim());
    } catch (err) {
      return { width: 1920, height: 1080 }; // Fallback
    }
  }

  public async setCursorPos(x: number, y: number): Promise<void> {
    await this.execute(`[Win32Input]::SetCursorPosition(${Math.round(x)}, ${Math.round(y)})`);
  }

  public async performMouseEvent(flags: number, data: number = 0): Promise<void> {
    // We pass 0 for dx/dy as we rely on SetCursorPos for positioning.
    await this.execute(`[Win32Input]::PerformMouseEvent(${flags}, 0, 0, ${data})`);
  }

  public async execute(cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.queue.push({ cmd, resolve, reject });
      this.processQueue();
    });
  }

  private processQueue() {
    if (this.isProcessing || this.queue.length === 0 || !this.proc) return;
    this.isProcessing = true;

    const { cmd } = this.queue[0];
    this.buffer = ""; // Clear buffer before command output starts

    // Write command, then output our unique delimiter to mark command completion
    const commandText = `${cmd}\r\nWrite-Output "${this.delimiter}"\r\n`;
    this.proc.stdin?.write(commandText);
  }

  private checkBuffer() {
    if (this.buffer.includes(this.delimiter)) {
      const parts = this.buffer.split(this.delimiter);
      const result = parts[0].trim();
      
      // Update buffer with whatever remains after the delimiter
      this.buffer = parts.slice(1).join(this.delimiter);

      const item = this.queue.shift();
      this.isProcessing = false;
      
      if (item) {
        item.resolve(result);
      }
      
      // Trigger next in queue
      this.processQueue();
    }
  }

  public dispose() {
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
  }
}
