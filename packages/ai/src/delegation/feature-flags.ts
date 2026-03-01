/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Delegation Framework Feature Flags
 * 
 * Supports gradual rollout, A/B testing, and safe activation/de activation of delegation features.
 * 
 * @module delegation/feature-flags
 * @version 1.0.0
 * @date 2026-02-23
 * @license MIT
 */

/**
 * Feature flag configuration for delegation system
 */
export interface DelegationFeatureFlags {
  /** Enable/disable delegation contract creation */
  delegation_contracts_enabled: boolean;
  
  /** Enable/disable reputation tracking and scoring */
  reputation_tracking_enabled: boolean;
  
  /** Enable/disable permission attenuation enforcement */
  permission_attenuation_enabled: boolean;
  
  /** Enable/disable TLP clearance enforcement */
  tlp_enforcement_enabled: boolean;
  
  /** Enable/disable liability firebreak enforcement */
  firebreak_enforcement_enabled: boolean;
  
  /** Enable/disable security threat model validation */
  threat_model_enabled: boolean;
  
  /** Percentage of delegations to route through new system (0-100) */
  delegation_rollout_percentage: number;
  
  /** A/B testing variant (control, treatment, or null for no testing) */
  ab_testing_variant: 'control' | 'treatment' | null;
  
  /** Enable/disable delegation telemetry collection */
  telemetry_enabled: boolean;
  
  /** Enable/disable contract verification */
  verification_enabled: boolean;
  
  /** Enable/disable automatic capability matching */
  capability_matching_enabled: boolean;
  
  /** Enable/disable chain tracking and loop detection */
  chain_tracking_enabled: boolean;
  
  /** Fallback to manual assignment when delegation fails */
  fallback_to_manual_enabled: boolean;
}

/**
 * Feature flag override for specific agents or contexts
 */
export interface FeatureFlagOverride {
  /** Agent ID to override flags for */
  agent_id?: string;
  
  /** Context pattern to match (e.g., 'openspec:*', 'mcp:*') */
  context_pattern?: string;
  
  /** Override flags (partial update) */
  overrides: Partial<DelegationFeatureFlags>;
  
  /** Priority (higher values take precedence) */
  priority: number;
  
  /** Expiration time for override */
  expires_at?: Date;
  
  /** Reason for override (audit trail) */
  reason: string;
}

/**
 * Feature flag audit event
 */
export interface FeatureFlagAuditEvent {
  /** Event ID */
  event_id: string;
  
  /** Timestamp */
  timestamp: Date;
  
  /** Event type */
  type: 'flag_enabled' | 'flag_disabled' | 'override_applied' | 'override_removed' | 'ab_variant_assigned';
  
  /** Flag name that changed */
  flag_name?: keyof DelegationFeatureFlags;
  
  /** Previous value */
  previous_value?: any;
  
  /** New value */
  new_value?: any;
  
  /** Agent ID (if applicable) */
  agent_id?: string;
  
  /** Context (if applicable) */
  context?: string;
  
  /** Reason for change */
  reason?: string;
  
  /** Changed by (system, admin, automation) */
  changed_by: string;
}

/**
 * A/B testing assignment
 */
export interface ABTestingAssignment {
  /** Session or agent ID */
  id: string;
  
  /** Assigned variant */
  variant: 'control' | 'treatment';
  
  /** Assignment timestamp */
  assigned_at: Date;
  
  /** Sticky assignment (persists across sessions) */
  is_sticky: boolean;
}

/**
 * Feature flags manager for delegation framework
 */
export class DelegationFeatureFlagsManager {
  private flags: DelegationFeatureFlags;
  private overrides: Map<string, FeatureFlagOverride>;
  private auditLog: FeatureFlagAuditEvent[];
  private abTestingAssignments: Map<string, ABTestingAssignment>;
  
