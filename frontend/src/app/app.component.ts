import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostListener, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BuildingBlockCardComponent } from './building-block-card.component';
import { CATALOG } from './catalog';
import { Blueprint, BlueprintBlock, BuildingBlockDefinition, InputBinding, InputSourceType, ParameterDefinition } from './models';
import { PersistenceService } from './persistence.service';
import { generateTerraform } from './terraform';

interface ContextGroup {
  blockId: string;
  blockName: string;
  items: string[];
}

interface UserOperatorParameter {
  name: string;
  operator: boolean;
}

interface UserOperatorGroup {
  blockId: string;
  blockName: string;
  items: UserOperatorParameter[];
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

interface OutputCandidate {
  block: BlueprintBlock;
  label: string;
  output: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, BuildingBlockCardComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  private persistence = inject(PersistenceService);
  private changeDetector = inject(ChangeDetectorRef);
  private definitionMap = new Map(CATALOG.map(item => [item.id, item]));
  private outputCandidateCache = new Map<string, OutputCandidate[]>();
  private batchEditorOpen = new Set<string>();

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
  compositionPlacements: CompositionPlacement[] = [];
  maxCompositionColumn = 0;
  terraformCode = '';

  quickEditorBlock: BlueprintBlock | null = null;
  quickEditorInput: ParameterDefinition | null = null;
  quickEditorLeft = 0;
  quickEditorTop = 0;

