/**
 * Agent Capability Manifest Interfaces
 * TLP:CLEAR
 * 
 * Defines agent capability declarations for intelligent delegation and task assignment.
 * 
 * @version 1.0.0
 * @date 2026-02-13
 */

/**
 * Resource requirements for task execution
 */
export interface ResourceRequirements {
  /** Estimated memory usage in MB */
  memory_mb?: number;
  
  /** Estimated CPU usage (0-1 scale, 1 = 100% of one core) */
  cpu_cores?: number;
  
  /** Estimated network bandwidth in Mbps */
  network_mbps?: number;
  
  /** Estimated disk space in MB */
  disk_mb?: number;
  
  /** Required environment variables */
  env_vars?: string[];
  
  /** External dependencies (npm packages, system libs, etc.) */
  dependencies?: string[];
}

/**
 * Individual capability declaration
 */
export interface AgentCapability {
  /** Unique capability identifier (e.g., "code_generation", "test_writing") */
  capability_id: string;
  
  /** Human-readable capability name */
  name: string;
  
  /** Detailed capability description */
  description: string;
  
  /** Agent's confidence level for this capability (0-1 scale) */
  confidence_level: number;
  
  /** Estimated time to complete typical task (milliseconds) */
  completion_time_estimate_ms: number;
  
  /** Success rate from historical executions (0-1 scale) */
  success_rate?: number;
  
  /** Number of successful completions for this capability */
  successful_completions?: number;
  
  /** Resource requirements for this capability */
  resource_requirements?: ResourceRequirements;
  
  /** Supported task types or patterns */
  supported_patterns?: string[];
  
  /** Known limitations or constraints */
  limitations?: string[];
  
  /** TLP clearance level for this capability */
  tlp_clearance?: 'TLP:CLEAR' | 'TLP:GREEN' | 'TLP:AMBER' | 'TLP:RED';
  
  /** Tags for capability categorization */
  tags?: string[];
  
  /** Last updated timestamp */
  last_updated?: string;
}

/**
 * Complete agent capability manifest
 */
export interface AgentCapabilityManifest {
  /** Unique agent identifier */
  agent_id: string;
  
  /** Agent name */
  agent_name: string;
  
  /** Agent version */
  version: string;
  
  /** List of capabilities this agent can perform */
  capabilities: AgentCapability[];
  
  /** Overall agent confidence score (0-1 scale) */
  overall_confidence?: number;
  
  /** Agent availability status */
  availability?: 'available' | 'busy' | 'offline' | 'maintenance';
  
  /** Current workload (number of active tasks) */
  current_workload?: number;
  
  /** Maximum concurrent tasks supported */
  max_concurrent_tasks?: number;
  
  /** Agent specialization areas */
  specializations?: string[];
  
  /** Preferred task types */
  preferred_task_types?: string[];
  
  /** Avoided task types */
  avoided_task_types?: string[];
  
  /** Reputation score from reputation engine */
  reputation_score?: number;
  
  /** Total successful task completions */
  total_completions?: number;
  
  /** Average task completion time (milliseconds) */
  avg_completion_time_ms?: number;
  
  /** Metadata */
  metadata?: Record<string, any>;
  
  /** Manifest creation/update timestamp */
  created_at: string;
  updated_at?: string;
}

/**
 * Task-capability match result
 */
export interface TaskCapabilityMatch {
  /** Agent ID */
  agent_id: string;
  
  /** Agent name */
  agent_name: string;
  
  /** Matched capability */
  capability: AgentCapability;
  
  /** Match confidence score (0-1 scale) */
  match_score: number;
  
  /** Reasons for the match */
  match_reasons: string[];
  
  /** Estimated completion time for this task (milliseconds) */
  estimated_completion_time_ms: number;
  
  /** Agent availability status */
  availability: 'available' | 'busy' | 'offline' | 'maintenance';
  
  /** Current agent workload */
  current_workload: number;
  
  /** Recommendation priority (higher = better match) */
  priority: number;
  
  /** Warnings or caveats about this match */
  warnings?: string[];
}

/**
 * Capability query criteria
 */
export interface CapabilityQuery {
  /** Required capability IDs */
  required_capabilities?: string[];
  
  /** Minimum confidence level (0-1 scale) */
  min_confidence?: number;
  
  /** Maximum completion time (milliseconds) */
  max_completion_time_ms?: number;
  
  /** Required TLP clearance level */
  required_tlp_clearance?: 'TLP:CLEAR' | 'TLP:GREEN' | 'TLP:AMBER' | 'TLP:RED';
  
  /** Required success rate (0-1 scale) */
  min_success_rate?: number;
  
  /** Required minimum completions */
  min_completions?: number;
  
  /** Task patterns to match */
  task_patterns?: string[];
  
  /** Required tags */
  required_tags?: string[];
  
  /** Exclude agents */
  exclude_agents?: string[];
  
  /** Only include available agents */
  only_available?: boolean;
}

/**
 * Capability registry interface
 */
export interface ICapabilityRegistry {
  /**
   * Register agent capability manifest
   */
  registerManifest(manifest: AgentCapabilityManifest): void;
  
  /**
   * Update agent capability manifest
   */
  updateManifest(agentId: string, manifest: Partial<AgentCapabilityManifest>): void;
  
  /**
   * Get agent capability manifest
   */
  getManifest(agentId: string): AgentCapabilityManifest | undefined;
  
  /**
   * Query agents by capability criteria
   */
  queryCapabilities(query: CapabilityQuery): TaskCapabilityMatch[];
  
  /**
   * Update agent availability
   */
  updateAvailability(agentId: string, availability: 'available' | 'busy' | 'offline' | 'maintenance'): void;
  
  /**
   * Update agent workload
   */
  updateWorkload(agentId: string, currentWorkload: number): void;
  
  /**
   * Delete agent manifest
   */
  deleteManifest(agentId: string): void;
  
  /**
   * List all agent manifests
   */
  listManifests(): AgentCapabilityManifest[];
}

/**
 * Delegation capability requirement for task delegation
 */
export interface DelegationCapability {
  /** Capability identifier */
  capability_id: string;

  /** Human-readable capability name */
  name?: string;

  /** Capability description */
  description?: string;

  /** Relative priority weight */
  priority?: number;
  
  /** Required confidence level (0-1 scale) */
  min_confidence?: number;
  
  /** Maximum acceptable completion time (milliseconds) */
  max_completion_time_ms?: number;
  
  /** Required success rate (0-1 scale) */
  min_success_rate?: number;
  
  /** Additional requirements or constraints */
  requirements?: Record<string, any>;
}

/**
 * Agent recommendation for task delegation
 */
export interface DelegationRecommendation {
  /** Recommended agent ID */
  agent_id: string;
  
  /** Agent name */
  agent_name: string;
  
  /** Matched capabilities */
  matched_capabilities: TaskCapabilityMatch[];
  
  /** Overall recommendation score (0-1 scale) */
  recommendation_score: number;
  
  /** Reasons for recommendation */
  recommendation_reasons: string[];
  
  /** Estimated total completion time (milliseconds) */
  estimated_completion_time_ms: number;
  
  /** Agent availability */
  availability: 'available' | 'busy' | 'offline' | 'maintenance';
  
  /** Potential issues or warnings */
  warnings?: string[];
  
  /** Confidence in recommendation (0-1 scale) */
  confidence: number;
}
