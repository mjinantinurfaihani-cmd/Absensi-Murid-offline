# Panduan Teknis: Implementasi Sync Multi-Destination

## 📁 File Structure

```
src/
├── sync.ts              # Sync ke Server API lokal
├── enhancedSync.ts      # ✨ NEW: Master sync ke Server + Firebase + GitHub
├── firebaseStore.ts     # Sync ke Firebase Firestore
├── App.tsx              # Updated: Sync button + Settings UI
└── sqlStore.ts          # SQL sync
```

## 🔧 Core Functions

### `enhancedSync.ts` - Master Sync Service

```typescript
// Main function - sinkronisasi ke semua destination
export async function syncAllDestinations(): Promise<SyncResult>

// Internal sync functions
async function syncToServer(): Promise<number>
async function syncToFirebase(): Promise<number>
async function syncToGithub(): Promise<number>

// GitHub management
export async function setupGithub(token, username, repo): Promise<boolean>
export async function getGithubStatus(): Promise<{...}>
export function clearGithubCredentials(): void
```

### Data Flow

```
┌─────────────────┐
│  IndexedDB      │
│ (Local Cache)   │
└────────┬────────┘
         │ (read all data)
         ▼
┌─────────────────────────────────────┐
│  syncAllDestinations()              │
│  Master Sync Coordinator            │
└────┬──────────────────┬─────────┬───┘
     │                  │         │
     ▼                  ▼         ▼
┌─────────────┐  ┌────────────┐  ┌───────────┐
│ syncToServer│  │ syncToFire │  │ syncToGit │
│   (API)     │  │   base     │  │   Hub     │
└─────────────┘  └────────────┘  └───────────┘
     │                  │             │
     ▼                  ▼             ▼
┌─────────────┐  ┌────────────┐  ┌───────────┐
│ Server API  │  │ Firebase   │  │ GitHub    │
│  (JSON)     │  │ Firestore  │  │   API     │
└─────────────┘  └────────────┘  └───────────┘
```

## 📡 API Calls - GitHub

GitHub sync menggunakan **GitHub REST API v3** dengan token authentication:

### 1. Get Latest Commit SHA
```
GET /repos/{user}/{repo}/git/refs/heads/main
→ Dapatkan latest commit SHA
```

### 2. Get Commit Tree
```
GET /repos/{user}/{repo}/git/commits/{sha}
→ Dapatkan tree SHA dari commit
```

### 3. Create Blob (File Content)
```
POST /repos/{user}/{repo}/git/blobs
Body: { content, encoding: "utf-8" }
→ Upload file content, dapatkan blob SHA
```

### 4. Create Tree
```
POST /repos/{user}/{repo}/git/trees
Body: {
  base_tree: parent_tree_sha,
  tree: [{ path, mode, type, sha }]
}
→ Create tree dengan file baru
```

### 5. Create Commit
```
POST /repos/{user}/{repo}/git/commits
Body: {
  message,
  tree: new_tree_sha,
  parents: [parent_commit_sha]
}
→ Create commit baru
```

### 6. Update Ref (Push)
```
PATCH /repos/{user}/{repo}/git/refs/heads/main
Body: { sha: new_commit_sha, force: false }
→ Update branch pointer ke commit baru
```

## 🔑 LocalStorage Keys

| Key | Value | Usage |
|-----|-------|-------|
| `githubToken` | Personal Access Token | Authentication |
| `githubUsername` | e.g., `mjinantinurfaihani-cmd` | Repository owner |
| `githubRepo` | e.g., `Absensi-Murid-offline` | Repository name |
| `lastSync` | ISO timestamp | Last server sync |
| `lastGithubSync` | ISO timestamp | Last GitHub sync |
| `lastFullSync` | ISO timestamp | Last full sync |
| `serverUrl` | e.g., `https://api.local` | Server endpoint |

## 🔄 Sync Flow - Step by Step

### Scenario: User clicks "Sinkronkan" button

1. **Button Click** (App.tsx line 462)
   ```tsx
   onClick={() => syncAllDestinations()...}
   ```

2. **Master Sync Starts** (enhancedSync.ts)
   ```typescript
   async function syncAllDestinations() {
     // Start performance timer
     const startTime = performance.now();
     
     // Run all syncs in parallel (Promise.all)
     const [serverCount, firebaseCount, githubCount] = 
       await Promise.all([...]);
     
     // Compile result
     return { server, firebase, github, total, status, message };
   }
   ```

3. **Three Parallel Syncs**

   **A. syncToServer()**
   - Calls existing `syncAll()` function from sync.ts
   - Returns count of items sent

   **B. syncToFirebase()**
   - Fetch all non-deleted students & teachers
   - Publish to Firebase using `publishInitialData()`
   - Returns count of items published

   **C. syncToGithub()**
   - Load all data from IndexedDB
   - Format as JSON (with timestamp & summary)
   - Use GitHub API to:
     - Get latest commit info
     - Create blob with data
     - Create tree with file
     - Create new commit
     - Push to main branch
   - Returns count of items synced

