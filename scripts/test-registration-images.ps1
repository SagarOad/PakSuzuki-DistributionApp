# Smoke test: registration with photos, then confirm the photos come back on the detail APIs.
# Works on Windows PowerShell 5.1 (multipart is built with HttpClient).
# Usage: powershell -ExecutionPolicy Bypass -File scripts/test-registration-images.ps1 [-BaseUrl http://localhost:5080]
param([string]$BaseUrl = "http://localhost:5080")

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Net.Http

$stamp = Get-Date -Format 'yyMMddHHmmss'
$suffix = $stamp.Substring($stamp.Length - 7)
$client = New-Object System.Net.Http.HttpClient
$client.Timeout = [TimeSpan]::FromMinutes(2)

function New-TestImage([string]$path, [string]$color) {
    $bmp = New-Object System.Drawing.Bitmap 240, 240
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::FromName($color))
    $g.Dispose()
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Jpeg)
    $bmp.Dispose()
}

# $Fields: name -> value; $Files: array of @{ Field; Path }
function Invoke-Multipart([string]$Url, [hashtable]$Fields, [array]$Files, [string]$Token) {
    $content = New-Object System.Net.Http.MultipartFormDataContent
    foreach ($key in $Fields.Keys) {
        $content.Add((New-Object System.Net.Http.StringContent([string]$Fields[$key])), $key)
    }
    foreach ($file in $Files) {
        $bytes = [IO.File]::ReadAllBytes($file.Path)
        $part = New-Object System.Net.Http.ByteArrayContent($bytes, 0, $bytes.Length)
        $part.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse('image/jpeg')
        $content.Add($part, $file.Field, [IO.Path]::GetFileName($file.Path))
    }

    $request = New-Object System.Net.Http.HttpRequestMessage('POST', $Url)
    $request.Content = $content
    if ($Token) { $request.Headers.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue('Bearer', $Token) }

    $response = $client.SendAsync($request).GetAwaiter().GetResult()
    $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    [pscustomobject]@{
        Status = [int]$response.StatusCode
        Body   = $body
        Json   = if ($body) { try { $body | ConvertFrom-Json } catch { $null } } else { $null }
    }
}

$tmp = Join-Path $env:TEMP "paksuzuki-images-test"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$ownerPhoto = Join-Path $tmp 'owner.jpg'
$shop1 = Join-Path $tmp 'shop-front.jpg'
$shop2 = Join-Path $tmp 'signboard.jpg'
New-TestImage $ownerPhoto 'SteelBlue'
New-TestImage $shop1 'SeaGreen'
New-TestImage $shop2 'Firebrick'

Write-Host "== login as SuperAdmin"
$login = Invoke-RestMethod "$BaseUrl/api/auth/login" -Method Post -ContentType 'application/json' `
    -Body (@{ userName = 'superadmin@paksuzuki.local'; password = 'ChangeMe!2026' } | ConvertTo-Json)
$auth = @{ Authorization = "Bearer $($login.token)" }

$region = (Invoke-RestMethod "$BaseUrl/api/regions" -Headers $auth)[0]
Write-Host "   region: $($region.name)"

Write-Host "== POST /api/distributors/register (multipart with photos)"
$distFields = @{
    name            = "Test Distributor $suffix"
    cnic            = "42101$suffix" + "1"
    mobileNumber    = "0300$suffix"
    email           = "dist$suffix@example.com"
    password        = 'TestPass!2026'
    businessName    = "Test Motors $suffix"
    ntn             = "NTN$suffix"
    iban            = "PK36TEST$suffix"
    businessAddress = 'Main Boulevard, Test City'
    latitude        = $region.centerLatitude
    longitude       = $region.centerLongitude
    regionId        = $region.id
}
$distFiles = @(
    @{ Field = 'profileImage'; Path = $ownerPhoto },
    @{ Field = 'businessImages'; Path = $shop1 },
    @{ Field = 'businessImages'; Path = $shop2 }
)
$distRes = Invoke-Multipart "$BaseUrl/api/distributors/register" $distFields $distFiles
if ($distRes.Status -ne 201) { throw "distributor register failed ($($distRes.Status)): $($distRes.Body)" }
$distributorId = $distRes.Json.id
Write-Host "   created distributor $distributorId"

$distDetail = Invoke-RestMethod "$BaseUrl/api/distributors/$distributorId" -Headers $auth
Write-Host "   profileImageUrl : $($distDetail.profileImageUrl)"
Write-Host "   shop photos     : $($distDetail.images.Count)"
if (-not $distDetail.profileImageUrl) { throw 'distributor profileImageUrl missing' }
if ($distDetail.images.Count -ne 2) { throw 'distributor shop photos missing' }

Write-Host "== stored files are served over HTTP"
foreach ($url in @($distDetail.profileImageUrl) + ($distDetail.images | ForEach-Object { $_.storageUrl })) {
    $res = Invoke-WebRequest "$BaseUrl$url" -UseBasicParsing
    Write-Host "   $($res.StatusCode) $($res.Headers['Content-Type']) $url"
}

Write-Host "== approve + activate distributor so a retailer can be assigned"
Invoke-RestMethod "$BaseUrl/api/distributors/approve/$distributorId" -Method Post -Headers $auth `
    -ContentType 'application/json' -Body (@{ decision = 'Approved'; remarks = 'smoke test' } | ConvertTo-Json) | Out-Null