  async ngOnInit(): Promise<void> {
    const restored = (await this.persistence.loadLast()) ?? this.newBlueprint();
    const knownDefinitions = new Set(this.catalog.map(item => item.id));
    restored.blocks = (restored.blocks ?? []).filter(block => knownDefinitions.has(block.definitionId));
    const knownInstances = new Set(restored.blocks.map(block => block.instanceId));

    restored.blocks.forEach((block, index) => {
      block.order = index;
      block.expanded = true;
      this.ensureBlockBindings(block);
      for (const [inputName, binding] of Object.entries(block.inputs)) {
        if (binding.source === 'bb-output' && (!binding.sourceBlockId || !knownInstances.has(binding.sourceBlockId))) {
          block.inputs[inputName] = this.defaultUnassignedBinding();
          continue;
        }

        const formerImplicitValue = `${block.definitionId.replace(/-/g, '_')}_${inputName}`;
        if (binding.source === 'user' && binding.value === formerImplicitValue) {
          block.inputs[inputName] = this.defaultUnassignedBinding();
        }
      }
    });

    this.blueprint = { ...restored, blocks: [...restored.blocks] };
    this.rebuildDerivedStructure();
    this.refreshTerraform();
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
      .map(([platform, items]) => ({ platform, items: [...items].sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => a.platform.localeCompare(b.platform));
  }

  get orderedBlocks(): BlueprintBlock[] {
    return [...this.blueprint.blocks].sort((a, b) => a.order - b.order);
  }

  get userOperatorGroups(): UserOperatorGroup[] {
    return this.orderedBlocks.flatMap(block => {
      const definition = this.definition(block);
      const items = Object.entries(block.inputs ?? {})
        .filter(([, binding]) => binding.source === 'user' || binding.source === 'platform-operator')
        .map(([name, binding]) => ({ name, operator: binding.source === 'platform-operator' }));
      return items.length ? [{ blockId: block.definitionId, blockName: definition.name, items }] : [];
    });
  }

  get staticGroups(): ContextGroup[] {
    return this.contextGroups(['static']);
  }

  definition(block: BlueprintBlock): BuildingBlockDefinition {
    const definition = this.definitionMap.get(block.definitionId);
    if (!definition) throw new Error(`Unknown Building Block definition: ${block.definitionId}`);
    return definition;
  }

  add(definition: BuildingBlockDefinition): void {
    if (this.blueprint.blocks.some(block => block.definitionId === definition.id)) return;
    const block: BlueprintBlock = {
      instanceId: crypto.randomUUID(),
      definitionId: definition.id,
      order: this.blueprint.blocks.length,
      expanded: true,
      inputs: {}
    };
    this.ensureBlockBindings(block);
    this.blueprint = { ...this.blueprint, blocks: [...this.blueprint.blocks, block] };
    this.structureChanged();
    this.scrollToNewestBlock();
  }

  remove(block: BlueprintBlock): void {
    const name = this.definition(block).name;
    if (!window.confirm(`Remove “${name}” from this solution?`)) return;

    if (this.quickEditorBlock?.instanceId === block.instanceId) this.closeQuickEditor();
    this.batchEditorOpen.delete(block.instanceId);

    const remainingBlocks = this.blueprint.blocks
      .filter(candidate => candidate.instanceId !== block.instanceId)
      .map(candidate => ({ ...candidate, inputs: { ...candidate.inputs } }));

    for (const remaining of remainingBlocks) {
      for (const [inputName, binding] of Object.entries(remaining.inputs ?? {})) {
        if (binding.source === 'bb-output' && binding.sourceBlockId === block.instanceId) {
          remaining.inputs[inputName] = this.defaultUnassignedBinding();
        }
      }
    }

    remainingBlocks.sort((a, b) => a.order - b.order).forEach((candidate, index) => candidate.order = index);
    this.blueprint = { ...this.blueprint, blocks: remainingBlocks };
    this.structureChanged();
  }

  toggleExpanded(block: BlueprintBlock): void {
    block.expanded = !block.expanded;
    if (!block.expanded) {
      this.batchEditorOpen.delete(block.instanceId);
      if (this.quickEditorBlock?.instanceId === block.instanceId) this.closeQuickEditor();
    }
    this.changeDetector.detectChanges();
  }

  toggleBatchEditor(block: BlueprintBlock): void {
    const next = new Set(this.batchEditorOpen);
    if (next.has(block.instanceId)) next.delete(block.instanceId);
    else next.add(block.instanceId);
    this.batchEditorOpen = next;
    this.changeDetector.detectChanges();
  }

  isBatchEditorOpen(block: BlueprintBlock): boolean {
    return this.batchEditorOpen.has(block.instanceId);
  }

  openQuickEditor(block: BlueprintBlock, inputName: string, event: MouseEvent): void {
    event.stopPropagation();
    this.ensureBlockBindings(block);
    const input = this.definition(block).inputs.find(candidate => candidate.name === inputName);
    if (!input) return;

    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const popupWidth = 340;
    const popupHeight = 290;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    this.quickEditorLeft = Math.max(8, Math.min(rect.left, viewportWidth - popupWidth - 8));
    const below = rect.bottom + 6;
    this.quickEditorTop = below + popupHeight <= viewportHeight - 8
      ? below
      : Math.max(8, rect.top - popupHeight - 6);

    this.quickEditorBlock = block;
    this.quickEditorInput = input;
    this.changeDetector.detectChanges();
  }

  closeQuickEditor(): void {
    this.quickEditorBlock = null;
    this.quickEditorInput = null;
  }

  @HostListener('document:click')
  closeQuickEditorOnOutsideClick(): void {
    if (!this.quickEditorBlock) return;
    this.closeQuickEditor();
    this.changeDetector.detectChanges();
  }

  quickSource(): InputSourceType {
    if (!this.quickEditorBlock || !this.quickEditorInput) return 'unassigned';
    return this.quickEditorBlock.inputs[this.quickEditorInput.name]?.source ?? 'unassigned';
  }

  setQuickSource(source: InputSourceType): void {
    if (!this.quickEditorBlock || !this.quickEditorInput) return;
    this.setSource(this.quickEditorBlock, this.quickEditorInput.name, source);
  }

  setQuickStaticValue(value: string): void {
    if (!this.quickEditorBlock || !this.quickEditorInput) return;
    this.setBindingValue(this.quickEditorBlock, this.quickEditorInput.name, value);
  }

  setQuickContextKey(contextKey: string): void {
    if (!this.quickEditorBlock || !this.quickEditorInput) return;
    this.setContextKey(this.quickEditorBlock, this.quickEditorInput.name, contextKey);
  }

  setQuickOutputReference(value: string): void {
    if (!this.quickEditorBlock || !this.quickEditorInput) return;
    this.setOutputReference(this.quickEditorBlock, this.quickEditorInput.name, value);
  }

  setSource(block: BlueprintBlock, input: string, source: InputSourceType): void {
    this.ensureBlockBindings(block);
    const current = block.inputs[input];
    const next: InputBinding = { source };

    if (source === 'user' || source === 'platform-operator') {
      next.value = `${block.definitionId.replace(/-/g, '_')}_${input}`;
    } else if (source === 'static') {
      next.value = current?.source === 'static' ? current.value || '' : '';
    } else if (source === 'meshstack-context') {
      next.contextKey = current?.source === 'meshstack-context' ? current.contextKey || 'project_identifier' : 'project_identifier';
    } else if (source === 'bb-output') {
      const candidate = this.outputCandidates(block)[0];
      next.sourceBlockId = candidate?.block.instanceId;
      next.sourceOutput = candidate?.output;
    }

    block.inputs[input] = next;
    this.structureChanged();
  }

  setBindingValue(block: BlueprintBlock, inputName: string, value: string): void {
    this.ensureBlockBindings(block);
    block.inputs[inputName].value = value;
    this.refreshTerraform();
    void this.persist();
  }

  setContextKey(block: BlueprintBlock, inputName: string, contextKey: string): void {
    this.ensureBlockBindings(block);
    const current = block.inputs[inputName];
    block.inputs[inputName] = { ...current, source: 'meshstack-context', contextKey };
    this.refreshTerraform();
    void this.persist();
  }

  outputReferenceValue(block: BlueprintBlock, inputName: string): string {
    const current = block.inputs[inputName];
    return `${current?.sourceBlockId ?? ''}|${current?.sourceOutput ?? ''}`;
  }

  outputCandidates(current: BlueprintBlock): OutputCandidate[] {
    return this.outputCandidateCache.get(current.instanceId) ?? [];
  }

  setOutputReference(block: BlueprintBlock, input: string, value: string): void {
    this.ensureBlockBindings(block);
    const [sourceBlockId, sourceOutput] = value.split('|');
    block.inputs[input] = { source: 'bb-output', sourceBlockId, sourceOutput };
    this.structureChanged();
  }

  trackPlacement(_index: number, placement: CompositionPlacement): string {
    return placement.block.instanceId;
  }

  trackDefinition(_index: number, item: BuildingBlockDefinition): string {
    return item.id;
  }

  trackCatalogGroup(_index: number, group: CatalogGroup): string {
    return group.platform;
  }

  trackParameter(_index: number, item: { name: string }): string {
    return item.name;
  }

  trackOutputCandidate(_index: number, item: OutputCandidate): string {
    return `${item.block.instanceId}:${item.output}`;
  }

  async changed(): Promise<void> {
    this.refreshTerraform();
    await this.persist();
    this.changeDetector.detectChanges();
  }

  private structureChanged(): void {
    this.rebuildDerivedStructure();
    this.refreshTerraform();
    this.changeDetector.detectChanges();
    void this.persist();
  }

  private scrollToNewestBlock(): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const cards = Array.from(document.querySelectorAll<HTMLElement>('.lane-card'));
        const card = cards.at(-1);
        if (!card) return;

        const rect = card.getBoundingClientRect();
        const margin = 24;
        const outsideViewport = rect.top < margin
          || rect.bottom > window.innerHeight - margin
          || rect.left < margin
          || rect.right > window.innerWidth - margin;

        if (outsideViewport) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        }
      });
    });
  }

  private refreshTerraform(): void {
    this.terraformCode = generateTerraform(this.blueprint, this.catalog);
  }

  private async persist(): Promise<void> {
    this.saved = false;
    await this.persistence.save(this.blueprint);
    this.saved = true;
    this.changeDetector.detectChanges();
  }

  private rebuildDerivedStructure(): void {
    this.rebuildOutputCandidates();
    this.rebuildCompositionLayout();
  }

  private rebuildOutputCandidates(): void {
    const blocks = this.orderedBlocks;
    this.outputCandidateCache = new Map();
    for (const current of blocks) {
      const candidates = blocks
        .filter(block => block.instanceId !== current.instanceId)
        .flatMap(block => {
          const definition = this.definition(block);
          return (definition.outputs ?? []).map(output => ({ block, label: definition.name, output: output.name }));
        });
      this.outputCandidateCache.set(current.instanceId, candidates);
    }
  }

  private rebuildCompositionLayout(): void {
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
        row = laneByBlock.get(parents[0].instanceId) ?? nextRootLane++;
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

    this.compositionPlacements = placements.sort((a, b) => a.row - b.row || a.column - b.column);
    this.maxCompositionColumn = this.compositionPlacements.reduce((max, placement) => Math.max(max, placement.column), 0);
  }

  private parentBlocks(block: BlueprintBlock): BlueprintBlock[] {
    const ids = new Set(
      Object.values(block.inputs ?? {})
        .filter(binding => binding.source === 'bb-output' && binding.sourceBlockId)
        .map(binding => binding.sourceBlockId as string)
    );
    return this.orderedBlocks.filter(candidate => ids.has(candidate.instanceId));
  }

  private ensureBlockBindings(block: BlueprintBlock): void {
    const definition = this.definitionMap.get(block.definitionId);
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
        block.inputs[input.name] = this.defaultUnassignedBinding();
      }
    }
  }

  private defaultUnassignedBinding(): InputBinding {
    return { source: 'unassigned' };
  }

  private contextGroups(sources: InputSourceType[]): ContextGroup[] {
    const allowed = new Set<InputSourceType>(sources);
    return this.orderedBlocks.flatMap(block => {
      const items = Object.entries(block.inputs ?? {})
        .filter(([, binding]) => allowed.has(binding.source))
        .map(([name, binding]) => binding.source === 'static' ? `${name} = ${binding.value || '…'}` : name);

      return items.length ? [{ blockId: block.definitionId, blockName: this.definition(block).name, items }] : [];
    });
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