  constructor(initialFlags?: Partial<DelegationFeatureFlags>) {
    // Default configuration: progressive rollout
    this.flags = {
      delegation_contracts_enabled: false,
      reputation_tracking_enabled: false,
      permission_attenuation_enabled: false,
      tlp_enforcement_enabled: false,
      firebreak_enforcement_enabled: false,
      threat_model_enabled: false,
      delegation_rollout_percentage: 0,
      ab_testing_variant: null,
      telemetry_enabled: true,  // Always collect data
      verification_enabled: false,
      capability_matching_enabled: false,
      chain_tracking_enabled: false,
      fallback_to_manual_enabled: true,  // Safety: always fallback
      ...initialFlags,
    };
    
    this.overrides = new Map();
    this.auditLog = [];
    this.abTestingAssignments = new Map();
  }
  
  /**
   * Get current feature flags for an agent/context
   */
  getFlags(agent_id?: string, context?: string): DelegationFeatureFlags {
    // Start with base flags
    let effectiveFlags = { ...this.flags };
    
    // Apply overrides (sorted by priority)
    const applicableOverrides = Array.from(this.overrides.values())
      .filter(override => {
        // Check agent ID match
        if (override.agent_id && override.agent_id !== agent_id) {
          return false;
        }
        
        // Check context pattern match
        if (override.context_pattern && context) {
          const pattern = new RegExp(override.context_pattern.replace(/\*/g, '.*'));
          if (!pattern.test(context)) {
            return false;
          }
        }
        
        // Check expiration
        if (override.expires_at && override.expires_at < new Date()) {
          return false;
        }
        
        return true;
      })
      .sort((a, b) => a.priority - b.priority);  // Lower priority first
    
    // Apply overrides in priority order
    for (const override of applicableOverrides) {
      effectiveFlags = {
        ...effectiveFlags,
        ...override.overrides,
      };
    }
    
    // Apply A/B testing variant if assigned
    if (agent_id && this.abTestingAssignments.has(agent_id)) {
      const assignment = this.abTestingAssignments.get(agent_id)!;
      effectiveFlags.ab_testing_variant = assignment.variant;
    }
    
    return effectiveFlags;
  }
  
  /**
   * Check if a specific feature is enabled
   */
  isFeatureEnabled(
    featureName: keyof DelegationFeatureFlags,
    agent_id?: string,
    context?: string
  ): boolean {
    const flags = this.getFlags(agent_id, context);
    const value = flags[featureName];
    
    // Handle rollout percentage
    if (featureName === 'delegation_contracts_enabled' && typeof value === 'boolean') {
      if (!value) return false;
      
      // Check if agent falls within rollout percentage
      if (agent_id && flags.delegation_rollout_percentage < 100) {
        const hash = this.hashString(agent_id);
        const threshold = (flags.delegation_rollout_percentage / 100) * 0xFFFFFFFF;
        return hash <= threshold;
      }
    }
    
    return Boolean(value);
  }
  
  /**
   * Update a feature flag
   */
  updateFlag(
    flagName: keyof DelegationFeatureFlags,
    newValue: any,
    changedBy: string,
    reason?: string
  ): void {
    const previousValue = this.flags[flagName];
    
    // Update flag
    (this.flags as any)[flagName] = newValue;
    
    // Audit log
    this.logAuditEvent({
      event_id: `event_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      timestamp: new Date(),
      type: newValue ? 'flag_enabled' : 'flag_disabled',
      flag_name: flagName,
      previous_value: previousValue,
      new_value: newValue,
      reason,
      changed_by: changedBy,
    });
  }
  
  /**
   * Add or update override
   */
  addOverride(
    overrideId: string,
    override: FeatureFlagOverride
  ): void {
    this.overrides.set(overrideId, override);
    
    this.logAuditEvent({
      event_id: `event_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      timestamp: new Date(),
      type: 'override_applied',
      agent_id: override.agent_id,
      context: override.context_pattern,
      reason: override.reason,
      changed_by: 'system',
    });
  }
  
