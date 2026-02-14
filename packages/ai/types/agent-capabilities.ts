/**
 * DCYFR Agent Capability Manifest Types
 * TLP:AMBER - Internal Use Only
 * 
 * Type definitions for agent capability declaration and matching.
 * Enables intelligent task delegation based on agent capabilities,
 * confidence levels, and resource requirements.
 * 
 * @module agent-capabilities
 * @version 1.0.0
 * @date 2026-02-13
 */

/**
 * Resource types for capability requirements
 */
export type ResourceType =
  | 'cpu'           // CPU cores
  | 'memory'        // Memory in MB
  | 'disk'          // Disk space in MB
  | 'network'       // Network bandwidth in Mbps
  | 'api_tokens'    // API token budget
  | 'time_ms';      // Time budget in milliseconds

/**
 * Resource requirements for a capability
 */
export interface ResourceRequirement {
  /** Resource type */
  type: ResourceType;
  
  /** Minimum required amount */
  minimum?: number;
  
  /** Recommended amount */
  recommended?: number;
  
  /** Maximum amount that can be utilized */
  maximum?: number;
  
  /** Unit of measurement */
  unit?: string;
}

/**
 * Capability category classification
 */
export type CapabilityCategory =
  | 'code_generation'      // Writing/generating code
  | 'code_review'          // Reviewing and analyzing code
  | 'testing'              // Writing and running tests
  | 'documentation'        // Creating documentation
  | 'debugging'            // Finding and fixing bugs
  | 'refactoring'          // Code restructuring
  | 'architecture'         // System design and architecture
  | 'security'             // Security analysis and hardening
  | 'performance'          // Performance optimization
  | 'deployment'           // Deployment and DevOps
  | 'data_analysis'        // Data processing and analysis
  | 'research'             // Research and investigation
  | 'planning'             // Task planning and coordination
  | 'validation'           // Quality assurance and validation
  | 'communication'        // Documentation and communication
  | 'general';             // General-purpose tasks

/**
 * Capability proficiency level
 */
export type ProficiencyLevel =
  | 'novice'        // Learning, low confidence
  | 'intermediate'  // Can handle common cases
  | 'advanced'      // Handles complex cases well
  | 'expert'        // Handles edge cases and optimization
  | 'master';       // Specialized, highest quality

/**
 * Confidence calibration metadata
 * Tracks how confidence scores are calibrated over time
 */
export interface ConfidenceCalibration {
  /** Total tasks evaluated */
  total_evaluations: number;
  
  /** Successful outcomes */
  successful_outcomes: number;
  
  /** Calibration accuracy (how often confidence matches actual outcome) */
  calibration_accuracy: number;
  
  /** Last calibration timestamp */
  last_calibrated_at: string;
  
  /** Calibration method used */
  calibration_method?: 'historical' | 'peer_comparison' | 'expert_assessment' | 'automated';
}

/**
 * Performance statistics for a capability
 */
export interface CapabilityPerformance {
  /** Average completion time in milliseconds */
  avg_completion_time_ms: number;
  
  /** Minimum completion time observed */
  min_completion_time_ms: number;
  
  /** Maximum completion time observed */
  max_completion_time_ms: number;
  
  /** 95th percentile completion time */
  p95_completion_time_ms?: number;
  
  /** Success rate (0.0 to 1.0) */
  success_rate: number;
  
  /** Total tasks completed with this capability */
  total_tasks: number;
  
  /** Quality score average (0.0 to 1.0) */
  avg_quality_score?: number;
}

/**
 * Dependency on other capabilities or agents
 */
export interface CapabilityDependency {
  /** Type of dependency */
  type: 'capability' | 'agent' | 'tool' | 'service';
  
  /** Identifier of the dependency */
  identifier: string;
  
  /** Minimum version required */
  minimum_version?: string;
  
  /** Whether dependency is optional */
  optional: boolean;
  
  /** Fallback if dependency unavailable */
  fallback?: string;
}

/**
 * Agent capability declaration
 * Describes a specific capability an agent can perform
 */
export interface AgentCapability {
  /** Unique capability identifier */
  capability_id: string;
  
  /** Human-readable capability name */
  capability_name: string;
  
  /** Detailed capability description */
  description: string;
  
  /** Capability category */
  category: CapabilityCategory;
  
  /** Proficiency level for this capability */
  proficiency_level: ProficiencyLevel;
  
  /** Confidence level (0.0 to 1.0) */
  confidence_level: number;
  
  /** Estimated completion time in milliseconds */
  estimated_completion_time_ms: number;
  
  /** Resource requirements */
  resource_requirements: ResourceRequirement[];
  
  /** Dependencies required for this capability */
  dependencies?: CapabilityDependency[];
  
  /** Supported input formats/types */
  supported_inputs?: string[];
  
  /** Supported output formats/types */
  supported_outputs?: string[];
  
  /** Tags for capability matching */
  tags?: string[];
  
