param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("development", "production")]
  [string]$EnvironmentName,

  [AllowEmptyString()]
  [string]$ConfiguredKey = ""
)

$ErrorActionPreference = "Stop"

function Test-EncryptionKey([string]$Value) {
  if ($Value -match '^[0-9a-fA-F]{64}$') { return $true }
  try { return [Convert]::FromBase64String($Value).Length -eq 32 } catch { return $false }
}

if (-not [string]::IsNullOrWhiteSpace($ConfiguredKey)) {
  if (-not (Test-EncryptionKey $ConfiguredKey.Trim())) {
    throw "APP_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex or 44 base64 characters."
  }
  Write-Output $ConfiguredKey.Trim()
  return
}

if ([string]::IsNullOrWhiteSpace($env:RUNNER_TOOL_CACHE)) {
  throw "APP_ENCRYPTION_KEY is unset and this runner has no persistent tool-cache directory. Configure APP_ENCRYPTION_KEY as a deployment secret."
}

# Keep separate, stable keys per deployment environment on the self-hosted runner.
$secretDirectory = Join-Path $env:RUNNER_TOOL_CACHE "rankly-secrets"
New-Item -ItemType Directory -Path $secretDirectory -Force | Out-Null

# Restrict this directory to the self-hosted runner account. The runner tool cache
# persists between deployments; losing it requires restoring the key from backup.
$runnerSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$directoryAcl = Get-Acl -Path $secretDirectory
$directoryAcl.SetAccessRuleProtection($true, $false)
$directoryAcl.SetOwner($runnerSid)
$runnerRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
  $runnerSid,
  [System.Security.AccessControl.FileSystemRights]::FullControl,
  [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit,
  [System.Security.AccessControl.PropagationFlags]::None,
  [System.Security.AccessControl.AccessControlType]::Allow
)
$directoryAcl.SetAccessRule($runnerRule)
Set-Acl -Path $secretDirectory -AclObject $directoryAcl

$keyPath = Join-Path $secretDirectory "app-encryption-$EnvironmentName.key"
if (Test-Path -LiteralPath $keyPath) {
  $key = (Get-Content -LiteralPath $keyPath -Raw).Trim()
  if (-not (Test-EncryptionKey $key)) {
    throw "The persisted APP_ENCRYPTION_KEY for $EnvironmentName is invalid. Restore it from backup; do not replace it while encrypted credentials exist."
  }
} else {
  $bytes = New-Object byte[] 32
  $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $random.GetBytes($bytes) } finally { $random.Dispose() }
  $key = [BitConverter]::ToString($bytes).Replace("-", "").ToLowerInvariant()
  [Array]::Clear($bytes, 0, $bytes.Length)
  [System.IO.File]::WriteAllText($keyPath, $key, [System.Text.Encoding]::ASCII)
}

Write-Output $key
