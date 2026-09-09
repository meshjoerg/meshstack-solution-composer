export type InputSourceType = 'user' | 'static' | 'meshstack-context' | 'bb-output';

export interface ParameterDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object';
  description?: string;
}

export interface BuildingBlockDefinition {
  id: string;
  name: string;
  description: string;
  source: string;
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
