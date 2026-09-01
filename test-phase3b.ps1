# Phase 3B Testing Script
# Tests both Phase 2 data sync + Phase 3A validation

$baseUrl = "http://localhost:4174"
$results = @()

Write-Host "========================================" -ForegroundColor Green
Write-Host "Phase 3B: Comprehensive Testing" -ForegroundColor Green
Write-Host "========================================`n"

# ==========================================
# PHASE 2: DATA SYNC INTEGRITY TESTS
# ==========================================

Write-Host "PHASE 2: Data Sync Integrity Tests" -ForegroundColor Cyan
Write-Host "-----------------------------------`n"

# Clear test data
"[]" | Set-Content server/data/students.json
Write-Host "✓ Cleared students.json"

# Scenario 1: Multi-Device Timestamp Ordering
Write-Host "`n[Scenario 1] Multi-Device Timestamp Ordering" -ForegroundColor Yellow
Write-Host "Test: Latest timestamp should win (numeric comparison, not string)"

$body1 = @"
[{"id":"s1","nisn":"12345","namaLengkap":"Alice","updatedAt":"2025-01-09T10:00:00.000Z","deleted":0,"synced":1}]
"@

try {
    $r1 = Invoke-WebRequest -Uri "$baseUrl/api/sync/students" -Method POST -ContentType "application/json" -Body $body1 -UseBasicParsing
    Write-Host "Device A (T1=10:00:00) → Status $($r1.StatusCode): $($r1.Content | ConvertFrom-Json | Select-Object -Property ok, count, synced | ConvertTo-Json -Compress)"
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
}

Start-Sleep -Milliseconds 100

$body2 = @"
[{"id":"s1","nisn":"12345","namaLengkap":"Alice Updated","updatedAt":"2025-01-09T10:00:05.000Z","deleted":0,"synced":1}]
"@

try {
    $r2 = Invoke-WebRequest -Uri "$baseUrl/api/sync/students" -Method POST -ContentType "application/json" -Body $body2 -UseBasicParsing
    Write-Host "Device B (T2=10:00:05) → Status $($r2.StatusCode): $($r2.Content | ConvertFrom-Json | Select-Object -Property ok, count, synced | ConvertTo-Json -Compress)"
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
}

Start-Sleep -Milliseconds 100

$body3 = @"
[{"id":"s1","nisn":"12345","namaLengkap":"Alice Old","updatedAt":"2025-01-09T09:59:55.000Z","deleted":0,"synced":1}]
"@

try {
    $r3 = Invoke-WebRequest -Uri "$baseUrl/api/sync/students" -Method POST -ContentType "application/json" -Body $body3 -UseBasicParsing
    Write-Host "Device C (T3=09:59:55) → Status $($r3.StatusCode): $($r3.Content | ConvertFrom-Json | Select-Object -Property ok, count, synced | ConvertTo-Json -Compress)"
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
}

# Check result
$students = Get-Content server/data/students.json | ConvertFrom-Json
if ($students.Count -gt 0) {
    $result = $students[0]
    $pass = $result.namaLengkap -eq "Alice Updated"
    $status = if ($pass) { "✅ PASS" } else { "❌ FAIL" }
    Write-Host "Expected namaLengkap: 'Alice Updated', Got: '$($result.namaLengkap)' $status"
    Write-Host "Timestamp: $($result.updatedAt)"
    $results += @{ test = "Scenario 1: Numeric Timestamps"; pass = $pass; expected = "Alice Updated"; actual = $result.namaLengkap }
} else {
    Write-Host "❌ FAIL: No records in students.json" -ForegroundColor Red
    $results += @{ test = "Scenario 1: Numeric Timestamps"; pass = $false; expected = "Alice Updated"; actual = "No records" }
}

# Scenario 2: Soft-Delete Permanence
Write-Host "`n[Scenario 2] Soft-Delete Permanence" -ForegroundColor Yellow
Write-Host "Test: Deleted record cannot be un-deleted by equal/older timestamps"

@"
[{"id":"s2","nisn":"54321","namaLengkap":"Bob","deleted":0,"updatedAt":"2025-01-09T10:00:00.000Z","synced":1}]
"@ | Set-Content server/data/students.json

$body4 = @"
[{"id":"s2","nisn":"54321","deleted":1,"updatedAt":"2025-01-09T10:00:00.000Z","synced":0}]
"@

try {
    $r4 = Invoke-WebRequest -Uri "$baseUrl/api/sync/students" -Method POST -ContentType "application/json" -Body $body4 -UseBasicParsing
    Write-Host "Device A Delete (T1) → Status $($r4.StatusCode)"
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
}