4. **Result Collection**
   ```typescript
   {
     server: 45,        // From syncToServer
     firebase: 90,      // From syncToFirebase
     github: 5230,      // From syncToGithub
     total: 5365,
     status: 'success',
     message: '✓ Sinkronisasi selesai...'
   }
   ```

5. **Toast Notification** (App.tsx)
   ```tsx
   showToast(result.status === 'success' ? 'success' : 'warning', 
             result.message)
   ```

## ⚙️ Configuration - User Setup

### Settings Component (App.tsx)

Added state variables:
```typescript
const [githubToken, setGithubToken] = useState(...)
const [githubUsername, setGithubUsername] = useState(...)
const [githubRepo, setGithubRepo] = useState(...)
const [testingGithub, setTestingGithub] = useState(false)
```

Added functions:
```typescript
// Validate and save GitHub config
async function saveGithubConfig() {
  const { setupGithub } = await import('./enhancedSync');
  await setupGithub(githubToken, githubUsername, githubRepo);
}

// Clear GitHub config
function clearGithubConfig() {
  localStorage.removeItem('githubToken');
  localStorage.removeItem('githubUsername');
  localStorage.removeItem('githubRepo');
}
```

### GitHub Config Section UI

```html
<section className="card form">
  <h2>Sinkronisasi GitHub</h2>
  <label>GitHub Personal Access Token
    <input type="password" value={githubToken} 
           onChange={e => setGithubToken(e.target.value)} />
  </label>
  <label>GitHub Username
    <input type="text" value={githubUsername} />
  </label>
  <label>Repository Name
    <input type="text" value={githubRepo} />
  </label>
  <button onClick={() => saveGithubConfig()}>
    Simpan Konfigurasi GitHub
  </button>
  {githubToken && <button onClick={clearGithubConfig}>
    Hapus Konfigurasi
  </button>}
</section>
```

## 🧪 Testing

### Manual Test Steps

1. **Setup GitHub**
   - Go to Settings → Sinkronisasi GitHub
   - Enter valid token, username, repo
   - Click "Simpan Konfigurasi GitHub"
   - Should see: `✓ GitHub configured: username/repo`

2. **Test Sync**
   - Add some attendance records
   - Click "Sinkronkan (Server + Firebase + Git)"
   - Should see message with counts

3. **Verify GitHub**
   - Open GitHub repo
   - Check `data-sync/sync-data-YYYY-MM-DD.json`
   - Verify data content matches

4. **Check Console**
   ```javascript
   // F12 → Console
   console.log(localStorage.getItem('lastGithubSync'))
   ```

### Edge Cases to Test

1. **Invalid token** → Error handling
2. **Network offline** → Graceful failure
3. **No GitHub config** → Skip GitHub, sync server+firebase only
4. **Repo not found** → Error message
5. **Duplicate sync** → Should create new file with timestamp

## 🚀 Performance Optimization

### Parallel Execution
```typescript
// All three syncs happen in parallel, not sequential
const [s1, s2, s3] = await Promise.all([
  syncToServer(),
  syncToFirebase(),
  syncToGithub()
]);
// Instead of:
// const s1 = await syncToServer();
// const s2 = await syncToFirebase();
// const s3 = await syncToGithub();
```

### Result Timing
- Performance timer tracks total time
- Example: `Sinkronisasi selesai (123ms):`

### Data Filtering
```typescript
// Only sync non-deleted records
const students = await db.students.filter(s => !s.deleted).toArray();
const teachers = await db.teachers.filter(t => !t.deleted).toArray();
```

## 🔐 Security Considerations

### Token Storage
- Stored in browser localStorage
- Only transmitted over HTTPS
- Never logged or exposed in console
- Displayed as `••••••••` in UI

### Token Scope
```
Required: repo, workflow
- repo: Full access to repositories
- workflow: Access to Actions/CI
```

### Network Security
- GitHub API endpoint: `https://api.github.com` (HTTPS only)
- All requests require valid token in Authorization header
- Firebase uses existing credentials
- Server uses local trusted endpoint

## 📈 Future Enhancements

Possible improvements:
1. Schedule automatic sync (e.g., every hour)
2. Selective sync (choose what to sync)
3. Sync history/log viewer
4. GitHub branch selection (not just main)
5. Compression for large datasets
6. Incremental sync (only new/changed data)
7. Multi-branch support
8. GitHub Actions triggers

---

**Last Updated**: 2026-08-29  
**Status**: Implemented & Tested  
**Build Status**: ✅ Success