Invoke-RestMethod "$BaseUrl/api/distributors/activate/$distributorId" -Method Patch -Headers $auth | Out-Null

Write-Host "== POST /api/retailers/register (explicit distributor, like the web form)"
$retFields = @{
    distributorId   = $distributorId
    name            = "Test Retailer $suffix"
    cnic            = "42102$suffix" + "2"
    mobileNumber    = "0301$suffix"
    email           = "ret$suffix@example.com"
    password        = 'TestPass!2026'
    businessName    = "Test Auto Parts $suffix"
    ntn             = "NTNR$suffix"
    iban            = "PK36RTL$suffix"
    businessAddress = 'Shop 4, Test Bazaar'
    latitude        = $region.centerLatitude
    longitude       = $region.centerLongitude
}
$retFiles = @(
    @{ Field = 'profileImage'; Path = $ownerPhoto },
    @{ Field = 'businessImages'; Path = $shop1 }
)
$retRes = Invoke-Multipart "$BaseUrl/api/retailers/register" $retFields $retFiles
if ($retRes.Status -ne 201) { throw "retailer register failed ($($retRes.Status)): $($retRes.Body)" }
$retailerId = $retRes.Json.id
Write-Host "   created retailer $retailerId under $($retRes.Json.distributorName)"
if ($retRes.Json.distributorId -ne $distributorId) { throw 'retailer was not assigned to the requested distributor' }

Write-Host "== POST /api/retailers/register (no distributorId -> nearest is auto-assigned)"
$autoRes = Invoke-Multipart "$BaseUrl/api/retailers/register" @{
    name = "Auto Retailer $suffix"; cnic = "42106$suffix" + "6"; mobileNumber = "0305$suffix"
    email = "auto$suffix@example.com"; password = 'TestPass!2026'
    businessName = "Auto Parts $suffix"; ntn = "NTNA$suffix"; iban = "PK36AUTO$suffix"
    businessAddress = 'Shop 9, Test Bazaar'; latitude = $region.centerLatitude
    longitude = $region.centerLongitude
} @(@{ Field = 'businessImages'; Path = $shop2 })
if ($autoRes.Status -ne 201) { throw "auto-assign register failed ($($autoRes.Status)): $($autoRes.Body)" }
if (-not $autoRes.Json.distributorName) { throw 'auto-assign did not report a distributor' }
Write-Host "   assigned to $($autoRes.Json.distributorName) ($([math]::Round($autoRes.Json.distanceKm, 2)) km)"

$retDetail = Invoke-RestMethod "$BaseUrl/api/retailers/$retailerId" -Headers $auth
Write-Host "   profileImageUrl           : $($retDetail.profileImageUrl)"
Write-Host "   shop photos               : $($retDetail.images.Count)"
Write-Host "   distributorProfileImageUrl: $($retDetail.distributorProfileImageUrl)"
if (-not $retDetail.profileImageUrl) { throw 'retailer profileImageUrl missing' }
if ($retDetail.images.Count -ne 1) { throw 'retailer shop photo missing' }
if (-not $retDetail.distributorProfileImageUrl) { throw 'distributor photo missing on retailer detail' }

