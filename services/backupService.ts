
import { db } from './db';
import LZString from 'lz-string';
import type { Backup, BackupMetadata } from '../types';

export const BACKUP_VERSION = '2.0';

class BackupService {
  /**
   * Helper to gather all data from the database except the backups table itself.
   */
  private async gatherAllData(): Promise<any> {
    const allData: any = {};
    const tableNames = [
      'workers', 'projects', 'records', 'planMarkers', 'solarTables',
      'tableAssignments', 'attendanceSessions', 'dailyLogs',
      'projectTasks', 'projectComponents', 'planAnnotations', 'tableStatusHistory'
    ];

    for (const name of tableNames) {
      const table = (db as any)[name];
      if (table) {
        allData[name] = await table.toArray();
      }
    }

    // Cleanup blobs/files to keep backup lightweight text-only if possible,
    // or keep them if full restore is needed. For LZ-string, strings are better.
    // We kept planFile as Blob in DB but maybe good to exclude large files for auto backups?
    // For now, we include everything to ensure full restore.

    return allData;
  }

  async createBackup(type: 'auto' | 'manual', name?: string): Promise<number> {
    const data = await this.gatherAllData();

    // Calculate metadata statistics
    const metadata: BackupMetadata = {
      appVersion: BACKUP_VERSION,
      itemsCount: {
        workers: data.workers?.length || 0,
        projects: data.projects?.length || 0,
        records: data.records?.length || 0
      },
      dataSize: 0 // Will fill after compression
    };

    const jsonString = JSON.stringify(data);
    const compressed = LZString.compressToUTF16(jsonString);
    metadata.dataSize = compressed.length * 2; // Approx size in bytes (UTF-16)

    const backup: Omit<Backup, 'id'> = {
      version: BACKUP_VERSION,
      timestamp: new Date(),
      type,
      name: name || (type === 'auto' ? `Auto Backup ${new Date().toLocaleTimeString()}` : 'Manual Backup'),
      data: compressed,
      metadata
    };

    // Auto-backup rotation logic
    if (type === 'auto') {
      const autoBackups = await db.backups.where('type').equals('auto').sortBy('timestamp');
      // Keep last 9, so adding this one makes 10
      if (autoBackups.length >= 10) {
        const toDelete = autoBackups.slice(0, autoBackups.length - 9);
        await db.backups.bulkDelete(toDelete.map(b => b.id!));
      }
    }

    return (await db.backups.add(backup as Backup)) as number;
  }

  async restoreBackup(backupId: number, mode: 'merge' | 'replace' = 'replace'): Promise<void> {
    const backup = await db.backups.get(backupId);
    if (!backup) throw new Error('Backup not found');

    const decompressed = LZString.decompressFromUTF16(backup.data);
    if (!decompressed) throw new Error('Failed to decompress backup data');

    const data = JSON.parse(decompressed);
    await this.processRestore(data, mode);
  }

  async importBackupFile(file: File, mode: 'merge' | 'replace'): Promise<void> {
    const text = await file.text();
    let data;
    try {
      // Try parsing directly (legacy or uncompressed export)
      data = JSON.parse(text);
    } catch {
      // Try decompressing
      const decompressed = LZString.decompressFromUTF16(text);
      if (decompressed) {
        data = JSON.parse(decompressed);
      } else {
        throw new Error('Invalid backup file format');
      }
    }

    // Check if it's our backup structure or raw export
    if (data.version && data.data && typeof data.data === 'string') {
      // It's a full Backup object export
      const innerData = LZString.decompressFromUTF16(data.data);
      await this.processRestore(JSON.parse(innerData), mode);
    } else {
      // It's likely a raw data export
      await this.processRestore(data, mode);
    }
  }

  private async processRestore(data: any, mode: 'merge' | 'replace') {
    await db.transaction('rw', db.tables.filter(t => t.name !== 'backups'), async () => {
      const tableNames = Object.keys(data).filter(k => k !== 'version' && k !== 'exportedAt');

      for (const name of tableNames) {
        const table = (db as any)[name];
        if (table && data[name]) {
          if (mode === 'replace') {
            await table.clear();
          }

          // Fix dates
          const items = data[name].map((item: any) => {
            const newItem = { ...item };
            ['createdAt', 'updatedAt', 'startTime', 'endTime', 'timestamp', 'completionDate', 'date'].forEach(f => {
              if (newItem[f] && typeof newItem[f] === 'string') {
                // Simple check if it looks like a date string? 
                // Actually Dexie handles Date objects, so we revive them.
                // The JSON.stringify converts Dates to ISO strings.
                if (!isNaN(Date.parse(newItem[f]))) {
                  newItem[f] = new Date(newItem[f]);
                }
              }
            });
            return newItem;
          });

          await table.bulkPut(items); // bulkPut handles upsert based on ID
        }
      }
    });
  }

  async exportBackupJSON(backupId: number): Promise<void> {
    const backup = await db.backups.get(backupId);
    if (!backup) return;

    // We export the Backup object itself, preserving metadata
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mst_backup_${backup.type}_${new Date(backup.timestamp).toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async deleteBackup(id: number) {
    return db.backups.delete(id);
  }
}

export const backupService = new BackupService();
