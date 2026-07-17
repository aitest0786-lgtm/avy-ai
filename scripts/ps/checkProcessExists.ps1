$proc = Get-Process -Name "{{EXE_NAME}}" -ErrorAction SilentlyContinue
if ($proc) {
  Write-Output "EXISTS"
} else {
  Write-Output "NOT_FOUND"
}
