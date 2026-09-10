import { Injectable } from '@angular/core';
import { Blueprint } from './models';
import { DemoConnectionConfig } from './demo-config.service';

interface GitSaveResponse {
  commitSha: string;
  files: string[];
}

interface GitLoadResponse {
  blueprint: Blueprint;
  terraform?: string;
  commitSha?: string;
}

@Injectable({ providedIn: 'root' })
export class GitRepositoryService {
  private readonly adapterUrl = 'http://127.0.0.1:8000';

  async save(config: DemoConnectionConfig, blueprint: Blueprint, terraform: string): Promise<GitSaveResponse> {
    return this.post<GitSaveResponse>('/git/save', {
      repository: config.git.repository,
      branch: config.git.branch || 'main',
      token: config.git.token,
      repoPath: blueprint.repoPath,
      blueprint,
      terraform
    });
  }

  async load(config: DemoConnectionConfig, repoPath: string): Promise<GitLoadResponse> {
    return this.post<GitLoadResponse>('/git/load', {
      repository: config.git.repository,
      branch: config.git.branch || 'main',
      token: config.git.token,
      repoPath
    });
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.adapterUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      let detail = `${response.status} ${response.statusText}`;
      try {
        const payload = await response.json();
        detail = payload.detail || detail;
      } catch {}
      throw new Error(detail);
    }

    return response.json() as Promise<T>;
  }
}
