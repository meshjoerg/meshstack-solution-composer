import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CATALOG } from './catalog';
import { Blueprint, BlueprintBlock, BuildingBlockDefinition, ImplementationType, InputBinding, InputSourceType, ParameterDefinition } from './models';
import { PersistenceService } from './persistence.service';
import { generateTerraform } from './terraform';

interface ContextGroup {
  blockId: string;
  blockName: string;
  items: string[];
}

interface ContextPill {
  blockName: string;
  parameter: string;
  operator: boolean;
}

interface CatalogGroup {
  platform: string;
  items: BuildingBlockDefinition[];
}

interface CompositionPlacement {
  block: BlueprintBlock;
  row: number;
  column: number;
  primaryParent?: string;
  secondaryParents: string[];
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
  private activeInputByBlock = new Map<string, string>();

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
    const restored = (await this.persistence.loadLast()) ?? this.newBlueprint();
    const knownDefinitions = new Set(this.catalog.map(item => item.id));
    restored.blocks = (restored.blocks ?? []).filter(block => knownDefinitions.has(block.definitionId));
    const knownInstances = new Set(restored.blocks.map(block => block.instanceId));

    restored.blocks.forEach((block, index) => {
      block.order = index;
      this.ensureBlockBindings(block);
      for (const [inputName, binding] of Object.entries(block.inputs)) {
        if (binding.source === 'bb-output' && (!binding.sourceBlockId || !knownInstances.has(binding.sourceBlockId))) {
          block.inputs[inputName] = this.defaultUserBinding(block, inputName);
        }
      }
    });

