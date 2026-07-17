$sig = 'using System; using System.Runtime.InteropServices; public class Win32Launcher { [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool SetForegroundWindow(IntPtr hWnd); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow); }'
try { [AvyLauncher.Win32Launcher] > $null } catch { Add-Type -TypeDefinition $sig -Namespace "AvyLauncher" -ErrorAction SilentlyContinue }

$proc = Get-Process -Name "{{EXE_NAME}}" -ErrorAction SilentlyContinue
if ($proc) {
   $withWindow = $proc | Where-Object { $_.MainWindowHandle -ne 0 }
   if ($withWindow) {
      $hwnd = $withWindow[0].MainWindowHandle
      [AvyLauncher.Win32Launcher]::ShowWindow($hwnd, 9) | Out-Null
      [AvyLauncher.Win32Launcher]::SetForegroundWindow($hwnd) | Out-Null
      Write-Output "FOCUSED"
   } else {
      Write-Output "PROCESS_EXISTS_NO_WINDOW"
   }
} else {
   Write-Output "NOT_FOUND"
}