Write-Host "== lists and approval queue expose the photos"
$listed = (Invoke-RestMethod "$BaseUrl/api/distributors?search=$suffix" -Headers $auth).items |
    Where-Object { $_.id -eq $distributorId }
Write-Host "   distributor list profileImageUrl: $($listed.profileImageUrl)"
$listedRetailer = (Invoke-RestMethod "$BaseUrl/api/retailers?search=$suffix" -Headers $auth).items |
    Where-Object { $_.id -eq $retailerId }
Write-Host "   retailer list profileImageUrl   : $($listedRetailer.profileImageUrl)"
$pending = (Invoke-RestMethod "$BaseUrl/api/retailers/pending" -Headers $auth).items |
    Where-Object { $_.id -eq $retailerId }
Write-Host "   pending retailer photoCount    : $($pending.photoCount)"
if (-not $listed.profileImageUrl) { throw 'distributor list avatar missing' }
if (-not $listedRetailer.profileImageUrl) { throw 'retailer list avatar missing' }
if ($pending.photoCount -lt 1) { throw 'pending retailer photoCount missing' }

Write-Host "== registration without photos is rejected"
$noPhotos = Invoke-Multipart "$BaseUrl/api/distributors/register" @{
    name = "No Photos $suffix"; cnic = "42103$suffix" + "3"; mobileNumber = "0302$suffix"
    email = "nophoto$suffix@example.com"; password = 'TestPass!2026'
    businessName = 'No Photos Motors'; ntn = 'NTN0'; iban = 'PK36NOPHOTO'
    businessAddress = 'Nowhere'; latitude = $region.centerLatitude
    longitude = $region.centerLongitude; regionId = $region.id
} @()
if ($noPhotos.Status -ne 400) { throw "expected 400 without photos, got $($noPhotos.Status)" }
Write-Host "   400: $($noPhotos.Body)"

Write-Host "== non-image upload is rejected"
$textFile = Join-Path $tmp 'not-an-image.txt'
Set-Content -Path $textFile -Value 'hello'
$badType = Invoke-Multipart "$BaseUrl/api/distributors/register" @{
    name = "Bad Type $suffix"; cnic = "42104$suffix" + "4"; mobileNumber = "0303$suffix"
    email = "badtype$suffix@example.com"; password = 'TestPass!2026'
    businessName = 'Bad Type Motors'; ntn = 'NTN1'; iban = 'PK36BADTYPE'
    businessAddress = 'Nowhere'; latitude = $region.centerLatitude
    longitude = $region.centerLongitude; regionId = $region.id
} @(@{ Field = 'businessImages'; Path = $textFile })
if ($badType.Status -ne 400) { throw "expected 400 for non-image, got $($badType.Status)" }
Write-Host "   400: $($badType.Body)"

Write-Host "== anonymous upload to business-images is blocked"
$anon = Invoke-Multipart "$BaseUrl/api/distributors/business-images/$distributorId" @{} @(
    @{ Field = 'files'; Path = $shop2 })
if ($anon.Status -ne 401) { throw "expected 401 for anonymous upload, got $($anon.Status)" }
Write-Host "   401 as expected"

Write-Host "== staff can still add photos after approval"
$addMore = Invoke-Multipart "$BaseUrl/api/distributors/business-images/$distributorId" @{} @(
    @{ Field = 'files'; Path = $shop2 }) $login.token
if ($addMore.Status -ne 200) { throw "adding photos failed ($($addMore.Status)): $($addMore.Body)" }
$after = Invoke-RestMethod "$BaseUrl/api/distributors/$distributorId" -Headers $auth
Write-Host "   shop photos now: $($after.images.Count)"
if ($after.images.Count -ne 3) { throw 'extra photo was not added' }

