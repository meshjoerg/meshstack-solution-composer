import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CATALOG } from './catalog';
import { Blueprint, BlueprintBlock, BuildingBlockDefinition, InputBinding, InputSourceType } from './models';
import { PersistenceService } from './persistence.service';
import { generateTerraform } from './terraform';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {
  private persistence = inject(PersistenceService);
  catalog = CATALOG;
  query = '';
  saved = true;

  readonly meshStackDefaults = [
    'Workspace Identifier',
    'Project Identifier',
    'Full Platform Identifier',
    'Platform Tenant ID',
    'meshStack Tenant UUID',
    'User Permissions',
    'Author',
    'Tags'
  ];

  blueprint: Blueprint = this.newBlueprint();

  async ngOnInit(): Promise<void> {
    this.blueprint = (await this.persistence.loadLast()) ?? this.newBlueprint();
  }

  get filteredCatalog(): BuildingBlockDefinition[] {
    const q = this.query.trim().toLowerCase();
    return q ? this.catalog.filter(x => `${x.name} ${x.description}`.toLowerCase().includes(q)) : this.catalog;
  }

  get orderedBlocks(): BlueprintBlock[] {
    return [...this.blueprint.blocks].sort((a, b) => a.order - b.order);
  }

  get terraform(): string { return generateTerraform(this.blueprint, this.catalog); }

  get userAndOperatorContext(): string[] {
    return [...this.contextEntries('user'), ...this.contextEntries('platform-operator')];
  }
  get staticContext(): string[] { return this.contextEntries('static'); }
  get meshStackBindings(): string[] { return this.contextEntries('meshstack-context'); }

  definition(block: BlueprintBlock): BuildingBlockDefinition {
    return this.catalog.find(x => x.id === block.definitionId)!;
  }

  add(definition: BuildingBlockDefinition): void {
    if (this.blueprint.blocks.some(b => b.definitionId === definition.id)) return;
    this.blueprint.blocks.push({
      instanceId: crypto.randomUUID(),
      definitionId: definition.id,
      order: this.blueprint.blocks.length,
      expanded: true,
      inputs: Object.fromEntries(definition.inputs.map(input => [
        input.name,
        { source: 'user', value: `${definition.id.replace(/-/g, '_')}_${input.name}` } satisfies InputBinding
      ]))
    });
    void this.changed();
  }

  remove(block: BlueprintBlock): void {
    this.blueprint.blocks = this.blueprint.blocks.filter(x => x.instanceId !== block.instanceId);
    this.normalizeOrder();
    void this.changed();
  }

  move(block: BlueprintBlock, delta: number): void {
    const sorted = this.orderedBlocks;
    const index = sorted.findIndex(x => x.instanceId === block.instanceId);
    const target = index + delta;
    if (target < 0 || target >= sorted.length) return;
    [sorted[index].order, sorted[target].order] = [sorted[target].order, sorted[index].order];
    void this.changed();
  }

  toggleExpanded(block: BlueprintBlock): void {
    block.expanded = !block.expanded;
    void this.changed();
  }

  setSource(block: BlueprintBlock, input: string, source: InputSourceType): void {
    const current = block.inputs[input] ?? { source };
    block.inputs[input] = { source };
    if (source === 'user' || source === 'platform-operator') {
      block.inputs[input].value = current.value || `${block.definitionId.replace(/-/g, '_')}_${input}`;
    }
    if (source === 'static') block.inputs[input].value = current.value || '';
    if (source === 'meshstack-context') block.inputs[input].contextKey = current.contextKey || 'project_identifier';
    if (source === 'bb-output') {
      const candidate = this.outputCandidates(block)[0];
      block.inputs[input].sourceBlockId = candidate?.block.instanceId;
      block.inputs[input].sourceOutput = candidate?.output;
    }
    void this.changed();
  }

  outputCandidates(current: BlueprintBlock): { block: BlueprintBlock; label: string; output: string }[] {
    return this.orderedBlocks
      .filter(block => block.instanceId !== current.instanceId)
      .flatMap(block => this.definition(block).outputs.map(output => ({
        block,
        label: this.definition(block).name,
        output: output.name
      })));
  }

  setOutputReference(block: BlueprintBlock, input: string, value: string): void {
    const [sourceBlockId, sourceOutput] = value.split('|');
    block.inputs[input] = { source: 'bb-output', sourceBlockId, sourceOutput };
    void this.changed();
  }

  qualified(block: BlueprintBlock, input: string): string { return `${block.definitionId}.${input}`; }

  async changed(): Promise<void> {
    this.saved = false;
    await this.persistence.save(this.blueprint);
    this.saved = true;
  }

  private contextEntries(source: InputSourceType): string[] {
    return this.orderedBlocks.flatMap(block => Object.entries(block.inputs)
      .filter(([, binding]) => binding.source === source)
      .map(([name, binding]) => {
        const key = this.qualified(block, name);
        if (source === 'static') return `${key} = ${binding.value || '…'}`;
        if (source === 'meshstack-context') return `${key} ← ${binding.contextKey}`;
        return `${key}${source === 'platform-operator' ? ' · operator' : ''}`;
      }));
  }

  private normalizeOrder(): void {
    this.orderedBlocks.forEach((block, index) => block.order = index);
  }

  private newBlueprint(): Blueprint {
    return {
      id: crypto.randomUUID(),
      name: 'Sovereign AI Workspace',
      identifier: 'sovereign-ai-workspace',
      description: 'Reusable sovereign AI solution assembled from meshStack Building Blocks.',
      workingRepo: 'github.com/partner/solution-portfolio',
      repoPath: 'solutions/sovereign-ai-workspace',
      blocks: []
    };
  }
}
