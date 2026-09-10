import { Injectable } from '@angular/core';
import { openDB } from 'idb';

export interface DemoConnectionConfig {
  meshstack: {
    endpoint: string;
    apiKey: string;
  };
  git: {
    repository: string;
    branch: string;
    token: string;
  };
  privateHub: {
    endpoint: string;
    apiKey: string;
  };
}

const DEFAULT_CONFIG: DemoConnectionConfig = {
  meshstack: { endpoint: '', apiKey: '' },
  git: { repository: '', branch: 'main', token: '' },
  privateHub: { endpoint: '', apiKey: '' }
};

@Injectable({ providedIn: 'root' })
export class DemoConfigService {
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

  private configValue: DemoConnectionConfig = structuredClone(DEFAULT_CONFIG);

  get current(): DemoConnectionConfig {
    return structuredClone(this.configValue);
  }

  async load(): Promise<DemoConnectionConfig> {
    const db = await this.dbPromise;
    const stored = await db.get('settings', 'demoConnectionConfig') as DemoConnectionConfig | undefined;
    this.configValue = stored ? this.merge(stored) : structuredClone(DEFAULT_CONFIG);
    return this.current;
  }

  async save(config: DemoConnectionConfig): Promise<void> {
    this.configValue = this.merge(config);
    const db = await this.dbPromise;
    await db.put('settings', structuredClone(this.configValue), 'demoConnectionConfig');
  }

  private merge(value: Partial<DemoConnectionConfig>): DemoConnectionConfig {
    return {
      meshstack: { ...DEFAULT_CONFIG.meshstack, ...(value.meshstack ?? {}) },
      git: { ...DEFAULT_CONFIG.git, ...(value.git ?? {}) },
      privateHub: { ...DEFAULT_CONFIG.privateHub, ...(value.privateHub ?? {}) }
    };
  }
}