Write-Host "== sent-back applicant can replace photos and resubmit"
Invoke-RestMethod "$BaseUrl/api/distributors/approve/$distributorId" -Method Post -Headers $auth `
    -ContentType 'application/json' `
    -Body (@{ decision = 'SentBackForCorrection'; remarks = 'shop photos unclear' } | ConvertTo-Json) | Out-Null
$applicant = Invoke-RestMethod "$BaseUrl/api/auth/login" -Method Post -ContentType 'application/json' `
    -Body (@{ userName = "dist$suffix@example.com"; password = 'TestPass!2026' } | ConvertTo-Json)
$replaced = Invoke-Multipart "$BaseUrl/api/distributors/profile-image/$distributorId" @{} @(
    @{ Field = 'file'; Path = $shop2 }) $applicant.token
if ($replaced.Status -ne 200) { throw "applicant profile photo replace failed ($($replaced.Status)): $($replaced.Body)" }
$addedByApplicant = Invoke-Multipart "$BaseUrl/api/distributors/business-images/$distributorId" @{} @(
    @{ Field = 'files'; Path = $shop1 }) $applicant.token
if ($addedByApplicant.Status -ne 200) { throw "applicant shop photo add failed ($($addedByApplicant.Status)): $($addedByApplicant.Body)" }
$afterCorrection = Invoke-RestMethod "$BaseUrl/api/distributors/$distributorId" -Headers $auth
Write-Host "   photos after correction: $($afterCorrection.images.Count), profile: $($afterCorrection.profileImageUrl)"
if ($afterCorrection.images.Count -ne 4) { throw 'applicant photo was not added' }

Write-Host "== the owning distributor may manage its own retailer's photos"
$ownRetailer = Invoke-Multipart "$BaseUrl/api/retailers/business-images/$retailerId" @{} @(
    @{ Field = 'files'; Path = $shop1 }) $applicant.token
if ($ownRetailer.Status -ne 200) { throw "owning distributor upload failed ($($ownRetailer.Status)): $($ownRetailer.Body)" }
Write-Host "   200 as expected"

Write-Host "== an unrelated distributor cannot touch these photos"
$otherFields = @{
    name = "Other Distributor $suffix"; cnic = "42105$suffix" + "5"; mobileNumber = "0304$suffix"
    email = "other$suffix@example.com"; password = 'TestPass!2026'
    businessName = "Other Motors $suffix"; ntn = "NTNO$suffix"; iban = "PK36OTHER$suffix"
    businessAddress = 'Other Road, Test City'; latitude = $region.centerLatitude
    longitude = $region.centerLongitude; regionId = $region.id
}
$otherRes = Invoke-Multipart "$BaseUrl/api/distributors/register" $otherFields @(
    @{ Field = 'businessImages'; Path = $shop1 })
if ($otherRes.Status -ne 201) { throw "second distributor register failed ($($otherRes.Status)): $($otherRes.Body)" }
Invoke-RestMethod "$BaseUrl/api/distributors/approve/$($otherRes.Json.id)" -Method Post -Headers $auth `
    -ContentType 'application/json' -Body (@{ decision = 'Approved' } | ConvertTo-Json) | Out-Null
$otherLogin = Invoke-RestMethod "$BaseUrl/api/auth/login" -Method Post -ContentType 'application/json' `
    -Body (@{ userName = "other$suffix@example.com"; password = 'TestPass!2026' } | ConvertTo-Json)

$crossDistributor = Invoke-Multipart "$BaseUrl/api/distributors/business-images/$distributorId" @{} @(
    @{ Field = 'files'; Path = $shop1 }) $otherLogin.token
if ($crossDistributor.Status -ne 403) { throw "expected 403 for other distributor, got $($crossDistributor.Status)" }
$crossRetailer = Invoke-Multipart "$BaseUrl/api/retailers/business-images/$retailerId" @{} @(
    @{ Field = 'files'; Path = $shop1 }) $otherLogin.token
if ($crossRetailer.Status -ne 403) { throw "expected 403 for other distributor's retailer, got $($crossRetailer.Status)" }
Write-Host "   403 on both as expected"

Write-Host ""
Write-Host "ALL CHECKS PASSED" -ForegroundColor Green
