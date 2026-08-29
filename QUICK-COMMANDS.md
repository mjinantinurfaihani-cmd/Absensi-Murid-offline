# ⚡ QUICK COMMANDS REFERENCE

**Copy-paste ready commands for common tasks**

---

## 🚀 START SERVERS

### Terminal 1: Start HTTPS Data Server

```bash
npm run server
```

**Expected output:**
```
✓ Server running at https://localhost:9005
✓ Endpoints available: /api/data/students, /api/data/teachers, /api/data/attendance
```

### Terminal 2: Start React Dev UI

```bash
npm run dev
```

**Expected output:**
```
➜  Local:   http://127.0.0.1:5173/
➜  ready in 234ms
```

---

## 📤 EXECUTE SYNC

### Option 1: Via Node.js Script (FASTEST) ⭐

```bash
npx tsx sync-firebase-rate-limited.ts
```

**Expected duration:** 2-3 minutes  
**Expected output:** Progress bar with emoji logging

### Option 2: Via Browser UI

```
1. Open: https://localhost:5173
2. Login dengan akun Anda
3. Klik Settings ⚙️
4. Enable: "Sinkronkan ke Firebase Firestore"
5. Klik: "Sinkronkan (Server + Firebase + Git)"
6. Wait: 3-5 minutes
7. Monitor: Toast notifications
```

**Expected duration:** 3-5 minutes  
**Expected visual:** Green toast "Sinkronisasi selesai"

---

## ✅ VERIFY RESULTS

### Check Server Still Responding

```bash
curl https://localhost:9005/api/data/students -k | jq 'length'
```

**Expected output:** `916` (number of students)

### Check All Endpoints

```bash
echo "Students:" && curl https://localhost:9005/api/data/students -k | jq 'length'
echo "Teachers:" && curl https://localhost:9005/api/data/teachers -k | jq 'length'
echo "Attendance:" && curl https://localhost:9005/api/data/attendance -k | jq 'length'
```

**Expected output:**
```
Students: 916
Teachers: 21
Attendance: 212
```

### Verify Firebase (Browser)

```
1. Open: https://console.firebase.google.com/
2. Project: absensi-murid-268
3. Firestore Database → Collections
4. Select: data-sync
5. Should see: ~1,149 documents
```

---

## 🔧 TROUBLESHOOTING

### If quota error:

**Option A: Wait 24h (free)**
```bash
# Set reminder for tomorrow, then:
npx tsx sync-firebase-rate-limited.ts
```

**Option B: Upgrade to Blaze (fast) ⭐**
```
1. Go: https://console.firebase.google.com/
2. Menu: Settings > Billing
3. Click: "Upgrade to Blaze"
4. Add: Payment method
5. Wait: ~2 minutes for upgrade
6. Then: npx tsx sync-firebase-rate-limited.ts
```

**Option C: Optimize script (slow)**
```typescript
// Edit sync-firebase-rate-limited.ts
// Line 33: change BATCH_SIZE = 100 to BATCH_SIZE = 50
// Line 34: change BATCH_DELAY_MS = 3000 to BATCH_DELAY_MS = 5000

// Then run:
npx tsx sync-firebase-rate-limited.ts
```

### If server not found:

```bash
# Kill any existing servers
pkill -f "node"
pkill -f "http"

# Restart fresh
npm run server
```

### If connection refused:

```bash
# Check port 9005 is available
netstat -an | grep 9005

# If in use, restart:
npm run server
```

---

## 📊 USEFUL CURL COMMANDS

### Get student count
```bash
curl https://localhost:9005/api/data/students -k | jq 'length'
```

### Get teacher count
```bash
curl https://localhost:9005/api/data/teachers -k | jq 'length'
```

### Get attendance count
```bash
curl https://localhost:9005/api/data/attendance -k | jq 'length'
```

### Get first student
```bash
curl https://localhost:9005/api/data/students -k | jq '.[0]'
```

### Count deleted records
```bash
curl https://localhost:9005/api/data/students -k | jq '[.[] | select(.deleted == true)] | length'
```

---

## 🌐 BROWSER SHORTCUTS

### Development Servers

```
React Dev UI:        https://localhost:5173
Data API Server:     https://localhost:9005
Firebase Console:    https://console.firebase.google.com/
Production App:      https://absensi-murid-268.web.app
```

### API Endpoints

```
Students:   https://localhost:9005/api/data/students
Teachers:   https://localhost:9005/api/data/teachers
Attendance: https://localhost:9005/api/data/attendance
```

---

## 📝 COMMON WORKFLOWS

