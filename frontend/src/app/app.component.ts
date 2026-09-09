import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CATALOG } from './catalog';
import { Blueprint, BlueprintBlock, BuildingBlockDefinition, ImplementationType, InputBinding, InputSourceType } from './models';
import { PersistenceService } from './persistence.service';
import { generateTerraform } from './terraform';

interface ContextGroup {
  blockId: string;
  blockName: string;
  items: string[];
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {
  private persistence = inject(PersistenceService);
  private changeDetector = inject(ChangeDetectorRef);
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
    this.changeDetector.detectChanges();
  }

  get filteredCatalog(): BuildingBlockDefinition[] {
    const q = this.query.trim().toLowerCase();
    return q ? this.catalog.filter(x => `${x.name} ${x.description}`.toLowerCase().includes(q)) : this.catalog;
  }

  get orderedBlocks(): BlueprintBlock[] {
    return [...this.blueprint.blocks].sort((a, b) => a.order - b.order);
  }

  get compositionColumns(): BlueprintBlock[][] {
    const blocks = this.orderedBlocks;
    const byId = new Map(blocks.map(block => [block.instanceId, block]));
    const depths = new Map<string, number>();

    const depthOf = (block: BlueprintBlock, visiting = new Set<string>()): number => {
      const cached = depths.get(block.instanceId);
      if (cached !== undefined) return cached;
      if (visiting.has(block.instanceId)) return 0;

      const nextVisiting = new Set(visiting);
      nextVisiting.add(block.instanceId);
      const parents = this.parentBlocks(block).filter(parent => byId.has(parent.instanceId));
      const depth = parents.length
        ? Math.max(...parents.map(parent => depthOf(parent, nextVisiting))) + 1
        : 0;
      depths.set(block.instanceId, depth);
      return depth;
    };

    const maxDepth = blocks.reduce((max, block) => Math.max(max, depthOf(block)), 0);
    const columns = Array.from({ length: maxDepth + 1 }, () => [] as BlueprintBlock[]);
    blocks.forEach(block => columns[depthOf(block)].push(block));
    return columns;
  }

  get terraform(): string { return generateTerraform(this.blueprint, this.catalog); }

  get userOperatorGroups(): ContextGroup[] {
    return this.contextGroups(['user', 'platform-operator']);
  }

  get staticGroups(): ContextGroup[] {
    return this.contextGroups(['static']);
  }

  get meshStackBindingGroups(): ContextGroup[] {
    return this.contextGroups(['meshstack-context']);
  }

  definition(block: BlueprintBlock): BuildingBlockDefinition {
    return this.catalog.find(x => x.id === block.definitionId)!;
  }

  implementationIconUrl(type: ImplementationType): string | null {
    const slugs: Partial<Record<ImplementationType, string>> = {
      'opentofu': 'opentofu',
      'github-actions': 'github',
      'gitlab-cicd': 'gitlab',
      'azure-devops': 'azuredevops'
    };
    const slug = slugs[type];
    return slug ? `https://cdn.simpleicons.org/${slug}` : null;
  }

  parentBlocks(block: BlueprintBlock): BlueprintBlock[] {
    const ids = new Set(
      Object.values(block.inputs)
        .filter(binding => binding.source === 'bb-output' && binding.sourceBlockId)
        .map(binding => binding.sourceBlockId as string)
    );
    return this.orderedBlocks.filter(candidate => ids.has(candidate.instanceId));
  }

  dependencyNames(block: BlueprintBlock): string[] {
    return this.parentBlocks(block).map(parent => this.definition(parent).name);
  }

  add(definition: BuildingBlockDefinition): void {
    if (this.blueprint.blocks.some(b => b.definitionId === definition.id)) return;
    this.blueprint.blocks.push({
      instanceId: crypto.randomUUID(),
      definitionId: definition.id,
      order: this.blueprint.blocks.length,
      expanded: false,
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

  private contextGroups(sources: InputSourceType[]): ContextGroup[] {
    const allowed = new Set<InputSourceType>(sources);
    return this.orderedBlocks.flatMap(block => {
      const items = Object.entries(block.inputs)
        .filter(([, binding]) => allowed.has(binding.source))
        .map(([name, binding]) => {
          if (binding.source === 'static') return `${name} = ${binding.value || '…'}`;
          if (binding.source === 'meshstack-context') return `${name} ← ${binding.contextKey}`;
          if (binding.source === 'platform-operator') return `${name} · operator`;
          return name;
        });

      return items.length ? [{
        blockId: block.definitionId,
        blockName: this.definition(block).name,
        items
      }] : [];
    });
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