    this.blueprint = restored;
    await this.persistence.save(this.blueprint);
    this.changeDetector.detectChanges();
  }

  get filteredCatalog(): BuildingBlockDefinition[] {
    const q = this.query.trim().toLowerCase();
    return q ? this.catalog.filter(x => `${x.name} ${x.description} ${x.platform ?? ''}`.toLowerCase().includes(q)) : this.catalog;
  }

  get catalogGroups(): CatalogGroup[] {
    const groups = new Map<string, BuildingBlockDefinition[]>();
    for (const item of this.filteredCatalog) {
      const platform = item.platform?.trim() || 'Other';
      if (!groups.has(platform)) groups.set(platform, []);
      groups.get(platform)!.push(item);
    }
    return [...groups.entries()]
      .map(([platform, items]) => ({
        platform,
        items: [...items].sort((a, b) => a.name.localeCompare(b.name))
      }))
      .sort((a, b) => a.platform.localeCompare(b.platform));
  }

  get orderedBlocks(): BlueprintBlock[] {
    return [...this.blueprint.blocks].sort((a, b) => a.order - b.order);
  }

  get compositionPlacements(): CompositionPlacement[] {
    const blocks = this.orderedBlocks;
    const depths = new Map<string, number>();
    const order = new Map(blocks.map((block, index) => [block.instanceId, index]));

    const depthOf = (block: BlueprintBlock, visiting = new Set<string>()): number => {
      const cached = depths.get(block.instanceId);
      if (cached !== undefined) return cached;
      if (visiting.has(block.instanceId)) return 0;

      const next = new Set(visiting);
      next.add(block.instanceId);
      const parents = this.parentBlocks(block);
      const depth = parents.length ? Math.max(...parents.map(parent => depthOf(parent, next))) + 1 : 0;
      depths.set(block.instanceId, depth);
      return depth;
    };

    blocks.forEach(block => depthOf(block));
    const processOrder = [...blocks].sort((a, b) => {
      const depthDelta = (depths.get(a.instanceId) ?? 0) - (depths.get(b.instanceId) ?? 0);
      return depthDelta || (order.get(a.instanceId) ?? 0) - (order.get(b.instanceId) ?? 0);
    });

    const laneByBlock = new Map<string, number>();
    const occupied = new Set<string>();
    const placements: CompositionPlacement[] = [];
    let nextRootLane = 0;

    for (const block of processOrder) {
      const parents = this.parentBlocks(block).sort((a, b) => {
        const depthDelta = (depths.get(b.instanceId) ?? 0) - (depths.get(a.instanceId) ?? 0);
        return depthDelta || (order.get(a.instanceId) ?? 0) - (order.get(b.instanceId) ?? 0);
      });
      const column = depths.get(block.instanceId) ?? 0;

      let row: number;
      if (!parents.length) {
        row = nextRootLane++;
      } else {
        const primary = parents[0];
        row = laneByBlock.get(primary.instanceId) ?? nextRootLane++;
        while (occupied.has(`${row}:${column}`)) row = nextRootLane++;
      }

      laneByBlock.set(block.instanceId, row);
      occupied.add(`${row}:${column}`);
      placements.push({
        block,
        row,
        column,
        primaryParent: parents[0] ? this.definition(parents[0]).name : undefined,
        secondaryParents: parents.slice(1).map(parent => this.definition(parent).name)
      });
    }

    return placements.sort((a, b) => a.row - b.row || a.column - b.column);
  }

  get maxCompositionColumn(): number {
    return this.compositionPlacements.reduce((max, placement) => Math.max(max, placement.column), 0);
  }

  get terraform(): string { return generateTerraform(this.blueprint, this.catalog); }

  get userOperatorPills(): ContextPill[] {
    const result: ContextPill[] = [];
    for (const block of this.orderedBlocks) {
      const definition = this.definition(block);
      for (const [parameter, binding] of Object.entries(block.inputs ?? {})) {
        if (binding.source === 'user' || binding.source === 'platform-operator') {
          result.push({
            blockName: definition.name,
            parameter,
            operator: binding.source === 'platform-operator'
          });
        }
      }
    }
    return result;
  }

  get staticGroups(): ContextGroup[] {
    return this.contextGroups(['static']);
  }

  definition(block: BlueprintBlock): BuildingBlockDefinition {
    const definition = this.catalog.find(x => x.id === block.definitionId);
    if (!definition) throw new Error(`Unknown Building Block definition: ${block.definitionId}`);
    return definition;
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
      Object.values(block.inputs ?? {})
        .filter(binding => binding.source === 'bb-output' && binding.sourceBlockId)
        .map(binding => binding.sourceBlockId as string)
    );
    return this.orderedBlocks.filter(candidate => ids.has(candidate.instanceId));
  }

  add(definition: BuildingBlockDefinition): void {
    if (this.blueprint.blocks.some(b => b.definitionId === definition.id)) return;
    const block: BlueprintBlock = {
      instanceId: crypto.randomUUID(),
      definitionId: definition.id,
      order: this.blueprint.blocks.length,
      expanded: false,
      inputs: {}
    };
    this.blueprint.blocks.push(block);
    this.ensureBlockBindings(block);
    void this.changed();
  }

  remove(block: BlueprintBlock): void {
    this.activeInputByBlock.delete(block.instanceId);
    this.blueprint.blocks = this.blueprint.blocks.filter(x => x.instanceId !== block.instanceId);
    this.normalizeOrder();
    void this.changed();
  }

  toggleExpanded(block: BlueprintBlock): void {
    this.ensureBlockBindings(block);
    if (block.expanded) {
      block.expanded = false;
      this.activeInputByBlock.delete(block.instanceId);
    } else {
      block.expanded = true;
      this.activeInputByBlock.delete(block.instanceId);
    }
    void this.changed();
  }

  editInput(block: BlueprintBlock, inputName: string): void {
    this.ensureBlockBindings(block);
    block.expanded = true;
    this.activeInputByBlock.set(block.instanceId, inputName);
    void this.changed();
  }

  visibleInputs(block: BlueprintBlock): ParameterDefinition[] {
    const inputs = this.definition(block).inputs ?? [];
    const active = this.activeInputByBlock.get(block.instanceId);
    return active ? inputs.filter(input => input.name === active) : inputs;
  }

  binding(block: BlueprintBlock, inputName: string): InputBinding {
    this.ensureBlockBindings(block);
    return block.inputs[inputName];
  }

  setSource(block: BlueprintBlock, input: string, source: InputSourceType): void {
    this.ensureBlockBindings(block);
    const current = this.binding(block, input);
    const next: InputBinding = { source };

    if (source === 'user' || source === 'platform-operator') {
      next.value = current.value || `${block.definitionId.replace(/-/g, '_')}_${input}`;
    } else if (source === 'static') {
      next.value = current.value || '';
    } else if (source === 'meshstack-context') {
      next.contextKey = current.contextKey || 'project_identifier';
    } else if (source === 'bb-output') {
      const candidate = this.outputCandidates(block)[0];
      next.sourceBlockId = candidate?.block.instanceId;
      next.sourceOutput = candidate?.output;
    }

    block.inputs[input] = next;
    void this.changed();
  }

  setBindingValue(block: BlueprintBlock, inputName: string, value: string): void {
    this.binding(block, inputName).value = value;
    void this.changed();
  }

  setContextKey(block: BlueprintBlock, inputName: string, contextKey: string): void {
    const current = this.binding(block, inputName);
    block.inputs[inputName] = { ...current, source: 'meshstack-context', contextKey };
    void this.changed();
  }

  outputReferenceValue(block: BlueprintBlock, inputName: string): string {
    const current = this.binding(block, inputName);
    return `${current.sourceBlockId ?? ''}|${current.sourceOutput ?? ''}`;
  }

  outputCandidates(current: BlueprintBlock): { block: BlueprintBlock; label: string; output: string }[] {
    return this.orderedBlocks
      .filter(block => block.instanceId !== current.instanceId)
      .flatMap(block => (this.definition(block).outputs ?? []).map(output => ({
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

  async changed(): Promise<void> {
    this.saved = false;
    await this.persistence.save(this.blueprint);
    this.saved = true;
  }

  private ensureBlockBindings(block: BlueprintBlock): void {
    const definition = this.catalog.find(item => item.id === block.definitionId);
    if (!definition) return;
    block.inputs = block.inputs ?? {};

    const definitionInputs = definition.inputs ?? [];
    const validNames = new Set(definitionInputs.map(input => input.name));
    for (const existingName of Object.keys(block.inputs)) {
      if (!validNames.has(existingName)) delete block.inputs[existingName];
    }

    for (const input of definitionInputs) {
      const existing = block.inputs[input.name];
      if (!existing?.source) {
        block.inputs[input.name] = this.defaultUserBinding(block, input.name);
      } else if ((existing.source === 'user' || existing.source === 'platform-operator') && !existing.value) {
        existing.value = `${block.definitionId.replace(/-/g, '_')}_${input.name}`;
      }
    }
  }

  private defaultUserBinding(block: BlueprintBlock, inputName: string): InputBinding {
    return {
      source: 'user',
      value: `${block.definitionId.replace(/-/g, '_')}_${inputName}`
    };
  }

  private contextGroups(sources: InputSourceType[]): ContextGroup[] {
    const allowed = new Set<InputSourceType>(sources);
    return this.orderedBlocks.flatMap(block => {
      const items = Object.entries(block.inputs ?? {})
        .filter(([, binding]) => allowed.has(binding.source))
        .map(([name, binding]) => {
          if (binding.source === 'static') return `${name} = ${binding.value || '…'}`;
          if (binding.source === 'meshstack-context') return `${name} ← ${binding.contextKey}`;
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
