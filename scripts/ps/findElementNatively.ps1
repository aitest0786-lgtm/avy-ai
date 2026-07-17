Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$sig = @'
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
'@
$type = Add-Type -MemberDefinition $sig -Name "Win32Foreground" -Namespace "AvyAgent" -PassThru -ErrorAction SilentlyContinue
$hwnd = $type::GetForegroundWindow()
if ($hwnd -and $hwnd -ne [IntPtr]::Zero) {
    try {
        $el = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
        if ($el) {
            $cond = New-Object System.Windows.Automation.PropertyCondition(
                [System.Windows.Automation.AutomationElement]::NameProperty,
                "{{SEARCH_TEXT}}"
            )
            $found = $el.FindFirst([System.Windows.Automation.TreeScope]::Subtree, $cond)
            if (-not $found) {
                $all = $el.FindAll([System.Windows.Automation.TreeScope]::Subtree, [System.Windows.Automation.Condition]::TrueCondition)
                foreach ($item in $all) {
                    if ($item.Current.Name -and $item.Current.Name.ToLower().Contains("{{SEARCH_TEXT}}".ToLower())) {
                        $found = $item
                        break
                    }
                }
            }
            if ($found) {
                $rect = $found.Current.BoundingRectangle
                if ($rect.Width -gt 0 -and $rect.Height -gt 0) {
                    $midX = $rect.X + ($rect.Width / 2)
                    $midY = $rect.Y + ($rect.Height / 2)
                    $res = @{ x = $midX; y = $midY }
                    Write-Output (ConvertTo-Json $res)
                    return
                }
            }
        }
    } catch {}
}
Write-Output "null"
