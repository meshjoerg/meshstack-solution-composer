import { BuildingBlockDefinition } from './models';

export const CATALOG: BuildingBlockDefinition[] = [
  {
    id: 'network', name: 'Network Foundation', source: 'meshStack Hub',
    description: 'Creates the network foundation for the solution.',
    inputs: [
      { name: 'project_id', type: 'string' },
      { name: 'region', type: 'string' },
      { name: 'cidr', type: 'string' }
    ],
    outputs: [
      { name: 'network_id', type: 'string' },
      { name: 'subnet_ids', type: 'object' }
    ]
  },
  {
    id: 'kubernetes', name: 'Managed Kubernetes', source: 'meshStack Hub',
    description: 'Managed Kubernetes cluster used as the application runtime.',
    inputs: [
      { name: 'project_id', type: 'string' },
      { name: 'network_id', type: 'string' },
      { name: 'region', type: 'string' },
      { name: 'version', type: 'string' }
    ],
    outputs: [
      { name: 'cluster_id', type: 'string' },
      { name: 'endpoint', type: 'string' },
      { name: 'kubeconfig', type: 'string' }
    ]
  },
  {
    id: 'iam', name: 'Identity & Access', source: 'meshStack Hub',
    description: 'Connects solution access to enterprise identity.',
    inputs: [
      { name: 'tenant_id', type: 'string' },
      { name: 'admin_group', type: 'string' }
    ],
    outputs: [{ name: 'identity_provider_id', type: 'string' }]
  },
  {
    id: 'ai-gateway', name: 'AI Gateway', source: 'meshStack Hub',
    description: 'Governed gateway for AI model access.',
    inputs: [
      { name: 'cluster_endpoint', type: 'string' },
      { name: 'identity_provider_id', type: 'string' },
      { name: 'default_model', type: 'string' }
    ],
    outputs: [
      { name: 'gateway_url', type: 'string' },
      { name: 'api_endpoint', type: 'string' }
    ]
  },
  {
    id: 'model-access', name: 'Model Access', source: 'meshStack Hub',
    description: 'Configures an approved model portfolio for the solution.',
    inputs: [
      { name: 'gateway_url', type: 'string' },
      { name: 'model', type: 'string' }
    ],
    outputs: [{ name: 'model_endpoint', type: 'string' }]
  },
  {
    id: 'observability', name: 'Observability', source: 'meshStack Hub',
    description: 'Monitoring and operational visibility for the solution.',
    inputs: [
      { name: 'cluster_id', type: 'string' },
      { name: 'retention_days', type: 'number' }
    ],
    outputs: [{ name: 'dashboard_url', type: 'string' }]
  }
];
