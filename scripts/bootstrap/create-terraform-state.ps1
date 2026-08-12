[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z][a-z0-9-]{4,28}[a-z0-9]$')]
  [string]$ProjectId,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$')]
  [string]$BucketName,

  [ValidatePattern('^[a-z0-9-]+$')]
  [string]$Location = 'southamerica-east1'
)

$ErrorActionPreference = 'Stop'

function Invoke-Gcloud {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $output = & gcloud @Arguments 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference

  if ($exitCode -ne 0) {
    throw "gcloud failed: $($output -join [Environment]::NewLine)"
  }

  return $output
}

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw 'gcloud is required to bootstrap the Terraform state bucket.'
}

$project = Invoke-Gcloud -Arguments @(
  'projects', 'describe', $ProjectId,
  '--format=json(projectId,projectNumber,lifecycleState)'
) | ConvertFrom-Json

if ($project.projectId -ne $ProjectId -or $project.lifecycleState -ne 'ACTIVE') {
  throw "Project $ProjectId is not an active exact match."
}

$bucketUri = "gs://$BucketName"
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$existing = & gcloud storage buckets describe $bucketUri --format=json 2>$null
$describeExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference

if ($describeExitCode -ne 0) {
  Invoke-Gcloud -Arguments @(
    'storage', 'buckets', 'create', $bucketUri,
    "--project=$ProjectId",
    "--location=$Location",
    '--uniform-bucket-level-access',
    '--public-access-prevention'
  ) | Out-Null
}

Invoke-Gcloud -Arguments @(
  'storage', 'buckets', 'update', $bucketUri,
  '--versioning',
  '--uniform-bucket-level-access',
  '--public-access-prevention'
) | Out-Null

$verified = Invoke-Gcloud -Arguments @(
  'storage', 'buckets', 'describe', $bucketUri,
  '--format=json'
) | ConvertFrom-Json

if (-not $verified.versioning_enabled) {
  throw 'Bucket versioning verification failed.'
}

if ($verified.public_access_prevention -ne 'enforced') {
  throw 'Public Access Prevention verification failed.'
}

if (-not $verified.uniform_bucket_level_access) {
  throw 'Uniform bucket-level access verification failed.'
}

[pscustomobject]@{
  ProjectId                = $ProjectId
  BucketName               = $BucketName
  Location                 = $verified.location
  Versioning               = $verified.versioning_enabled
  PublicAccessPrevention   = $verified.public_access_prevention
  UniformBucketLevelAccess = $verified.uniform_bucket_level_access
}