Start-Sleep -Milliseconds 100

$body5 = @"
[{"id":"s2","nisn":"54321","namaLengkap":"Bob","deleted":0,"updatedAt":"2025-01-09T10:00:00.000Z","synced":1}]
"@

try {
    $r5 = Invoke-WebRequest -Uri "$baseUrl/api/sync/students" -Method POST -ContentType "application/json" -Body $body5 -UseBasicParsing
    Write-Host "Device B Resurrect (T1) → Status $($r5.StatusCode) - Should be ignored"
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
}

Start-Sleep -Milliseconds 100

$body6 = @"
[{"id":"s2","nisn":"54321","namaLengkap":"Bob","deleted":0,"updatedAt":"2025-01-09T09:59:59.999Z","synced":1}]
"@

try {
    $r6 = Invoke-WebRequest -Uri "$baseUrl/api/sync/students" -Method POST -ContentType "application/json" -Body $body6 -UseBasicParsing
    Write-Host "Device C Resurrect (older) → Status $($r6.StatusCode) - Should be ignored"
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
}

# Check result
$students = Get-Content server/data/students.json | ConvertFrom-Json
if ($students.Count -gt 0) {
    $result = $students[0]
    $pass = $result.deleted -eq 1 -and $result.updatedAt -eq "2025-01-09T10:00:00.000Z"
    $status = if ($pass) { "✅ PASS" } else { "❌ FAIL" }
    Write-Host "Expected deleted=1, Got deleted=$($result.deleted) $status"
    $results += @{ test = "Scenario 2: Soft-Delete Permanence"; pass = $pass; expected = "deleted=1"; actual = "deleted=$($result.deleted)" }
} else {
    Write-Host "❌ FAIL: No records" -ForegroundColor Red
    $results += @{ test = "Scenario 2: Soft-Delete Permanence"; pass = $false; expected = "deleted=1"; actual = "No records" }
}

# Scenario 3: Newer Delete Override
Write-Host "`n[Scenario 3] Newer Delete Override" -ForegroundColor Yellow
Write-Host "Test: Newer delete timestamp overrides old data"

@"
[{"id":"s3","nisn":"99999","namaLengkap":"Charlie","deleted":0,"updatedAt":"2025-01-09T10:00:00.000Z","synced":1}]
"@ | Set-Content server/data/students.json

$body7 = @"
[{"id":"s3","nisn":"99999","namaLengkap":"Charlie","deleted":0,"updatedAt":"2025-01-09T10:00:00.000Z","synced":1}]
"@

try {
    $r7 = Invoke-WebRequest -Uri "$baseUrl/api/sync/students" -Method POST -ContentType "application/json" -Body $body7 -UseBasicParsing
    Write-Host "Device A Update (T1) → Status $($r7.StatusCode)"
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
}

Start-Sleep -Milliseconds 100

$body8 = @"
[{"id":"s3","deleted":1,"updatedAt":"2025-01-09T10:00:05.000Z","synced":0}]
"@

try {
    $r8 = Invoke-WebRequest -Uri "$baseUrl/api/sync/students" -Method POST -ContentType "application/json" -Body $body8 -UseBasicParsing
    Write-Host "Device B Delete (T2, newer) → Status $($r8.StatusCode)"
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
}

Start-Sleep -Milliseconds 100

$body9 = @"
[{"id":"s3","nisn":"99999","namaLengkap":"Charlie","deleted":0,"updatedAt":"2025-01-09T10:00:00.000Z","synced":1}]
"@

try {
    $r9 = Invoke-WebRequest -Uri "$baseUrl/api/sync/students" -Method POST -ContentType "application/json" -Body $body9 -UseBasicParsing
    Write-Host "Device C Update (T1, old) → Status $($r9.StatusCode) - Should be rejected"
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
}

# Check result
$students = Get-Content server/data/students.json | ConvertFrom-Json
if ($students.Count -gt 0) {
    $result = $students[0]
    $pass = $result.deleted -eq 1 -and $result.updatedAt -eq "2025-01-09T10:00:05.000Z"
    $status = if ($pass) { "✅ PASS" } else { "❌ FAIL" }
    Write-Host "Expected deleted=1 with T2, Got deleted=$($result.deleted) at $($result.updatedAt) $status"
    $results += @{ test = "Scenario 3: Newer Delete Override"; pass = $pass; expected = "deleted=1, T2"; actual = "deleted=$($result.deleted), $($result.updatedAt)" }
} else {
    Write-Host "❌ FAIL: No records" -ForegroundColor Red
    $results += @{ test = "Scenario 3: Newer Delete Override"; pass = $false; expected = "deleted=1, T2"; actual = "No records" }
}

