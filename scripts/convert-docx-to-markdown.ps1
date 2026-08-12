[CmdletBinding()]
param(
  [string[]]$DocumentName
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-CleanWordText {
  param([string]$Text)
  if ($null -eq $Text) { return '' }

  $value = $Text -replace '[\x07\x0b]', ''
  $value = $value -replace '(\r\n|\r|\n)+$', ''
  $value = $value -replace '[\t ]+', ' '
  return $value.Trim()
}

function Get-MarkdownParagraph {
  param($Paragraph)

  $text = Get-CleanWordText ([string]$Paragraph.Range.Text)
  if ([string]::IsNullOrWhiteSpace($text)) { return $null }

  $styleName = [string]$Paragraph.Range.Style.NameLocal
  $headingMatch = [regex]::Match($styleName, '(?i)^(heading|t(?:i|\u00ed)tulo)\s*([1-6])')
  if ($headingMatch.Success) {
    return (('#' * [int]$headingMatch.Groups[2].Value) + ' ' + $text)
  }
  if ([regex]::IsMatch($styleName, '(?i)^(title|t(?:i|\u00ed)tulo)$')) {
    return '# ' + $text
  }

  if ([int]$Paragraph.Range.ListFormat.ListType -ne 0) {
    $level = [Math]::Max(1, [int]$Paragraph.Range.ListFormat.ListLevelNumber)
    $indent = '  ' * ($level - 1)
    $marker = [string]$Paragraph.Range.ListFormat.ListString
    if ($marker -match '[0-9A-Za-z]') { return $indent + '1. ' + $text }
    return $indent + '- ' + $text
  }

  return $text
}

function Convert-WordTableToMarkdown {
  param($Table)

  $rows = @()
  foreach ($row in @($Table.Rows)) {
    $cells = @()
    foreach ($cell in @($row.Cells)) {
      $cellText = Get-CleanWordText ([string]$cell.Range.Text)
      $cellText = $cellText -replace '(\r\n|\r|\n)+', '<br>'
      $cellText = $cellText -replace '\|', '\|'
      $cells += $cellText
    }
    if ($cells.Count -gt 0) { $rows += ,@($cells) }
  }
  if ($rows.Count -eq 0) { return $null }

  $columnCount = $rows[0].Count
  $lines = @()
  foreach ($row in $rows) {
    $cells = @($row)
    while ($cells.Count -lt $columnCount) { $cells += '' }
    if ($cells.Count -gt $columnCount) { $cells = $cells[0..($columnCount - 1)] }
    $lines += '| ' + ($cells -join ' | ') + ' |'
    if ($lines.Count -eq 1) {
      $lines += '| ' + ((@('---') * $columnCount) -join ' | ') + ' |'
    }
  }
  return ($lines -join "`n")
}

function Extract-VisualAssets {
  param(
    [string]$SourcePath,
    [string]$OutputDirectory,
    [string]$DocumentStem
  )

  $relativeDirectory = Join-Path 'assets' $DocumentStem
  $assetDirectory = Join-Path $OutputDirectory $relativeDirectory
  $archive = [System.IO.Compression.ZipFile]::OpenRead($SourcePath)
  try {
    $assets = @()
    foreach ($entry in @($archive.Entries | Where-Object {
      $_.FullName -like 'word/media/*' -and -not [string]::IsNullOrWhiteSpace($_.Name)
    })) {
      New-Item -ItemType Directory -Force -Path $assetDirectory | Out-Null
      $destination = Join-Path $assetDirectory $entry.Name
      $entryStream = $entry.Open()
      try {
        $destinationStream = [System.IO.File]::Create($destination)
        try { $entryStream.CopyTo($destinationStream) } finally { $destinationStream.Dispose() }
      } finally { $entryStream.Dispose() }
      $assets += (($relativeDirectory -replace '\\', '/') + '/' + $entry.Name)
    }
    return $assets
  } finally {
    $archive.Dispose()
  }
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$docsDirectory = Join-Path $repositoryRoot 'docs'
if (-not (Test-Path -LiteralPath $docsDirectory -PathType Container)) {
  throw "Documentation directory not found: $docsDirectory"
}

$docxFiles = @(Get-ChildItem -LiteralPath $docsDirectory -File -Filter '*.docx' | Sort-Object Name)
$jobs = @()
foreach ($group in ($docxFiles | Group-Object { (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash })) {
  $primary = @($group.Group | Where-Object { $_.BaseName -notmatch ' \(\d+\)$' } | Sort-Object Name | Select-Object -First 1)
  if ($primary.Count -eq 0) { $primary = @($group.Group | Sort-Object Name | Select-Object -First 1) }
  $jobs += $primary[0]
}
$jobs = @($jobs | Sort-Object Name)

if ($DocumentName.Count -gt 0) {
  $requested = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  $DocumentName | ForEach-Object { [void]$requested.Add($_) }
  $jobs = @($jobs | Where-Object { $requested.Contains($_.Name) })
  if ($jobs.Count -ne $requested.Count) { throw 'Um ou mais nomes solicitados não correspondem aos documentos DOCX canônicos.' }
}

$word = $null
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$report = @()
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $word.AutomationSecurity = 3

  foreach ($sourceFile in $jobs) {
    $document = $null
    try {
      $document = $word.Documents.Open($sourceFile.FullName, $false, $true, $false)
      $elements = @()
      foreach ($paragraph in @($document.Paragraphs)) {
        if (-not [bool]$paragraph.Range.Information(12)) {
          $elements += [PSCustomObject]@{ Start = [int]$paragraph.Range.Start; Order = 1; Kind = 'paragraph'; Value = $paragraph }
        }
      }
      foreach ($table in @($document.Tables)) {
        $elements += [PSCustomObject]@{ Start = [int]$table.Range.Start; Order = 0; Kind = 'table'; Value = $table }
      }

      $lines = @('# ' + ($sourceFile.BaseName -replace '_', ' '), '')
      foreach ($element in @($elements | Sort-Object Start, Order)) {
        if ($element.Kind -eq 'table') { $value = Convert-WordTableToMarkdown $element.Value }
        else { $value = Get-MarkdownParagraph $element.Value }
        if (-not [string]::IsNullOrWhiteSpace($value)) {
          $lines += $value
          $lines += ''
        }
      }

      $assets = @(Extract-VisualAssets -SourcePath $sourceFile.FullName -OutputDirectory $docsDirectory -DocumentStem $sourceFile.BaseName)
      if ($assets.Count -gt 0) {
        $lines += ('## Assets visuais extra' + [char]0x00ED + 'dos')
        $lines += ''
        foreach ($asset in $assets) {
          $encodedAsset = ($asset -split '/' | ForEach-Object {
            [uri]::EscapeDataString($_).Replace('(', '%28').Replace(')', '%29')
          }) -join '/'
          $lines += '- [' + (Split-Path -Leaf $asset) + '](' + $encodedAsset + ')'
        }
        $lines += ''
      }

      $markdown = (($lines -join "`n") -replace "(`n){3,}", "`n`n").TrimEnd() + "`n"
      $outputPath = Join-Path $docsDirectory ($sourceFile.BaseName + '.md')
      [System.IO.File]::WriteAllText($outputPath, $markdown, $utf8NoBom)
      $report += [PSCustomObject]@{
        Source = $sourceFile.Name
        Output = Split-Path -Leaf $outputPath
        Assets = $assets.Count
        Characters = $markdown.Length
      }
    } finally {
      if ($document) {
        $document.Close($false) | Out-Null
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($document) | Out-Null
      }
    }
  }
} finally {
  if ($word) {
    $word.Quit() | Out-Null
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

$report | Format-Table -AutoSize
