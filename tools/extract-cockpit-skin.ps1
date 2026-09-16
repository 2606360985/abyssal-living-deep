param(
  [string]$Source,
  [string]$Output
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $Source) {
  $Source = Join-Path $repoRoot 'src\miner\ui\assets\concept-ui-reference.png'
}
if (-not $Output) {
  $Output = Join-Path $repoRoot 'src\miner\ui\assets\frame'
}

$sourcePath = [System.IO.Path]::GetFullPath($Source)
$outputPath = [System.IO.Path]::GetFullPath($Output)
if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
  throw "Cockpit skin source not found: $sourcePath"
}
if (-not $outputPath.StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Output must stay inside the repository: $outputPath"
}

$crops = @(
  [pscustomobject]@{ name='header-frame';       x=0;    y=0;   width=1536; height=51;  slice='9 18 10 18'; family='header';   keep=@{ top=12; right=22; bottom=13; left=22 } },
  [pscustomobject]@{ name='side-panel-frame';   x=4;    y=52;  width=330;  height=205; slice='10';         family='side';     keep=@{ top=14; right=14; bottom=14; left=14 } },
  [pscustomobject]@{ name='viewport-frame';     x=341;  y=52;  width=852;  height=613; slice='12';         family='viewport'; keep=@{ top=16; right=16; bottom=16; left=16 } },
  [pscustomobject]@{ name='control-frame';      x=1199; y=486; width=332;  height=205; slice='10';         family='control';  keep=@{ top=14; right=14; bottom=14; left=14 } },
  [pscustomobject]@{ name='metric-frame';       x=3;    y=690; width=295;  height=179; slice='9';          family='metric';   keep=@{ top=13; right=13; bottom=13; left=13 } },
  [pscustomobject]@{ name='vertical-rail';      x=334;  y=52;  width=8;    height=635; slice='none';       family='rail';     keep=$null },
  [pscustomobject]@{ name='horizontal-rail';    x=3;    y=685; width=1528; height=7;   slice='none';       family='rail';     keep=$null },
  [pscustomobject]@{ name='tool-slot-atlas';    x=15;   y=87;  width=311;  height=166; slice='none';       family='tools';    keep=$null }
)

New-Item -ItemType Directory -Force -Path $outputPath | Out-Null
$image = [System.Drawing.Bitmap]::FromFile($sourcePath)
try {
  if ($image.Width -ne 1536 -or $image.Height -ne 1024) {
    throw "Expected 1536x1024 concept artwork, got $($image.Width)x$($image.Height)."
  }

  foreach ($crop in $crops) {
    $bitmap = [System.Drawing.Bitmap]::new($crop.width, $crop.height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
        if ($null -eq $crop.keep) {
          $destinationRect = [System.Drawing.Rectangle]::new(0, 0, $crop.width, $crop.height)
          $sourceRect = [System.Drawing.Rectangle]::new($crop.x, $crop.y, $crop.width, $crop.height)
          $graphics.DrawImage($image, $destinationRect, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)
        } else {
          $top = $crop.keep.top; $right = $crop.keep.right; $bottom = $crop.keep.bottom; $left = $crop.keep.left
          $graphics.DrawImage($image,
            [System.Drawing.Rectangle]::new(0, 0, $crop.width, $top),
            [System.Drawing.Rectangle]::new($crop.x, $crop.y, $crop.width, $top),
            [System.Drawing.GraphicsUnit]::Pixel)
          $graphics.DrawImage($image,
            [System.Drawing.Rectangle]::new(0, $crop.height - $bottom, $crop.width, $bottom),
            [System.Drawing.Rectangle]::new($crop.x, $crop.y + $crop.height - $bottom, $crop.width, $bottom),
            [System.Drawing.GraphicsUnit]::Pixel)
          $middleHeight = $crop.height - $top - $bottom
          $graphics.DrawImage($image,
            [System.Drawing.Rectangle]::new(0, $top, $left, $middleHeight),
            [System.Drawing.Rectangle]::new($crop.x, $crop.y + $top, $left, $middleHeight),
            [System.Drawing.GraphicsUnit]::Pixel)
          $graphics.DrawImage($image,
            [System.Drawing.Rectangle]::new($crop.width - $right, $top, $right, $middleHeight),
            [System.Drawing.Rectangle]::new($crop.x + $crop.width - $right, $crop.y + $top, $right, $middleHeight),
            [System.Drawing.GraphicsUnit]::Pixel)
        }
      } finally {
        $graphics.Dispose()
      }
      $destination = Join-Path $outputPath "$($crop.name).png"
      $bitmap.Save($destination, [System.Drawing.Imaging.ImageFormat]::Png)
      Write-Host "wrote $($crop.name).png ($($crop.width)x$($crop.height))"
    } finally {
      $bitmap.Dispose()
    }
  }
} finally {
  $image.Dispose()
}

$manifest = [ordered]@{
  source = [System.IO.Path]::GetFileName($sourcePath)
  sourceSize = @{ width = 1536; height = 1024 }
  generatedAt = 'deterministic'
  assets = $crops
}
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $outputPath 'frame-manifest.json') -Encoding utf8
