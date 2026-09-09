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
  definition: BuildingBlockDefinition;
  row: number;
  column: number;
  primaryParent?: string;
  secondaryParents: string[];
}

interface OutputCandidate {
  block: BlueprintBlock;
  label: string;
  output: string;
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
  private readonly definitionMap = new Map(CATALOG.map(item => [item.id, item]));

  readonly catalog = CATALOG;
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

  query = '';
  saved = true;
  blueprint: Blueprint = this.newBlueprint();

  catalogGroups: CatalogGroup[] = [];
  orderedBlocks: BlueprintBlock[] = [];
  compositionPlacements: CompositionPlacement[] = [];
  maxCompositionColumn = 0;
  userOperatorPills: ContextPill[] = [];
  staticGroups: ContextGroup[] = [];
  terraformCode = '';

  editorBlock: BlueprintBlock | null = null;
  editorDefinition: BuildingBlockDefinition | null = null;
  editorInput: ParameterDefinition | null = null;
  editorOutputCandidates: OutputCandidate[] = [];
  editorSource: InputSourceType = 'user';
  editorValue = '';
  editorContextKey = 'project_identifier';
  editorOutputReference = '|';

  async ngOnInit(): Promise<void> {
    const restored = (await this.persistence.loadLast()) ?? this.newBlueprint();
    restored.blocks = (restored.blocks ?? []).filter(block => this.definitionMap.has(block.definitionId));
    const knownInstances = new Set(restored.blocks.map(block => block.instanceId));

    restored.blocks.forEach((block, index) => {
      block.order = index;
      block.expanded = false;
      this.ensureBlockBindings(block);
      for (const [inputName, binding] of Object.entries(block.inputs)) {
        if (binding.source === 'bb-output' && (!binding.sourceBlockId || !knownInstances.has(binding.sourceBlockId))) {
          block.inputs[inputName] = this.defaultUserBinding(block, inputName);
        }
      }
    });

    this.blueprint = restored;
    this.refreshCatalogGroups();
    this.refreshDerivedState();
    await this.persistence.save(this.blueprint);
    this.changeDetector.detectChanges();
  }