  /**
   * Remove override
   */
  removeOverride(overrideId: string): boolean {
    const existed = this.overrides.delete(overrideId);
    
    if (existed) {
      this.logAuditEvent({
        event_id: `event_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        timestamp: new Date(),
        type: 'override_removed',
        reason: `Override ${overrideId} removed`,
        changed_by: 'system',
      });
    }
    
    return existed;
  }
  
  /**
   * Assign A/B testing variant
   */
  assignABVariant(
    id: string,
    variant?: 'control' | 'treatment',
    sticky: boolean = true
  ): ABTestingAssignment {
    // Check if already assigned
    const existing = this.abTestingAssignments.get(id);
    if (existing && existing.is_sticky) {
      return existing;
    }
    
    // Determine variant (50/50 split if not specified)
    const assignedVariant = variant || (this.hashString(id) % 2 === 0 ? 'control' : 'treatment');
    
    const assignment: ABTestingAssignment = {
      id,
      variant: assignedVariant,
      assigned_at: new Date(),
      is_sticky: sticky,
    };
    
    this.abTestingAssignments.set(id, assignment);
    
    this.logAuditEvent({
      event_id: `event_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      timestamp: new Date(),
      type: 'ab_variant_assigned',
      agent_id: id,
      new_value: assignedVariant,
      reason: `A/B variant assigned (sticky: ${sticky})`,
      changed_by: 'system',
    });
    
    return assignment;
  }
  
  /**
   * Get A/B testing assignment
   */
  getABVariant(id: string): 'control' | 'treatment' | null {
    const assignment = this.abTestingAssignments.get(id);
    return assignment ? assignment.variant : null;
  }
  
  /**
   * Get all feature flags (base configuration)
   */
  getAllFlags(): DelegationFeatureFlags {
    return { ...this.flags };
  }
  
  /**
   * Get all overrides
   */
  getOverrides(): FeatureFlagOverride[] {
    return Array.from(this.overrides.values());
  }
  
  /**
   * Get audit log
   */
  getAuditLog(limit?: number): FeatureFlagAuditEvent[] {
    const log = [...this.auditLog].reverse();  // Most recent first
    return limit ? log.slice(0, limit) : log;
  }
  
  /**
   * Get statistics
   */
  getStatistics(): {
    total_flags: number;
    enabled_flags: number;
    disabled_flags: number;
    active_overrides: number;
    audit_events: number;
    ab_assignments: number;
  } {
    const flagsArray = Object.values(this.flags);
    const booleanFlags = flagsArray.filter(v => typeof v === 'boolean');
    
    return {
      total_flags: Object.keys(this.flags).length,
      enabled_flags: booleanFlags.filter(Boolean).length,
      disabled_flags: booleanFlags.filter(v => !v).length,
      active_overrides: this.overrides.size,
      audit_events: this.auditLog.length,
      ab_assignments: this.abTestingAssignments.size,
    };
  }
  
  /**
   * Cleanup expired overrides
   */
  cleanupExpiredOverrides(): number {
    let cleaned = 0;
    const now = new Date();
    
    for (const [id, override] of this.overrides) {
      if (override.expires_at && override.expires_at < now) {
        this.overrides.delete(id);
        cleaned++;
      }
    }
    
    return cleaned;
  }
  
  /**
   * Export configuration for persistence
   */
  exportConfig(): {
    flags: DelegationFeatureFlags;
    overrides: Array<[string, FeatureFlagOverride]>;
    ab_assignments: Array<[string, ABTestingAssignment]>;
  } {
    return {
      flags: { ...this.flags },
      overrides: Array.from(this.overrides.entries()),
      ab_assignments: Array.from(this.abTestingAssignments.entries()),
    };
  }
  
  /**
   * Import configuration from persistence
   */
  importConfig(config: {
    flags?: Partial<DelegationFeatureFlags>;
    overrides?: Array<[string, FeatureFlagOverride]>;
    ab_assignments?: Array<[string, ABTestingAssignment]>;
  }): void {
    if (config.flags) {
      this.flags = {
        ...this.flags,
        ...config.flags,
      };
    }
    
    if (config.overrides) {
      this.overrides = new Map(config.overrides);
    }
    
    if (config.ab_assignments) {
      this.abTestingAssignments = new Map(config.ab_assignments);
    }
  }
  
  /**
   * Log audit event
   */
  private logAuditEvent(event: FeatureFlagAuditEvent): void {
    this.auditLog.push(event);
    
    // Trim audit log if too large (keep last 1000 events)
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-1000);
    }
  }
  
  /**
   * Hash string to uint32 (for consistent bucketing)
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;  // Convert to 32bit integer
    }
    return Math.abs(hash) >>> 0;  // Convert to unsigned 32-bit integer
  }
}

/**
 * Global feature flags instance (can be overridden for testing)
 */