# ==========================================
# PHASE 3A: REQUEST VALIDATION TESTS
# ==========================================

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "PHASE 3A: Request Validation Tests" -ForegroundColor Green
Write-Host "========================================"

# Test 1: Content-Type Validation
Write-Host "`n[Test 1] Content-Type Validation" -ForegroundColor Yellow
Write-Host "Expected: 400 Bad Request for non-JSON"

try {
    $r = Invoke-WebRequest -Uri "$baseUrl/api/sync/students" -Method POST -ContentType "text/plain" -Body '[{"id":"test1"}]' -UseBasicParsing -ErrorAction SilentlyContinue
    $status = $r.StatusCode
    $content = $r.Content
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    $content = $_.Exception.Response.StatusDescription
}

Write-Host "Status: $status"
$pass = $status -eq 400
$status_text = if ($pass) { "✅ PASS" } else { "❌ FAIL" }
Write-Host "Expected 400, Got $status $status_text"
$results += @{ test = "Test 1: Content-Type"; pass = $pass; expected = "400"; actual = $status }

# Test 2: Payload Size Validation
Write-Host "`n[Test 2] Payload Size Validation" -ForegroundColor Yellow
Write-Host "Expected: 413 Payload Too Large for >10MB"

$largeBody = @"
[{"id":"x","nisn":"$('x' * 1000000)"}]
"@

try {
    $r = Invoke-WebRequest -Uri "$baseUrl/api/sync/students" -Method POST -ContentType "application/json" -Body $largeBody -UseBasicParsing -ErrorAction SilentlyContinue
    $status = $r.StatusCode
} catch {
    $status = $_.Exception.Response.StatusCode.value__
}

Write-Host "Payload size: $($largeBody.Length) bytes"
Write-Host "Status: $status"
$pass = $status -eq 413
$status_text = if ($pass) { "✅ PASS" } else { "❌ FAIL" }
Write-Host "Expected 413, Got $status $status_text"
$results += @{ test = "Test 2: Payload Size"; pass = $pass; expected = "413"; actual = $status }

# Test 3: Table Name Validation
Write-Host "`n[Test 3] Table Name Validation" -ForegroundColor Yellow
Write-Host "Expected: 400 Bad Request for invalid table"

try {
    $r = Invoke-WebRequest -Uri "$baseUrl/api/sync/malicious" -Method POST -ContentType "application/json" -Body '[{"id":"test"}]' -UseBasicParsing -ErrorAction SilentlyContinue
    $status = $r.StatusCode
} catch {
    $status = $_.Exception.Response.StatusCode.value__
}

Write-Host "Status: $status"
$pass = $status -eq 400
$status_text = if ($pass) { "✅ PASS" } else { "❌ FAIL" }
Write-Host "Expected 400, Got $status $status_text"
$results += @{ test = "Test 3: Table Name"; pass = $pass; expected = "400"; actual = $status }

# Test 4: Rate Limiting
Write-Host "`n[Test 4] Rate Limiting" -ForegroundColor Yellow
Write-Host "Expected: 429 Too Many Requests on request 51+ (limit 50/min)"

$rateLimitPassed = $true
$testBody = '[{"id":"test-rate","nisn":"123"}]'

for ($i = 1; $i -le 51; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "$baseUrl/api/sync/students" -Method POST -ContentType "application/json" -Body $testBody -UseBasicParsing -ErrorAction SilentlyContinue
        $status = $r.StatusCode
        
        if ($i -le 50) {
            if ($status -ne 200) {
                Write-Host "Request $i failed with $status (expected 200)"
                $rateLimitPassed = $false
                break
            }
        } else {
            # Request 51 should fail
            if ($status -ne 429) {
                Write-Host "Request $i got $status (expected 429 after 50 requests)"
                $rateLimitPassed = $false
            }
        }
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        if ($i -le 50 -and $status -ne 200) {
            Write-Host "Request $i error: $status (expected 200)"
            $rateLimitPassed = $false
            break
        } elseif ($i -eq 51 -and $status -ne 429) {
            Write-Host "Request $i error: $status (expected 429)"
            $rateLimitPassed = $false
        }
    }
    
    if ($i -eq 50 -or $i -eq 51) {
        Write-Host "Request $i: $status"
    }
}

