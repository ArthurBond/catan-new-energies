<#
.SYNOPSIS
  Lets friends on your home Wi-Fi reach the CATAN: New Energies game server.

.DESCRIPTION
  Creates (or updates) an inbound Windows Firewall rule named "Catan New Energies (port <Port>)"
  that allows TCP traffic to the game port on the Private network profile only. Public networks
  (cafes, hotels) stay closed. Safe to run more than once. Must be run as administrator.

.PARAMETER Port
  The game server port. Default 3210 (the server's PORT environment variable overrides it).

.PARAMETER Remove
  Deletes the rule again.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\windows\allow-firewall.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\windows\allow-firewall.ps1 -Port 3211 -Remove
#>
[CmdletBinding()]
param(
  [ValidateRange(1, 65535)]
  [int]$Port = 3210,
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$ruleName = "Catan New Energies (port $Port)"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $argLine = "-ExecutionPolicy Bypass -File `"$PSCommandPath`" -Port $Port"
  if ($Remove) { $argLine += ' -Remove' }
  Write-Host 'This script changes Windows Firewall, so it must run as administrator.' -ForegroundColor Yellow
  Write-Host 'Open the Start menu, type PowerShell, choose "Run as administrator", then run:'
  Write-Host "  powershell $argLine"
  Write-Host 'Or paste this here to open an administrator window that runs it:'
  Write-Host "  Start-Process powershell -Verb RunAs -ArgumentList '$argLine'"
  exit 1
}

$existing = @(Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)

if ($Remove) {
  if ($existing.Count -gt 0) {
    $existing | Remove-NetFirewallRule
    Write-Host "Removed the firewall rule '$ruleName'." -ForegroundColor Green
  } else {
    Write-Host "There is no firewall rule named '$ruleName'. Nothing to remove."
  }
  exit 0
}

if ($existing.Count -gt 0) {
  $existing | Set-NetFirewallRule -Direction Inbound -Action Allow -Profile Private -Enabled True
  $existing | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -Protocol TCP -LocalPort $Port
  Write-Host "Updated the firewall rule '$ruleName' (inbound TCP $Port, Private networks)." -ForegroundColor Green
} else {
  New-NetFirewallRule -DisplayName $ruleName `
    -Description 'Lets friends on your home network join the CATAN: New Energies game server.' `
    -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Private | Out-Null
  Write-Host "Created the firewall rule '$ruleName' (inbound TCP $Port, Private networks)." -ForegroundColor Green
}

# Friends can only connect through networks Windows treats as Private.
foreach ($net in @(Get-NetConnectionProfile -ErrorAction SilentlyContinue)) {
  if ($net.NetworkCategory -eq 'Public') {
    Write-Host ("Note: the network '{0}' ({1}) is set to Public, so friends cannot connect through it." -f $net.Name, $net.InterfaceAlias) -ForegroundColor Yellow
    Write-Host '      Set it to Private: Settings > Network & internet > Wi-Fi > your network > Private network.'
  }
}

# Block rules beat allow rules. Windows adds them for node.exe if its "allow access" prompt was cancelled.
$nodeBlocks = @(Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue |
  Where-Object { $_.Program -like '*\node.exe' } |
  Get-NetFirewallRule -ErrorAction SilentlyContinue |
  Where-Object { $_.Direction -eq 'Inbound' -and $_.Action -eq 'Block' -and $_.Enabled -eq 'True' })
if ($nodeBlocks.Count -gt 0) {
  Write-Host 'Warning: these firewall rules block Node.js and override the rule above:' -ForegroundColor Yellow
  foreach ($r in $nodeBlocks) { Write-Host ("  {0} (profile: {1})" -f $r.DisplayName, $r.Profile) }
  Write-Host '  Remove or disable them in "Windows Defender Firewall with Advanced Security" > Inbound Rules.'
}
