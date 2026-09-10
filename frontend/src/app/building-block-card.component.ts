import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { BuildingBlockDefinition, ImplementationType, InputBinding, ParameterDefinition } from './models';

export interface BuildingBlockInputClick {
  input: ParameterDefinition;
  event: MouseEvent;
}

@Component({
  selector: 'app-building-block-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './building-block-card.component.html',
  styleUrl: './building-block-card.component.css'
})
export class BuildingBlockCardComponent {
  @Input({ required: true }) definition!: BuildingBlockDefinition;
  @Input() expanded = false;
  @Input() action: 'add' | 'remove' = 'add';
  @Input() bindings: Record<string, InputBinding> = {};
  @Input() interactiveInputs = false;

  @Output() actionClick = new EventEmitter<void>();
  @Output() expandedChange = new EventEmitter<boolean>();
  @Output() inputClick = new EventEmitter<BuildingBlockInputClick>();

  toggleExpanded(): void {
    this.expanded = !this.expanded;
    this.expandedChange.emit(this.expanded);
  }

  triggerAction(event: MouseEvent): void {
    event.stopPropagation();
    this.actionClick.emit();
  }

  triggerInput(input: ParameterDefinition, event: MouseEvent): void {
    if (!this.interactiveInputs) return;
    event.stopPropagation();
    this.inputClick.emit({ input, event });
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

  inputSourceClass(inputName: string): string {
    switch (this.bindings?.[inputName]?.source) {
      case 'meshstack-context': return 'source-meshstack';
      case 'static': return 'source-static';
      case 'user': return 'source-user';
      case 'platform-operator': return 'source-operator';
      case 'bb-output': return 'source-bb-output';
      default: return '';
    }
  }

  get actionSymbol(): string {
    return this.action === 'add' ? '+' : '×';
  }

  get actionTitle(): string {
    return this.action === 'add' ? 'Add Building Block' : 'Remove Building Block';
  }
}
