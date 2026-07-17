$processes = Get-Process -Name "{{EXE_NAME}}" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
if ($processes) {
   Write-Output "READY"
} else {
   Write-Output "NOT_READY"
}
