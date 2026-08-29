import { db } from './db';
import { syncAll } from './sync';
import { publishInitialData, loadPublicData, applyCloudData } from './firebaseStore';
import type { Student, Teacher, Attendance } from './types';

interface SyncResult {
  server: number;
  firebase: number;
  github: number;
  total: number;
  timestamp: string;
  status: 'success' | 'partial' | 'failed';
  message: string;
}

/**
 * Sinkronisasi ke server lokal (API)
 */
async function syncToServer(): Promise<number> {
  try {
    const result = await syncAll();
    return result.sent;
  } catch (error) {
    console.error('Sync to server failed:', error);
    return 0;
  }
}

/**
 * Sinkronisasi ke Firebase Firestore
 */
async function syncToFirebase(): Promise<number> {
  try {
    const students = await db.students.filter(s=>!s.deleted).toArray();
    const teachers = await db.teachers.filter(t=>!t.deleted).toArray();
    
    await applyCloudData(async () => {
      await publishInitialData(students, teachers);
    });
    
    return students.length + teachers.length;
  } catch (error) {
    console.error('Sync to Firebase failed:', error);
    return 0;
  }
}

/**
 * Format data untuk GitHub commit
 */
function formatDataForGit(students: Student[], teachers: Teacher[], attendance: Attendance[]): string {
  const timestamp = new Date().toISOString();
  return JSON.stringify({
    timestamp,
    summary: {
      totalStudents: students.length,
      totalTeachers: teachers.length,
      totalAttendanceRecords: attendance.length,
      syncedAt: timestamp
    },
    data: {
      students,
      teachers,
      attendance
    }
  }, null, 2);
}

/**
 * Sinkronisasi ke GitHub
 * Menggunakan GitHub API untuk push commit ke repository
 */
async function syncToGithub(): Promise<number> {
  try {
    // Ambil credentials dari localStorage
    const githubToken = localStorage.getItem('githubToken');
    const githubUsername = localStorage.getItem('githubUsername') || 'mjinantinurfaihani-cmd';
    const githubRepo = localStorage.getItem('githubRepo') || 'Absensi-Murid-offline';
    
    if (!githubToken) {
      console.warn('GitHub token tidak dikonfigurasi. Setup di Settings untuk mengaktifkan sinkronisasi GitHub.');
      return 0;
    }

    // Ambil semua data dari IndexedDB
    const students = await db.students.toArray();
    const teachers = await db.teachers.toArray();
    const attendance = await db.attendance.toArray();
    
    const totalRecords = students.length + teachers.length + attendance.length;
    
    if (totalRecords === 0) {
      console.log('Tidak ada data untuk disinkronkan ke GitHub.');
      return 0;
    }

    // Format data
    const content = formatDataForGit(students, teachers, attendance);
    const timestamp = new Date().toISOString();
    const filename = `sync-data-${timestamp.split('T')[0]}.json`;
    const branch = 'main';

    // Step 1: Get latest commit SHA (untuk membuat commit baru)
    const refResponse = await fetch(
      `https://api.github.com/repos/${githubUsername}/${githubRepo}/git/refs/heads/${branch}`,
      {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );

    if (!refResponse.ok) {
      throw new Error(`GitHub API error: ${refResponse.statusText}`);
    }

    const refData = await refResponse.json() as { object: { sha: string } };
    const latestCommitSha = refData.object.sha;

    // Step 2: Get commit tree
    const commitResponse = await fetch(
      `https://api.github.com/repos/${githubUsername}/${githubRepo}/git/commits/${latestCommitSha}`,
      {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );

    if (!commitResponse.ok) {
      throw new Error(`Failed to get commit: ${commitResponse.statusText}`);
    }

    const commitData = await commitResponse.json() as { tree: { sha: string } };
    const treesha = commitData.tree.sha;

    // Step 3: Create blob (file content)
    const blobResponse = await fetch(
      `https://api.github.com/repos/${githubUsername}/${githubRepo}/git/blobs`,
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content,
          encoding: 'utf-8'
        })
      }
    );

    if (!blobResponse.ok) {
      throw new Error(`Failed to create blob: ${blobResponse.statusText}`);
    }

    const blobData = await blobResponse.json() as { sha: string };
    const blobSha = blobData.sha;

    // Step 4: Create tree
    const treeResponse = await fetch(
      `https://api.github.com/repos/${githubUsername}/${githubRepo}/git/trees`,
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          base_tree: treesha,
          tree: [
            {
              path: `data-sync/${filename}`,
              mode: '100644',
              type: 'blob',
              sha: blobSha
            }
          ]
        })
      }
    );

    if (!treeResponse.ok) {
      throw new Error(`Failed to create tree: ${treeResponse.statusText}`);
    }

    const treeData = await treeResponse.json() as { sha: string };
    const newTreeSha = treeData.sha;

    // Step 5: Create commit
    const commitCreateResponse = await fetch(
      `https://api.github.com/repos/${githubUsername}/${githubRepo}/git/commits`,
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Sync absensi data - ${timestamp}`,
          tree: newTreeSha,
          parents: [latestCommitSha]
        })
      }
    );

    if (!commitCreateResponse.ok) {
      throw new Error(`Failed to create commit: ${commitCreateResponse.statusText}`);
    }

    const commitCreateData = await commitCreateResponse.json() as { sha: string };
    const newCommitSha = commitCreateData.sha;

    // Step 6: Update ref (push)
    const updateRefResponse = await fetch(
      `https://api.github.com/repos/${githubUsername}/${githubRepo}/git/refs/heads/${branch}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sha: newCommitSha,
          force: false
        })
      }
    );

    if (!updateRefResponse.ok) {
      throw new Error(`Failed to update ref: ${updateRefResponse.statusText}`);
    }

    console.log(`✓ GitHub sync berhasil: ${totalRecords} records`);
    localStorage.setItem('lastGithubSync', timestamp);
    return totalRecords;
  } catch (error) {
    console.error('GitHub sync failed:', error);
    return 0;
  }
}

