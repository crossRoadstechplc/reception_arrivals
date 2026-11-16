<#
.SYNOPSIS
  Build a new version of the Arrival Desk Android app on this PC and publish it.
  Phones running the app see "Update available" and install it with one tap.

.EXAMPLE
  cd mobile
  .\release.ps1                                   # 1.0.3 -> 1.0.4, notes from git log
  .\release.ps1 -Notes "Calendar shows parking"   # your own "What's new" text
  .\release.ps1 -Bump minor                       # 1.0.4 -> 1.1.0

.NOTES
  Needs, once:
    - GitHub CLI: winget install GitHub.cli   then   gh auth login
    - The signing key: android\key.properties + android\upload-keystore.jks (git-ignored).
      Every release MUST be signed with this same key, or phones refuse the update.
      Back both files up somewhere safe (password manager / company drive).
  What it does:
    1. bumps the version in pubspec.yaml (build number always +1)
    2. builds the signed release APK
    3. commits the version bump, tags it app-v<version>+<build>, pushes
    4. creates a GitHub release with the APK and its sha256 (the app verifies it)
#>
param(
  [ValidateSet('patch', 'minor', 'major', 'none')]
  [string]$Bump = 'patch',
  [string]$Notes = ''
)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Fail($message) { Write-Host "`n$message" -ForegroundColor Red; exit 1 }

# --- Checks -----------------------------------------------------------------
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { Fail 'GitHub CLI not found. Install it: winget install GitHub.cli   then run: gh auth login' }
gh auth status *> $null
if ($LASTEXITCODE -ne 0) { Fail 'GitHub CLI is not signed in. Run: gh auth login' }
if (-not (Test-Path 'android\key.properties') -or -not (Test-Path 'android\upload-keystore.jks')) {
  Fail 'Signing key missing (android\key.properties, android\upload-keystore.jks). Restore them from your backup; never make a new one, or installed apps can''t update.'
}
if (-not (Test-Path 'android\app\google-services.json')) {
  Fail 'android\app\google-services.json is missing; phone alerts would stop working in this version.'
}
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne 'main') { Fail "You're on '$branch'. Switch to main first." }
git fetch --quiet origin main
if ((git rev-list --count HEAD..origin/main).Trim() -ne '0') { Fail 'main is behind GitHub. Run: git pull' }

# --- Version ------------------------------------------------------------------
$pubspec = Get-Content pubspec.yaml -Raw
if ($pubspec -notmatch '(?m)^version:\s*(\d+)\.(\d+)\.(\d+)\+(\d+)\s*$') { Fail 'Could not read "version: x.y.z+n" from pubspec.yaml' }
$major = [int]$Matches[1]; $minor = [int]$Matches[2]; $patch = [int]$Matches[3]; $build = [int]$Matches[4]
switch ($Bump) {
  'major' { $major++; $minor = 0; $patch = 0 }
  'minor' { $minor++; $patch = 0 }
  'patch' { $patch++ }
}
$build++
$version = "$major.$minor.$patch"
$tag = "app-v$version+$build"
Write-Host "Releasing Arrival Desk $version (build $build)..." -ForegroundColor Cyan

$original = $pubspec
$updated = [regex]::Replace($pubspec, '(?m)^version:.*$', "version: $version+$build")
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'pubspec.yaml'), $updated)

# --- Build ------------------------------------------------------------------
try {
  flutter build apk --release --target-platform android-arm,android-arm64
  if ($LASTEXITCODE -ne 0) { throw 'flutter build failed' }
} catch {
  [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'pubspec.yaml'), $original)
  Fail "Build failed, version left at the old number. $_"
}

$apk = 'build\app\outputs\flutter-apk\app-release.apk'
New-Item -ItemType Directory -Force -Path 'build\release' | Out-Null
$out = "build\release\arrival-desk-$version.apk"
Copy-Item $apk $out -Force
$sha = (Get-FileHash $out -Algorithm SHA256).Hash.ToLower()

# --- Notes ------------------------------------------------------------------
if (-not $Notes) {
  $lastTag = (git tag --list 'app-v*' --sort=-creatordate | Select-Object -First 1)
  $range = if ($lastTag) { "$lastTag..HEAD" } else { 'HEAD~20..HEAD' }
  $log = git log $range --no-merges --pretty='- %s' -- . ..\app\api\mobile ..\lib 2>$null
  $Notes = if ($log) { ($log | Select-Object -First 15) -join "`n" } else { 'Improvements and fixes.' }
}
$body = "$Notes`n`nsha256: $sha"

# --- Commit, tag, push, release --------------------------------------------------
git add pubspec.yaml
git commit -m "Release Android app $version ($build)" | Out-Null
git tag $tag
git push origin main
if ($LASTEXITCODE -ne 0) { Fail 'git push failed (version bump is committed locally). Fix it and run the script again with -Bump none.' }
git push origin $tag
if ($LASTEXITCODE -ne 0) { Fail ("Pushing the tag failed. Fix it, then run: git push origin $tag; gh release create $tag $out") }

$notesFile = New-TemporaryFile
Set-Content -Path $notesFile -Value $body -Encoding utf8
gh release create $tag $out --title "Arrival Desk $version" --notes-file $notesFile
$ok = $LASTEXITCODE -eq 0
Remove-Item $notesFile
if (-not $ok) { Fail "Release upload failed. Retry with: gh release create $tag $out --title `"Arrival Desk $version`"" }

Write-Host "`nPublished Arrival Desk $version (build $build)." -ForegroundColor Green
Write-Host 'Phones will offer the update the next time the app opens (within ~5 minutes).'