let globalFeatureFlagsManager: DelegationFeatureFlagsManager | null = null;

/**
 * Get global feature flags manager
 */
export function getFeatureFlagsManager(): DelegationFeatureFlagsManager {
  if (!globalFeatureFlagsManager) {
    globalFeatureFlagsManager = new DelegationFeatureFlagsManager();
  }
  return globalFeatureFlagsManager;
}

/**
 * Set global feature flags manager (for testing)
 */
export function setFeatureFlagsManager(manager: DelegationFeatureFlagsManager): void {
  globalFeatureFlagsManager = manager;
}

/**
 * Reset global feature flags manager
 */
export function resetFeatureFlagsManager(): void {
  globalFeatureFlagsManager = null;
}

/**
 * Preset configurations for common rollout stages
 */
export const FEATURE_FLAG_PRESETS = {
  /** All features disabled (safe default) */
  DISABLED: {
    delegation_contracts_enabled: false,
    reputation_tracking_enabled: false,
    permission_attenuation_enabled: false,
    tlp_enforcement_enabled: false,
    firebreak_enforcement_enabled: false,
    threat_model_enabled: false,
    delegation_rollout_percentage: 0,
    ab_testing_variant: null,
    telemetry_enabled: true,
    verification_enabled: false,
    capability_matching_enabled: false,
    chain_tracking_enabled: false,
    fallback_to_manual_enabled: true,
  } as DelegationFeatureFlags,
  
  /** Pilot release (10% rollout, all safety features enabled) */
  PILOT: {
    delegation_contracts_enabled: true,
    reputation_tracking_enabled: true,
    permission_attenuation_enabled: true,
    tlp_enforcement_enabled: true,
    firebreak_enforcement_enabled: true,
    threat_model_enabled: true,
    delegation_rollout_percentage: 10,
    ab_testing_variant: null,
    telemetry_enabled: true,
    verification_enabled: true,
    capability_matching_enabled: true,
    chain_tracking_enabled: true,
    fallback_to_manual_enabled: true,
  } as DelegationFeatureFlags,
  
  /** Broad rollout (50% rollout) */
  BROAD_ROLLOUT: {
    delegation_contracts_enabled: true,
    reputation_tracking_enabled: true,
    permission_attenuation_enabled: true,
    tlp_enforcement_enabled: true,
    firebreak_enforcement_enabled: true,
    threat_model_enabled: true,
    delegation_rollout_percentage: 50,
    ab_testing_variant: null,
    telemetry_enabled: true,
    verification_enabled: true,
    capability_matching_enabled: true,
    chain_tracking_enabled: true,
    fallback_to_manual_enabled: true,
  } as DelegationFeatureFlags,
  
  /** Full production release (100% rollout) */
  PRODUCTION: {
    delegation_contracts_enabled: true,
    reputation_tracking_enabled: true,
    permission_attenuation_enabled: true,
    tlp_enforcement_enabled: true,
    firebreak_enforcement_enabled: true,
    threat_model_enabled: true,
    delegation_rollout_percentage: 100,
    ab_testing_variant: null,
    telemetry_enabled: true,
    verification_enabled: true,
    capability_matching_enabled: true,
    chain_tracking_enabled: true,
    fallback_to_manual_enabled: true,
  } as DelegationFeatureFlags,
  
  /** A/B testing configuration (50% in treatment) */
  AB_TESTING: {
    delegation_contracts_enabled: true,
    reputation_tracking_enabled: true,
    permission_attenuation_enabled: true,
    tlp_enforcement_enabled: true,
    firebreak_enforcement_enabled: true,
    threat_model_enabled: true,
    delegation_rollout_percentage: 100,
    ab_testing_variant: 'treatment',  // Will be overridden per user
    telemetry_enabled: true,
    verification_enabled: true,
    capability_matching_enabled: true,
    chain_tracking_enabled: true,
    fallback_to_manual_enabled: true,
  } as DelegationFeatureFlags,
};