/**
 * Master sync function - sinkronisasi ke semua destination
 */
export async function syncAllDestinations(): Promise<SyncResult> {
  const startTime = performance.now();
  const timestamp = new Date().toISOString();
  
  try {
    console.log('🔄 Memulai sinkronisasi ke semua destination...');
    
    // Jalankan sync secara parallel untuk performa lebih baik
    const [serverCount, firebaseCount, githubCount] = await Promise.all([
      syncToServer(),
      syncToFirebase(),
      syncToGithub()
    ]);

    const total = serverCount + firebaseCount + githubCount;
    const duration = Math.round(performance.now() - startTime);
    
    const result: SyncResult = {
      server: serverCount,
      firebase: firebaseCount,
      github: githubCount,
      total,
      timestamp,
      status: total > 0 ? 'success' : 'partial',
      message: `✓ Sinkronisasi selesai (${duration}ms): Server(${serverCount}) + Firebase(${firebaseCount}) + GitHub(${githubCount}) = ${total} total`
    };

    console.log(result.message);
    localStorage.setItem('lastFullSync', timestamp);
    
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sinkronisasi gagal';
    console.error('Master sync failed:', error);
    
    return {
      server: 0,
      firebase: 0,
      github: 0,
      total: 0,
      timestamp,
      status: 'failed',
      message: `✗ Sinkronisasi gagal: ${message}`
    };
  }
}

/**
 * Ambil status GitHub
 */
export async function getGithubStatus(): Promise<{ configured: boolean; username: string; repo: string; lastSync?: string | null }> {
  const token = localStorage.getItem('githubToken');
  const username = localStorage.getItem('githubUsername') || 'mjinantinurfaihani-cmd';
  const repo = localStorage.getItem('githubRepo') || 'Absensi-Murid-offline';
  const lastSync = localStorage.getItem('lastGithubSync');

  return {
    configured: !!token,
    username,
    repo,
    lastSync: lastSync || undefined
  };
}

/**
 * Setup GitHub credentials
 */
export async function setupGithub(token: string, username: string, repo: string): Promise<boolean> {
  try {
    // Validate token by making a test API call
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      throw new Error('GitHub token tidak valid');
    }

    // Check if repo exists
    const repoResponse = await fetch(
      `https://api.github.com/repos/${username}/${repo}`,
      {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );

    if (!repoResponse.ok) {
      throw new Error(`Repository ${username}/${repo} tidak ditemukan atau tidak dapat diakses`);
    }

    // Save credentials
    localStorage.setItem('githubToken', token);
    localStorage.setItem('githubUsername', username);
    localStorage.setItem('githubRepo', repo);

    console.log(`✓ GitHub credentials saved: ${username}/${repo}`);
    return true;
  } catch (error) {
    console.error('GitHub setup failed:', error);
    throw error;
  }
}

/**
 * Hapus GitHub credentials
 */
export function clearGithubCredentials(): void {
  localStorage.removeItem('githubToken');
  localStorage.removeItem('githubUsername');
  localStorage.removeItem('githubRepo');
  localStorage.removeItem('lastGithubSync');
  console.log('GitHub credentials cleared');
}
