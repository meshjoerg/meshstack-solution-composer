import { Injectable } from '@angular/core';
import { openDB } from 'idb';
import { Blueprint } from './models';

@Injectable({ providedIn: 'root' })
export class PersistenceService {
  private readonly dbPromise = openDB('meshstack-solution-composer', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('blueprints')) {
        db.createObjectStore('blueprints', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }
    }
  });

  async save(blueprint: Blueprint): Promise<void> {
    const db = await this.dbPromise;
    await db.put('blueprints', structuredClone(blueprint));
    await db.put('settings', blueprint.id, 'lastBlueprintId');
  }

  async loadLast(): Promise<Blueprint | undefined> {
    const db = await this.dbPromise;
    const id = await db.get('settings', 'lastBlueprintId');
    return id ? db.get('blueprints', id) : undefined;
  }

  async saveSetting<T>(key: string, value: T): Promise<void> {
    const db = await this.dbPromise;
    await db.put('settings', structuredClone(value), key);
  }

  async loadSetting<T>(key: string): Promise<T | undefined> {
    const db = await this.dbPromise;
    return db.get('settings', key) as Promise<T | undefined>;
  }
}