$status_text = if ($rateLimitPassed) { "✅ PASS" } else { "❌ FAIL" }
Write-Host "Rate limiting test $status_text"
$results += @{ test = "Test 4: Rate Limiting"; pass = $rateLimitPassed; expected = "50 OK then 429"; actual = if ($rateLimitPassed) { "Correct" } else { "Failed" } }

# Test 5: Required Field Validation
Write-Host "`n[Test 5] Required Field Validation (Attendance)" -ForegroundColor Yellow
Write-Host "Expected: 400 Bad Request for missing required fields"

# Missing studentId
try {
    $r = Invoke-WebRequest -Uri "$baseUrl/api/sync/attendance" -Method POST -ContentType "application/json" -Body '[{"id":"att1","tanggal":"2025-01-09","status":"hadir"}]' -UseBasicParsing -ErrorAction SilentlyContinue
    $status = $r.StatusCode
} catch {
    $status = $_.Exception.Response.StatusCode.value__
}

Write-Host "Missing studentId: Status $status"
$pass1 = $status -eq 400
$status_text = if ($pass1) { "✅ PASS" } else { "❌ FAIL" }
Write-Host "Expected 400 $status_text`n"

# Missing tanggal
try {
    $r = Invoke-WebRequest -Uri "$baseUrl/api/sync/attendance" -Method POST -ContentType "application/json" -Body '[{"id":"att1","studentId":"s1","status":"hadir"}]' -UseBasicParsing -ErrorAction SilentlyContinue
    $status = $r.StatusCode
} catch {
    $status = $_.Exception.Response.StatusCode.value__
}

Write-Host "Missing tanggal: Status $status"
$pass2 = $status -eq 400
$status_text = if ($pass2) { "✅ PASS" } else { "❌ FAIL" }
Write-Host "Expected 400 $status_text`n"

# Missing status
try {
    $r = Invoke-WebRequest -Uri "$baseUrl/api/sync/attendance" -Method POST -ContentType "application/json" -Body '[{"id":"att1","studentId":"s1","tanggal":"2025-01-09"}]' -UseBasicParsing -ErrorAction SilentlyContinue
    $status = $r.StatusCode
} catch {
    $status = $_.Exception.Response.StatusCode.value__
}

Write-Host "Missing status: Status $status"
$pass3 = $status -eq 400
$status_text = if ($pass3) { "✅ PASS" } else { "❌ FAIL" }
Write-Host "Expected 400 $status_text"

$pass = $pass1 -and $pass2 -and $pass3
$results += @{ test = "Test 5: Required Fields"; pass = $pass; expected = "3x 400"; actual = if ($pass) { "All correct" } else { "Some failed" } }

# Test 6: Valid Request Success
Write-Host "`n[Test 6] Valid Request Success" -ForegroundColor Yellow
Write-Host "Expected: 200 OK with proper response"

try {
    $r = Invoke-WebRequest -Uri "$baseUrl/api/sync/students" -Method POST -ContentType "application/json" -Body '[{"id":"student-valid","nisn":"99999","namaLengkap":"Valid Student","updatedAt":"2025-01-09T10:00:00.000Z"}]' -UseBasicParsing -ErrorAction SilentlyContinue
    $status = $r.StatusCode
    $content = $r.Content | ConvertFrom-Json
    $hasValidResponse = $content.ok -eq $true -and $content.count -eq 1 -and $content.synced -gt 0
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    $hasValidResponse = $false
}

Write-Host "Status: $status"
$pass = $status -eq 200 -and $hasValidResponse
$status_text = if ($pass) { "✅ PASS" } else { "❌ FAIL" }
Write-Host "Expected 200 with ok=true $status_text"
$results += @{ test = "Test 6: Valid Request"; pass = $pass; expected = "200 ok=true"; actual = if ($hasValidResponse) { "Correct" } else { "Failed" } }

# Summary
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "TEST SUMMARY" -ForegroundColor Green
Write-Host "========================================"

$passCount = ($results | Where-Object { $_.pass } | Measure-Object).Count
$totalCount = $results.Count

Write-Host "`nResults:"
foreach ($r in $results) {
    $icon = if ($r.pass) { "✅" } else { "❌" }
    Write-Host "$icon $($r.test) - $($r.actual)"
}

Write-Host "`nTotal: $passCount / $totalCount tests passed" -ForegroundColor $(if ($passCount -eq $totalCount) { "Green" } else { "Yellow" })

if ($passCount -eq $totalCount) {
    Write-Host "🎉 All tests PASSED!" -ForegroundColor Green
} else {
    Write-Host "⚠️  Some tests failed. Review output above." -ForegroundColor Yellow
}
