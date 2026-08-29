# How to Fix Login Issues

## Problem
The app uses IndexedDB (browser cache) that may have old admin credentials. The seed function only runs once when the database is empty.

## Solution 1: Clear Browser Cache (Quickest)

### Google Chrome / Edge / Brave:
1. Open the app in browser
2. Press **F12** to open Developer Tools
3. Go to **Application** tab (or **Storage** tab)
4. Click **IndexedDB** in the left sidebar
5. Expand and delete **absensi_offline_db** database
6. Refresh the page (F5 or Ctrl+R)
7. Try logging in with new credentials: `admin` / `admin123`

### Firefox:
1. Open the app in browser
2. Press **F12** to open Developer Tools
3. Go to **Storage** tab
4. Click **IndexedDB** in the left sidebar
5. Right-click **absensi_offline_db** and delete it
6. Refresh the page (F5)
7. Try logging in with: `admin` / `admin123`

### Safari:
1. Open Safari menu → Preferences → Advanced
2. Check "Show Develop menu in menu bar"
3. Click Develop → Empty Caches
4. Refresh the page (Cmd+R)
5. Try logging in with: `admin` / `admin123`

## Solution 2: Clear via Console

If you prefer using JavaScript:

1. Open Developer Tools (F12)
2. Go to **Console** tab
3. Paste and run:
   ```javascript
   // Clear IndexedDB
   const dbs = await window.indexedDB.databases?.();
   for (const db of dbs || []) {
     window.indexedDB.deleteDatabase(db.name);
   }
   console.log('IndexedDB cleared. Refresh the page.');
   ```
4. Refresh the page
5. Login with: `admin` / `admin123`

## Solution 3: Force Sync Data from Server

If you have a server configured, the app will sync data on next online event. Just:
1. Go to **Settings** (if Admin) or wait for auto-sync
2. The newest data from server will override local cache

## New Admin Credentials

**Username/NIK:** `admin`  
**Password:** `admin123`

## Verify the Fix

After clearing cache, login page should show tabs:
- ✅ Guru kelas (example: 1987001 / 123456)
- ✅ Guru bidang  
- ✅ Admin (example: admin / admin123)

## If Still Not Working

1. Check that you're using the correct password: `admin123` (not `Cepi1978`)
2. Verify the servers.json has been updated with new credentials
3. Try a different browser
4. Check browser console (F12) for error messages
5. Restart the dev server if running locally

## Additional Help

The login fix has been improved to:
- ✅ Auto-detect role from database (no need to select role in dropdown)
- ✅ Login works even if you select wrong role tab
- ✅ Role is determined by what's stored in database

Just clear cache and try again!
