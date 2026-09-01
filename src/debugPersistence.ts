/**
 * Debug helper untuk memverifikasi data guru disimpan di Firestore dan dapat diakses cross-device/cross-user
 * Run di console browser dengan: debugTeacherSync()
 */

import { db } from './db';
import { loadPublicData, publishTeacher } from './firebaseStore';

export async function debugTeacherSync() {
  console.clear();
  console.log('=== TEACHER PERSISTENCE DEBUG ===\n');

  // 1. Local IndexedDB
  console.log('📱 Local IndexedDB:');
  const localTeachers = await db.teachers.toArray();
  console.table(localTeachers.map(t => ({
    id: t.id,
    nama: t.nama,
    nik: t.nik,
    role: t.role,
    deleted: t.deleted,
    synced: t.synced,
    updatedAt: t.updatedAt
  })));
  console.log(`Total: ${localTeachers.length} teacher(s)\n`);

  // 2. Firebase Firestore
  console.log('☁️ Firebase Firestore:');
  try {
    const cloudData = await loadPublicData();
    console.table(cloudData.teachers.map(t => ({
      id: t.id,
      nama: t.nama,
      nik: t.nik,
      role: t.role,
      deleted: t.deleted,
      synced: t.synced,
      updatedAt: t.updatedAt
    })));
    console.log(`Total: ${cloudData.teachers.length} teacher(s)\n`);

    // 3. Comparison
    console.log('🔄 Synchronization Status:');
    for (const local of localTeachers) {
      const cloud = cloudData.teachers.find(c => c.id === local.id);
      const status = cloud 
        ? cloud.updatedAt === local.updatedAt 
          ? '✅ SYNCED' 
          : '⚠️ MISMATCH'
        : '❌ NOT IN CLOUD';
      console.log(`${status} | ${local.nama} (${local.nik})`);
      if (cloud && cloud.updatedAt !== local.updatedAt) {
        console.log(`   Local: ${local.updatedAt}`);
        console.log(`   Cloud: ${cloud.updatedAt}`);
      }
    }

    // 4. Check for cloud-only teachers
    console.log('\n🔍 Cloud-only teachers (not in local):');
    const cloudOnly = cloudData.teachers.filter(c => !localTeachers.find(l => l.id === c.id));
    if (cloudOnly.length) {
      console.table(cloudOnly.map(t => ({
        id: t.id,
        nama: t.nama,
        nik: t.nik,
        updatedAt: t.updatedAt
      })));
    } else {
      console.log('None');
    }

    // 5. Check synced status
    console.log('\n📊 Sync Statistics:');
    const unsynced = localTeachers.filter(t => t.synced === 0);
    console.log(`Local teachers: ${localTeachers.length}`);
    console.log(`Cloud teachers: ${cloudData.teachers.length}`);
    console.log(`Unsynced local: ${unsynced.length}`);
    if (unsynced.length) {
      console.log('Unsynced teachers:');
      console.table(unsynced.map(t => ({
        nama: t.nama,
        nik: t.nik,
        updatedAt: t.updatedAt
      })));
    }

  } catch (error) {
    console.error('❌ Firebase error:', error instanceof Error ? error.message : error);
  }

  console.log('\n=== END DEBUG ===\n');
}

export async function debugManualPublish(nikToPublish?: string) {
  console.log('🚀 Manual Publish Test\n');
  
  const teachers = await db.teachers.toArray();
  const target = nikToPublish 
    ? teachers.find(t => t.nik === nikToPublish)
    : teachers[0];

  if (!target) {
    console.error('Teacher not found');
    return;
  }

  console.log(`Publishing: ${target.nama} (${target.nik})`);
  try {
    await publishTeacher(target);
    console.log('✅ Published successfully');
    console.log('Try running debugTeacherSync() again to verify\n');
  } catch (error) {
    console.error('❌ Publish failed:', error instanceof Error ? error.message : error);
  }
}

// Auto-run on page load to detect issues
if (typeof window !== 'undefined') {
  (window as any).debugTeacherSync = debugTeacherSync;
  (window as any).debugManualPublish = debugManualPublish;
  console.log('✅ Debug tools loaded. Run: debugTeacherSync() or debugManualPublish()');
}
