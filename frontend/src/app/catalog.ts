import { HUB_CATALOG } from './hub-catalog.generated';
import { BuildingBlockDefinition } from './models';

const DEMO_CATALOG: BuildingBlockDefinition[] = [
  {
    id: 'network', name: 'Network Foundation', icon: '🕸️',
    source: { type: 'hub', label: 'meshStack Hub', icon: '◆' },
    implementation: { type: 'opentofu', label: 'OpenTofu', icon: '⬡' },
    description: 'Creates the network foundation for the solution.',
    inputs: [
      { name: 'project_id', type: 'string', description: 'meshStack project identifier used to scope the network.' },
      { name: 'region', type: 'string', description: 'Target cloud region for the network resources.' },
      { name: 'cidr', type: 'string', description: 'CIDR range reserved for the solution network.' }
    ],
    outputs: [
      { name: 'network_id', type: 'string', description: 'Identifier of the created network.' },
      { name: 'subnet_ids', type: 'object', description: 'Created subnets keyed by logical name.' }
    ]
  },
  {
    id: 'kubernetes', name: 'Managed Kubernetes', icon: '⎈',
    source: { type: 'marketplace', label: 'meshStack Marketplace', icon: '▦' },
    implementation: { type: 'github-actions', label: 'GitHub Actions', icon: '●' },
    description: 'Managed Kubernetes cluster used as the application runtime.',
    inputs: [
      { name: 'project_id', type: 'string', description: 'meshStack project identifier that owns the cluster.' },
      { name: 'network_id', type: 'string', description: 'Network the cluster should attach to.' },
      { name: 'region', type: 'string', description: 'Target region for the cluster.' },
      { name: 'version', type: 'string', description: 'Kubernetes version to deploy.' }
    ],
    outputs: [
      { name: 'cluster_id', type: 'string', description: 'Identifier of the created cluster.' },
      { name: 'endpoint', type: 'string', description: 'API endpoint of the Kubernetes cluster.' },
      { name: 'kubeconfig', type: 'string', description: 'Kubeconfig credential material.' }
    ]
  },
  {
    id: 'iam', name: 'Identity & Access', icon: '🔐',
    source: { type: 'custom', label: 'Custom', icon: '✦' },
    implementation: { type: 'manual', label: 'Manual Configuration', icon: '⚙' },
    description: 'Connects solution access to enterprise identity.',
    inputs: [
      { name: 'tenant_id', type: 'string', description: 'Tenant identifier of the target identity environment.' },
      { name: 'admin_group', type: 'string', description: 'Enterprise group receiving administrative access.' }
    ],
    outputs: [{ name: 'identity_provider_id', type: 'string', description: 'Identifier of the configured identity provider.' }]
  },
  {
    id: 'ai-gateway', name: 'AI Gateway', icon: '✦',
    source: { type: 'hub', label: 'meshStack Hub', icon: '◆' },
    implementation: { type: 'gitlab-cicd', label: 'GitLab CI/CD', icon: '◆' },
    description: 'Governed gateway for AI model access.',
    inputs: [
      { name: 'cluster_endpoint', type: 'string', description: 'Runtime endpoint on which the gateway is deployed.' },
      { name: 'identity_provider_id', type: 'string', description: 'Identity provider used to authenticate consumers.' },
      { name: 'default_model', type: 'string', description: 'Default model exposed through the gateway.' }
    ],
    outputs: [
      { name: 'gateway_url', type: 'string', description: 'Public solution URL of the AI gateway.' },
      { name: 'api_endpoint', type: 'string', description: 'Programmatic endpoint used by workloads.' }
    ]
  },
  {
    id: 'model-access', name: 'Model Access', icon: '◉',
    source: { type: 'marketplace', label: 'meshStack Marketplace', icon: '▦' },
    implementation: { type: 'azure-devops', label: 'Azure DevOps', icon: '◇' },
    description: 'Configures an approved model portfolio for the solution.',
    inputs: [
      { name: 'gateway_url', type: 'string', description: 'AI gateway through which approved models are exposed.' },
      { name: 'model', type: 'string', description: 'Approved model identifier to provision for the solution.' }
    ],
    outputs: [{ name: 'model_endpoint', type: 'string', description: 'Endpoint of the approved model.' }]
  },
  {
    id: 'observability', name: 'Observability', icon: '◒',
    source: { type: 'custom', label: 'Custom', icon: '✦' },
    implementation: { type: 'opentofu', label: 'OpenTofu', icon: '⬡' },
    description: 'Monitoring and operational visibility for the solution.',
    inputs: [
      { name: 'cluster_id', type: 'string', description: 'Cluster whose workloads and infrastructure are monitored.' },
      { name: 'retention_days', type: 'number', description: 'Number of days telemetry data is retained.' }
    ],
    outputs: [{ name: 'dashboard_url', type: 'string', description: 'URL of the operational dashboard.' }]
  }
];

function normalizeHubItem(item: BuildingBlockDefinition): BuildingBlockDefinition {
  const cleanName = item.name
    .replace(/\s+Building\s*Block(?:\s+Definition)?s?\s*$/i, '')
    .trim();

  const platform = item.platform?.trim() ?? '';
  const officialIntegration = item.officialIntegration
    ?? /\bofficial\s+integration\b/i.test(item.description)
    ?? false;

  return {
    ...item,
    name: cleanName || item.name,
    // The Hub currently marks AWS as an official platform integration. Keep this
    // prototype fallback until the generated catalog exposes the marker directly.
    officialIntegration: officialIntegration || platform.toUpperCase() === 'AWS'
  };
}

// Once sync-hub.mjs generated a real Hub snapshot, it becomes the catalog.
// The demo catalog remains a fallback so the app also starts offline.
export const CATALOG: BuildingBlockDefinition[] = HUB_CATALOG.length
  ? HUB_CATALOG.map(normalizeHubItem)
  : DEMO_CATALOG;
