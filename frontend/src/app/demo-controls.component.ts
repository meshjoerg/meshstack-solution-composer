import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Blueprint } from './models';
import { DemoConfigService, DemoConnectionConfig } from './demo-config.service';
import { GitRepositoryService } from './git-repository.service';

@Component({
  selector: 'app-demo-controls',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './demo-controls.component.html',
  styleUrl: './demo-controls.component.css'
})
export class DemoControlsComponent implements OnInit {
  private configService = inject(DemoConfigService);
  private git = inject(GitRepositoryService);

  @Input({ required: true }) blueprint!: Blueprint;
  @Input() terraformCode = '';
  @Output() blueprintLoaded = new EventEmitter<Blueprint>();

  open = false;
  busy = false;
  message = '';
  pasteOpen = false;
  pasteJson = '';
  config: DemoConnectionConfig = {
    meshstack: { endpoint: '', apiKey: '' },
    git: { repository: '', branch: 'main', token: '' },
    privateHub: { endpoint: '', apiKey: '' }
  };

  async ngOnInit(): Promise<void> {
    this.config = await this.configService.load();
  }

  get gitConfigured(): boolean {
    return !!(this.config.git.repository && this.config.git.token);
  }

  get meshstackConfigured(): boolean {
    return !!(this.config.meshstack.endpoint && this.config.meshstack.apiKey);
  }

  async saveConfig(): Promise<void> {
    await this.configService.save(this.config);
    this.message = 'Configuration saved locally.';
  }

  applyJson(): void {
    try {
      const parsed = JSON.parse(this.pasteJson) as DemoConnectionConfig;
      this.config = {
        meshstack: { endpoint: parsed.meshstack?.endpoint ?? '', apiKey: parsed.meshstack?.apiKey ?? '' },
        git: { repository: parsed.git?.repository ?? '', branch: parsed.git?.branch ?? 'main', token: parsed.git?.token ?? '' },
        privateHub: { endpoint: parsed.privateHub?.endpoint ?? '', apiKey: parsed.privateHub?.apiKey ?? '' }
      };
      this.message = 'JSON applied. Save configuration to persist it.';
    } catch {
      this.message = 'Invalid JSON configuration.';
    }
  }

  async saveToGit(): Promise<void> {
    if (!this.gitConfigured) {
      this.open = true;
      this.message = 'Configure Git repository and token first.';
      return;
    }

    this.busy = true;
    this.message = 'Saving to Git…';
    try {
      await this.configService.save(this.config);
      const result = await this.git.save(this.config, this.blueprint, this.terraformCode);
      this.message = `Saved to Git · ${result.commitSha.slice(0, 8)}`;
    } catch (error) {
      this.message = `Git save failed: ${error instanceof Error ? error.message : String(error)}`;
      this.open = true;
    } finally {
      this.busy = false;
    }
  }

  async loadFromGit(): Promise<void> {
    if (!this.gitConfigured) {
      this.open = true;
      this.message = 'Configure Git repository and token first.';
      return;
    }

    this.busy = true;
    this.message = 'Loading from Git…';
    try {
      await this.configService.save(this.config);
      const result = await this.git.load(this.config, this.blueprint.repoPath);
      this.blueprintLoaded.emit(result.blueprint);
      this.message = result.commitSha ? `Loaded from Git · ${result.commitSha.slice(0, 8)}` : 'Loaded from Git.';
    } catch (error) {
      this.message = `Git load failed: ${error instanceof Error ? error.message : String(error)}`;
      this.open = true;
    } finally {
      this.busy = false;
    }
  }
}
