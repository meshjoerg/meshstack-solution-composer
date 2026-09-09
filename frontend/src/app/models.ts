export type InputSourceType = 'user' | 'platform-operator' | 'static' | 'meshstack-context' | 'bb-output';
export type BuildingBlockSourceType = 'hub' | 'marketplace' | 'custom';
export type ImplementationType = 'opentofu' | 'github-actions' | 'gitlab-cicd' | 'manual' | 'azure-devops';

export interface ParameterDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object';
  description?: string;
}

export interface BuildingBlockSource {
  type: BuildingBlockSourceType;
  label: string;
  icon: string;
}

export interface BuildingBlockImplementation {
  type: ImplementationType;
  label: string;
  icon: string;
}

export interface BuildingBlockDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  logoUrl?: string;
  platform?: string;
  codeUrl?: string;
  source: BuildingBlockSource;
  implementation: BuildingBlockImplementation;
  inputs: ParameterDefinition[];
  outputs: ParameterDefinition[];
}

export interface InputBinding {
  source: InputSourceType;
  value?: string;
  contextKey?: string;
  sourceBlockId?: string;
  sourceOutput?: string;
}

export interface BlueprintBlock {
  instanceId: string;
  definitionId: string;
  order: number;
  expanded: boolean;
  inputs: Record<string, InputBinding>;
}

export interface Blueprint {
  id: string;
  name: string;
  identifier: string;
  description: string;
  workingRepo: string;
  repoPath: string;
  blocks: BlueprintBlock[];
}
