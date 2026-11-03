param([Parameter(Mandatory=$true)][string]$Source)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$brandSource = [System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath $Source).Path)
try {
  foreach ($entry in @(@{Size=256;Name='wenhao-avatar.png'}, @{Size=64;Name='favicon.png'})) {
    $target = [System.Drawing.Bitmap]::new($entry.Size, $entry.Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($target)
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $attributes = [System.Drawing.Imaging.ImageAttributes]::new()
      try {
        $attributes.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
        $graphics.DrawImage($brandSource, [System.Drawing.Rectangle]::new(0,0,$entry.Size,$entry.Size), 0,0,$brandSource.Width,$brandSource.Height,[System.Drawing.GraphicsUnit]::Pixel,$attributes)
      } finally { $attributes.Dispose() }
      $target.Save((Join-Path $PSScriptRoot "../public/$($entry.Name)"), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $target.Dispose() }
  }
} finally { $brandSource.Dispose() }