  onQueryChange(): void {
    this.refreshCatalogGroups();
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

  add(definition: BuildingBlockDefinition): void {
    if (this.blueprint.blocks.some(block => block.definitionId === definition.id)) return;
    const block: BlueprintBlock = {
      instanceId: crypto.randomUUID(),
      definitionId: definition.id,
      order: this.blueprint.blocks.length,
      expanded: false,
      inputs: {}
    };
    this.ensureBlockBindings(block);
    this.blueprint.blocks.push(block);
    this.commitState();
  }

  remove(block: BlueprintBlock): void {
    if (this.editorBlock?.instanceId === block.instanceId) this.closeEditor();
    this.blueprint.blocks = this.blueprint.blocks.filter(candidate => candidate.instanceId !== block.instanceId);

    for (const remaining of this.blueprint.blocks) {
      for (const [inputName, binding] of Object.entries(remaining.inputs ?? {})) {
        if (binding.source === 'bb-output' && binding.sourceBlockId === block.instanceId) {
          remaining.inputs[inputName] = this.defaultUserBinding(remaining, inputName);
        }
      }
    }

    this.normalizeOrder();
    this.commitState();
  }

  toggleEditor(block: BlueprintBlock): void {
    if (this.editorBlock?.instanceId === block.instanceId) {
      this.closeEditor();
      return;
    }
    const definition = this.definitionMap.get(block.definitionId);
    const firstInput = definition?.inputs?.[0];
    if (!definition || !firstInput) return;
    this.openEditor(block, firstInput);
  }

  editInput(block: BlueprintBlock, inputName: string): void {
    const definition = this.definitionMap.get(block.definitionId);
    const input = definition?.inputs?.find(candidate => candidate.name === inputName);
    if (!definition || !input) return;
    this.openEditor(block, input);
  }

  selectEditorInputFromEvent(event: Event): void {
    const inputName = (event.target as HTMLSelectElement).value;
    if (!this.editorBlock || !this.editorDefinition) return;
    const input = this.editorDefinition.inputs.find(candidate => candidate.name === inputName);
    if (!input) return;
    this.openEditor(this.editorBlock, input);
  }

  closeEditor(): void {
    this.editorBlock = null;
    this.editorDefinition = null;
    this.editorInput = null;
    this.editorOutputCandidates = [];
    this.editorSource = 'user';
    this.editorValue = '';
    this.editorContextKey = 'project_identifier';
    this.editorOutputReference = '|';
  }

  setEditorSourceFromEvent(event: Event): void {
    const source = (event.target as HTMLSelectElement).value as InputSourceType;
    if (!this.editorBlock || !this.editorInput) return;
    this.ensureBlockBindings(this.editorBlock);

    const inputName = this.editorInput.name;
    const current = this.editorBlock.inputs[inputName];
    const next: InputBinding = { source };

    if (source === 'user' || source === 'platform-operator') {
      next.value = current?.value || `${this.editorBlock.definitionId.replace(/-/g, '_')}_${inputName}`;
    } else if (source === 'static') {
      next.value = current?.value || '';
    } else if (source === 'meshstack-context') {
      next.contextKey = current?.contextKey || 'project_identifier';
    } else if (source === 'bb-output') {
      const candidate = this.editorOutputCandidates[0];
      next.sourceBlockId = candidate?.block.instanceId;
      next.sourceOutput = candidate?.output;
    }

    this.editorBlock.inputs[inputName] = next;
    this.loadEditorBinding(next);
    this.commitState();
  }

  setEditorValueFromEvent(event: Event): void {
    if (!this.editorBlock || !this.editorInput) return;
    const value = (event.target as HTMLInputElement).value;
    const binding = this.editorBlock.inputs[this.editorInput.name];
    binding.value = value;
    this.editorValue = value;
    this.commitState();
  }

  setEditorContextFromEvent(event: Event): void {
    if (!this.editorBlock || !this.editorInput) return;
    const contextKey = (event.target as HTMLSelectElement).value;
    const binding: InputBinding = { source: 'meshstack-context', contextKey };
    this.editorBlock.inputs[this.editorInput.name] = binding;
    this.loadEditorBinding(binding);
    this.commitState();
  }

  setEditorOutputFromEvent(event: Event): void {
    if (!this.editorBlock || !this.editorInput) return;
    const value = (event.target as HTMLSelectElement).value;
    const [sourceBlockId, sourceOutput] = value.split('|');
    const binding: InputBinding = { source: 'bb-output', sourceBlockId, sourceOutput };
    this.editorBlock.inputs[this.editorInput.name] = binding;
    this.loadEditorBinding(binding);
    this.commitState();
  }

  onMetadataChanged(): void {
    this.terraformCode = generateTerraform(this.blueprint, this.catalog);
    void this.persist();
  }

  trackPlacement(_index: number, placement: CompositionPlacement): string {
    return placement.block.instanceId;
  }

  trackDefinition(_index: number, item: BuildingBlockDefinition): string {
    return item.id;
  }

  trackParameter(_index: number, item: ParameterDefinition): string {
    return item.name;
  }

  private openEditor(block: BlueprintBlock, input: ParameterDefinition): void {
    this.ensureBlockBindings(block);
    const definition = this.definitionMap.get(block.definitionId);
    if (!definition) return;

    this.editorBlock = block;
    this.editorDefinition = definition;
    this.editorInput = input;
    this.editorOutputCandidates = this.buildOutputCandidates(block);
    this.loadEditorBinding(block.inputs[input.name]);
  }

  private loadEditorBinding(binding: InputBinding): void {
    this.editorSource = binding.source;
    this.editorValue = binding.value ?? '';
    this.editorContextKey = binding.contextKey ?? 'project_identifier';
    this.editorOutputReference = `${binding.sourceBlockId ?? ''}|${binding.sourceOutput ?? ''}`;
  }

  private buildOutputCandidates(current: BlueprintBlock): OutputCandidate[] {
    return this.orderedBlocks
      .filter(block => block.instanceId !== current.instanceId)
      .flatMap(block => {
        const definition = this.definitionMap.get(block.definitionId);
        return (definition?.outputs ?? []).map(output => ({
          block,
          label: definition!.name,
          output: output.name
        }));
      });
  }

  private refreshCatalogGroups(): void {
    const q = this.query.trim().toLowerCase();
    const filtered = q
      ? this.catalog.filter(item => `${item.name} ${item.description} ${item.platform ?? ''}`.toLowerCase().includes(q))
      : this.catalog;

    const groups = new Map<string, BuildingBlockDefinition[]>();
    for (const item of filtered) {
      const platform = item.platform?.trim() || 'Other';
      if (!groups.has(platform)) groups.set(platform, []);
      groups.get(platform)!.push(item);
    }

    this.catalogGroups = [...groups.entries()]
      .map(([platform, items]) => ({
        platform,
        items: [...items].sort((a, b) => a.name.localeCompare(b.name))
      }))
      .sort((a, b) => a.platform.localeCompare(b.platform));
  }

  private refreshDerivedState(): void {
    this.orderedBlocks = [...this.blueprint.blocks].sort((a, b) => a.order - b.order);
    this.rebuildCompositionPlacements();
    this.rebuildContexts();
    this.terraformCode = generateTerraform(this.blueprint, this.catalog);

    if (this.editorBlock && this.editorInput) {
      const currentBlock = this.blueprint.blocks.find(block => block.instanceId === this.editorBlock!.instanceId);
      if (!currentBlock) {
        this.closeEditor();
      } else {
        this.editorBlock = currentBlock;
        this.editorDefinition = this.definitionMap.get(currentBlock.definitionId) ?? null;
        const binding = currentBlock.inputs[this.editorInput.name];
        if (binding) this.loadEditorBinding(binding);
        this.editorOutputCandidates = this.buildOutputCandidates(currentBlock);
      }
    }
  }

  private rebuildCompositionPlacements(): void {
    const blocks = this.orderedBlocks;
    const blockById = new Map(blocks.map(block => [block.instanceId, block]));
    const order = new Map(blocks.map((block, index) => [block.instanceId, index]));
    const parentIds = new Map<string, string[]>();

    for (const block of blocks) {
      const ids = [...new Set(
        Object.values(block.inputs ?? {})
          .filter(binding => binding.source === 'bb-output' && binding.sourceBlockId && blockById.has(binding.sourceBlockId))
          .map(binding => binding.sourceBlockId as string)
      )];
      parentIds.set(block.instanceId, ids);
    }

    const depthMemo = new Map<string, number>();
    const depthOf = (blockId: string, visiting = new Set<string>()): number => {
      const cached = depthMemo.get(blockId);
      if (cached !== undefined) return cached;
      if (visiting.has(blockId)) return 0;
      const parents = parentIds.get(blockId) ?? [];
      if (!parents.length) {
        depthMemo.set(blockId, 0);
        return 0;
      }
      const next = new Set(visiting);
      next.add(blockId);
      const depth = Math.max(...parents.map(parentId => depthOf(parentId, next))) + 1;
      depthMemo.set(blockId, depth);
      return depth;
    };

    blocks.forEach(block => depthOf(block.instanceId));
    const processOrder = [...blocks].sort((a, b) => {
      const depthDelta = (depthMemo.get(a.instanceId) ?? 0) - (depthMemo.get(b.instanceId) ?? 0);
      return depthDelta || (order.get(a.instanceId) ?? 0) - (order.get(b.instanceId) ?? 0);
    });

    const laneByBlock = new Map<string, number>();
    const occupied = new Set<string>();
    const placements: CompositionPlacement[] = [];
    let nextRootLane = 0;

    for (const block of processOrder) {
      const parents = (parentIds.get(block.instanceId) ?? [])
        .map(id => blockById.get(id))
        .filter((candidate): candidate is BlueprintBlock => !!candidate)
        .sort((a, b) => {
          const depthDelta = (depthMemo.get(b.instanceId) ?? 0) - (depthMemo.get(a.instanceId) ?? 0);
          return depthDelta || (order.get(a.instanceId) ?? 0) - (order.get(b.instanceId) ?? 0);
        });

      const column = depthMemo.get(block.instanceId) ?? 0;
      let row: number;
      if (!parents.length) {
        row = nextRootLane++;
      } else {
        row = laneByBlock.get(parents[0].instanceId) ?? nextRootLane++;
        while (occupied.has(`${row}:${column}`)) row = nextRootLane++;
      }

      const definition = this.definitionMap.get(block.definitionId);
      if (!definition) continue;
      laneByBlock.set(block.instanceId, row);
      occupied.add(`${row}:${column}`);
      placements.push({
        block,
        definition,
        row,
        column,
        primaryParent: parents[0] ? this.definitionMap.get(parents[0].definitionId)?.name : undefined,
        secondaryParents: parents.slice(1).map(parent => this.definitionMap.get(parent.definitionId)?.name).filter((name): name is string => !!name)
      });
    }

    this.compositionPlacements = placements.sort((a, b) => a.row - b.row || a.column - b.column);
    this.maxCompositionColumn = this.compositionPlacements.reduce((max, placement) => Math.max(max, placement.column), 0);
  }

  private rebuildContexts(): void {
    const pills: ContextPill[] = [];
    const staticGroups: ContextGroup[] = [];

    for (const block of this.orderedBlocks) {
      const definition = this.definitionMap.get(block.definitionId);
      if (!definition) continue;
      const staticItems: string[] = [];

      for (const [parameter, binding] of Object.entries(block.inputs ?? {})) {
        if (binding.source === 'user' || binding.source === 'platform-operator') {
          pills.push({ blockName: definition.name, parameter, operator: binding.source === 'platform-operator' });
        } else if (binding.source === 'static') {
          staticItems.push(`${parameter} = ${binding.value || '…'}`);
        }
      }

      if (staticItems.length) {
        staticGroups.push({ blockId: block.definitionId, blockName: definition.name, items: staticItems });
      }
    }

    this.userOperatorPills = pills;
    this.staticGroups = staticGroups;
  }

  private commitState(): void {
    this.refreshDerivedState();
    void this.persist();
  }

  private async persist(): Promise<void> {
    this.saved = false;
    await this.persistence.save(this.blueprint);
    this.saved = true;
  }

  private ensureBlockBindings(block: BlueprintBlock): void {
    const definition = this.definitionMap.get(block.definitionId);
    if (!definition) return;
    block.inputs = block.inputs ?? {};

    const validNames = new Set((definition.inputs ?? []).map(input => input.name));
    for (const existingName of Object.keys(block.inputs)) {
      if (!validNames.has(existingName)) delete block.inputs[existingName];
    }

    for (const input of definition.inputs ?? []) {
      const existing = block.inputs[input.name];
      if (!existing?.source) {
        block.inputs[input.name] = this.defaultUserBinding(block, input.name);
      } else if ((existing.source === 'user' || existing.source === 'platform-operator') && !existing.value) {
        existing.value = `${block.definitionId.replace(/-/g, '_')}_${input.name}`;
      }
    }
  }

  private defaultUserBinding(block: BlueprintBlock, inputName: string): InputBinding {
    return { source: 'user', value: `${block.definitionId.replace(/-/g, '_')}_${inputName}` };
  }

  private normalizeOrder(): void {
    [...this.blueprint.blocks]
      .sort((a, b) => a.order - b.order)
      .forEach((block, index) => block.order = index);
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