  /** Performance statistics */
  performance?: CapabilityPerformance;
  
  /** Confidence calibration metadata */
  calibration?: ConfidenceCalibration;
  
  /** Capability version */
  version: string;
  
  /** Timestamp when capability was registered */
  registered_at: string;
  
  /** Timestamp of last validation */
  last_validated_at?: string;
  
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Complete agent capability manifest
 * Full declaration of all capabilities an agent possesses
 */
export interface AgentCapabilityManifest {
  /** Agent identification */
  agent_id: string;
  agent_name: string;
  
  /** Agent version */
  agent_version: string;
  
  /** Manifest version */
  manifest_version: string;
  
  /** All capabilities declared by this agent */
  capabilities: AgentCapability[];
  
  /** Overall agent confidence score (aggregate) */
  overall_confidence: number;
  
  /** Agent specializations (primary focus areas) */
  specializations?: CapabilityCategory[];
  
  /** Supported programming languages */
  supported_languages?: string[];
  
  /** Supported frameworks */
  supported_frameworks?: string[];
  
  /** Maximum concurrent tasks */
  max_concurrent_tasks?: number;
  
  /** Availability status */
  availability: 'available' | 'busy' | 'offline' | 'maintenance';
  
  /** Current workload (0.0 to 1.0, 1.0 = at capacity) */
  current_workload?: number;
  
  /** TLP clearance levels */
  tlp_clearance?: Array<'CLEAR' | 'GREEN' | 'AMBER' | 'RED'>;
  
  /** Manifest creation timestamp */
  created_at: string;
  
  /** Last manifest update timestamp */
  updated_at: string;
  
  /** Additional manifest metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Capability matching criteria
 * Used to query and match agents to tasks
 */
export interface CapabilityMatchCriteria {
  /** Required capability categories */
  required_categories?: CapabilityCategory[];
  
  /** Minimum confidence threshold (0.0 to 1.0) */
  min_confidence?: number;
  
  /** Maximum completion time allowed (milliseconds) */
  max_completion_time_ms?: number;
  
  /** Required resource availability */
  required_resources?: ResourceRequirement[];
  
  /** Required proficiency level */
  min_proficiency_level?: ProficiencyLevel;
  
  /** Required tags */
  required_tags?: string[];
  
  /** Required TLP clearance */
  required_tlp_clearance?: 'CLEAR' | 'GREEN' | 'AMBER' | 'RED';
  
  /** Exclude agents currently at capacity */
  exclude_at_capacity?: boolean;
  
  /** Preferred agent characteristics */
  preferences?: {
    prefer_specialized?: boolean;
    prefer_fast?: boolean;
    prefer_high_quality?: boolean;
    prefer_experienced?: boolean;
  };
}

/**
 * Capability match result
 * Result of matching a task to agent capabilities
 */
export interface CapabilityMatchResult {
  /** Agent that matched */
  agent_id: string;
  agent_name: string;
  
  /** Matched capabilities */
  matched_capabilities: AgentCapability[];
  
  /** Overall match score (0.0 to 1.0) */
  match_score: number;
  
  /** Aggregated confidence for matched capabilities */
  aggregate_confidence: number;
  
  /** Estimated completion time based on matched capabilities */
  estimated_completion_time_ms: number;
  
  /** Whether all criteria were met */
  meets_all_criteria: boolean;
  
  /** Reasons for partial/failed match */
  match_failures?: string[];
  
  /** Match rank (1 = best match) */
  rank?: number;
}

/**
 * Capability registration request
 */
export interface RegisterCapabilityRequest {
  /** Agent registering the capability */
  agent_id: string;
  agent_name: string;
  
  /** Capability to register */
  capability: Omit<AgentCapability, 'capability_id' | 'registered_at'>;
}

/**
 * Capability update request
 */
export interface UpdateCapabilityRequest {
  /** Capability to update */
  capability_id: string;
  
  /** Updated confidence level */
  confidence_level?: number;
  
  /** Updated completion time estimate */
  estimated_completion_time_ms?: number;
  
  /** Updated performance statistics */
  performance?: CapabilityPerformance;
  
  /** Updated calibration data */
  calibration?: ConfidenceCalibration;
  
  /** Updated metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Capability query options
 */
export interface CapabilityQuery {
  /** Filter by agent */
  agent_id?: string;
  
  /** Filter by category */
  category?: CapabilityCategory | CapabilityCategory[];
  
  /** Filter by minimum confidence */
  min_confidence?: number;
  
  /** Filter by proficiency level */
  proficiency_level?: ProficiencyLevel | ProficiencyLevel[];
  
  /** Filter by tags */
  tags?: string[];
  
  /** Limit results */
  limit?: number;
  
  /** Offset for pagination */
  offset?: number;
  
  /** Sort by field */
  sort_by?: 'confidence_level' | 'estimated_completion_time_ms' | 'success_rate';
  
  /** Sort direction */
  sort_order?: 'asc' | 'desc';
}
