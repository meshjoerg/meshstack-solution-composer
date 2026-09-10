import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PersistenceService } from './persistence.service';

interface DemoConnectionConfig {
  meshstackUrl: string;
  meshstackApiKey: string;
  gitRepository: string;
  gitBranch: string;
  gitKey: string;
  privateHubUrl: string;
  privateHubKey: string;
}

const EMPTY_CONFIG: DemoConnectionConfig = {
  meshstackUrl: '',
  meshstackApiKey: '',
  gitRepository: '',
  gitBranch: 'main',
  gitKey: '',
  privateHubUrl: '',
  privateHubKey: ''
};

@Component({
  selector: 'connection-config-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './connection-config.component.html',
  styleUrl: './connection-config.component.css'
})
export class ConnectionConfigComponent implements OnInit {
  private persistence = inject(PersistenceService);

  open = false;
  saved = true;
  config: DemoConnectionConfig = { ...EMPTY_CONFIG };
  jsonDraft = '';
  jsonError = '';

  async ngOnInit(): Promise<void> {
    const stored = await this.persistence.loadSetting<Partial<DemoConnectionConfig>>('demoConnectionConfig');
    this.config = { ...EMPTY_CONFIG, ...(stored ?? {}) };
  }

  get meshstackConfigured(): boolean {
    return !!this.config.meshstackUrl.trim() && !!this.config.meshstackApiKey.trim();
  }

  get gitConfigured(): boolean {
    return !!this.config.gitRepository.trim() && !!this.config.gitKey.trim();
  }

  get privateHubConfigured(): boolean {
    return !!this.config.privateHubUrl.trim() && !!this.config.privateHubKey.trim();
  }

  toggle(event: MouseEvent): void {
    event.stopPropagation();
    this.open = !this.open;
  }

  close(): void {
    this.open = false;
  }

  @HostListener('document:click')
  closeOnOutsideClick(): void {
    if (this.open) this.close();
  }

  async changed(): Promise<void> {
    this.saved = false;
    await this.persistence.saveSetting('demoConnectionConfig', this.config);
    this.saved = true;
  }

  async applyJson(): Promise<void> {
    this.jsonError = '';
    try {
      const parsed = JSON.parse(this.jsonDraft) as Partial<DemoConnectionConfig>;
      this.config = { ...this.config, ...parsed };
      await this.changed();
      this.jsonDraft = '';
    } catch {
      this.jsonError = 'Invalid JSON';
    }
  }

  copyTemplate(): void {
    this.jsonDraft = JSON.stringify({
      meshstackUrl: this.config.meshstackUrl || 'https://meshstack.example.com',
      meshstackApiKey: this.config.meshstackApiKey || '...',
      gitRepository: this.config.gitRepository || 'owner/repository',
      gitBranch: this.config.gitBranch || 'main',
      gitKey: this.config.gitKey || '...',
      privateHubUrl: this.config.privateHubUrl || '',
      privateHubKey: this.config.privateHubKey || ''
    }, null, 2);
  }
}
