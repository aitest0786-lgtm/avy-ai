$sig = '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count); [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int lpdwProcessId);'
try { [AvyPercept.Win32Util] > $null } catch { Add-Type -MemberDefinition $sig -Name "Win32Util" -Namespace "AvyPercept" -ErrorAction SilentlyContinue }
$hwnd = [AvyPercept.Win32Util]::GetForegroundWindow()
if ($hwnd -and $hwnd -ne [IntPtr]::Zero) {
  $title = New-Object System.Text.StringBuilder 256
  [AvyPercept.Win32Util]::GetWindowText($hwnd, $title, 256) | Out-Null
  $pid = 0
  [AvyPercept.Win32Util]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null
  $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
  $app = if ($process) { $process.ProcessName } else { "Unknown" }
  $res = @{ title = $title.ToString(); app = $app; pid = $pid }
  Write-Output (ConvertTo-Json $res)
} else {
  Write-Output '{"title": "Desktop", "app": "Explorer", "pid": 0}'
}
