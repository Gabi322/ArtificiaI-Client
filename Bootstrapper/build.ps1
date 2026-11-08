$ErrorActionPreference = 'Stop'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw "Could not find the .NET Framework C# compiler: $compiler" }
$output = Join-Path $PSScriptRoot 'Artificiai-Launcher-Bootstrap.exe'
$icon = Join-Path $PSScriptRoot '..\assets\artificiai.ico'
& $compiler /nologo /target:winexe /platform:x64 /optimize+ /out:$output /win32icon:$icon `
  /reference:System.dll `
  /reference:System.Core.dll `
  /reference:System.Drawing.dll `
  /reference:System.Net.Http.dll `
  /reference:System.Security.dll `
  /reference:System.Web.Extensions.dll `
  /reference:System.Windows.Forms.dll `
  (Join-Path $PSScriptRoot 'Program.cs')
if ($LASTEXITCODE -ne 0) { throw "C# compiler failed with exit code $LASTEXITCODE" }
Write-Output "Built $output"