### Complete Sync Workflow

```bash
# Terminal 1: Start server
npm run server

# Terminal 2: Run sync
npx tsx sync-firebase-rate-limited.ts

# Terminal 3: Verify (while sync running)
watch -n 2 'curl https://localhost:9005/api/data/students -k | jq length'
```

### Quick Status Check

```bash
# Are servers running?
curl https://localhost:9005 -k 2>/dev/null && echo "✅ Server OK" || echo "❌ Server DOWN"

# Is React dev UI running?
curl https://localhost:5173 -k 2>/dev/null && echo "✅ UI OK" || echo "❌ UI DOWN"

# Data counts
curl https://localhost:9005/api/data/students -k | jq 'length' 2>/dev/null | sed 's/^/Students: /'
```

### Firebase Verification

```bash
# Count documents in data-sync collection (requires Firebase CLI)
firebase firestore:indexes --project=absensi-murid-268

# Or view in console:
# https://console.firebase.google.com/project/absensi-murid-268/firestore
```

---

## 🎯 DECISION TREE

```
Do you want to sync NOW?
│
├─ YES, use Browser UI → npm run dev, then click Sinkronkan
├─ YES, use Script → npx tsx sync-firebase-rate-limited.ts
├─ NO, optimize first → Edit batch values, then run script
└─ LATER, wait 24h → Set reminder, then run tomorrow

Is Firebase quota an issue?
│
├─ YES → Upgrade to Blaze (~$0.0007, 5 min)
├─ YES → Wait 24 hours (free)
├─ NO → Proceed with sync immediately
└─ MAYBE → Read FIREBASE-QUOTA-SOLUTIONS.md first
```

---

## 📋 COMMAND CHEAT SHEET

| Task | Command |
|------|---------|
| Start server | `npm run server` |
| Start UI | `npm run dev` |
| Run sync | `npx tsx sync-firebase-rate-limited.ts` |
| Count students | `curl https://localhost:9005/api/data/students -k \| jq 'length'` |
| Count teachers | `curl https://localhost:9005/api/data/teachers -k \| jq 'length'` |
| Count attendance | `curl https://localhost:9005/api/data/attendance -k \| jq 'length'` |
| Get first student | `curl https://localhost:9005/api/data/students -k \| jq '.[0]'` |
| Kill server | `pkill -f "npm run server"` |
| View Firebase | `https://console.firebase.google.com/project/absensi-murid-268` |

---

## ✨ QUICK START (5 MINUTES)

```bash
# 1. Terminal 1: Start server
npm run server
# Wait for "ready" message

# 2. Terminal 2: Run sync
npx tsx sync-firebase-rate-limited.ts
# Watch progress bar...
# Wait for "SINKRONISASI SELESAI!"

# 3. Verify
# Open: https://console.firebase.google.com/
# Project: absensi-murid-268
# Collection: data-sync
# Check: ~1,149 documents

✅ DONE!
```

---

## 🆘 EMERGENCY RESET

If everything breaks:

```bash
# Kill all Node processes
pkill -f node

# Clear npm cache
npm cache clean --force

# Reinstall dependencies
npm install

# Restart servers
npm run server
```

---

## 💡 PERFORMANCE TIPS

```bash
# Monitor sync in real-time (new terminal):
tail -f sync-progress.log

# Check system resources:
top -o %CPU

# Speed up sync (if server is slow):
# Edit sync-firebase-rate-limited.ts
# Increase BATCH_SIZE from 100 to 200
# Decrease BATCH_DELAY_MS from 3000 to 1000
```

---

## 📞 COMMON ISSUES & QUICK FIXES

| Issue | Fix |
|-------|-----|
| "ECONNREFUSED" | Run `npm run server` |
| "RESOURCE_EXHAUSTED" | Wait 24h or upgrade to Blaze |
| "Port 9005 in use" | `lsof -i :9005` then kill process |
| "Certificate error" | Normal for localhost, use `-k` flag in curl |
| "Timeout" | Server might be slow, wait & retry |
| "No data" | Check server endpoints: `curl https://localhost:9005/api/data/students -k` |

---

**Need more help?**

📖 Read: [FILE-INDEX.md](FILE-INDEX.md) for full documentation  
💡 Check: [FIREBASE-QUOTA-SOLUTIONS.md](FIREBASE-QUOTA-SOLUTIONS.md) for quota issues  
🚀 Start: [SYNC-QUICK-START.md](SYNC-QUICK-START.md) for step-by-step guide  

---

*Last updated: 2026-08-29*  
*Copy-paste ready for terminal use* ✅
