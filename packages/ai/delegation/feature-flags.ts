/**
 * Feature Flag System for Delegation Framework
 * 
 * Enables gradual rollout of delegation features with safe activation/deactivation.
 * Supports A/B testing, canary releases, and emergency killswitches.
 * 
 * @module delegation/feature-flags
 */

/**
 * Available delegation feature flags
 */
export type DelegationFeatureFlag =
  | 'delegation_enabled'           // Master switch for all delegation
  | 'contract_management'          // Contract creation and lifecycle
  | 'reputation_tracking'          // Agent reputation scoring
  | 'permission_attenuation'       // Permission scoping and limits
  | 'verification_framework'       // Task verification modes
  | 'chain_tracking'               // Delegation chain management
  | 'security_monitoring'          // Threat detection and firebreaks
  | 'mcp_integration'              // MCP server integration
  | 'performance_metrics'          // Performance tracking and benchmarks
  | 'predictive_routing'           // ML-based agent selection
  | 'capability_learning'          // Dynamic capability updates
  | 'multi_tenancy';               // Multi-tenant isolation

/**
 * Feature flag configuration
 */
export interface FeatureFlagConfig {
  /** Feature flag identifier */
  flag: DelegationFeatureFlag;
  
  /** Whether feature is enabled */
  enabled: boolean;
  
  /** Rollout percentage (0-100) for gradual rollout */
  rolloutPercentage?: number;
  
  /** Target environment (all, development, staging, production) */
  environment?: string[];
  
  /** Target tenant IDs for multi-tenant rollout */
  tenants?: string[];
  
  /** User IDs for user-specific enablement */
  users?: string[];
  
  /** A/B test variant assignment */
  abTestVariant?: 'control' | 'treatment';
  
  /** Feature dependencies (features that must be enabled) */
  dependencies?: DelegationFeatureFlag[];
  
  /** Expiration timestamp - feature auto-disables after this */
  expiresAt?: Date;
  
  /** Metadata for tracking and debugging */
  metadata?: {
    reason?: string;
    enabledBy?: string;
    enabledAt?: Date;
    lastModified?: Date;
  };
}

/**
 * Feature flag evaluation result
 */
export interface FeatureEvaluation {
  /** Feature flag that was evaluated */
  flag: DelegationFeatureFlag;
  
  /** Whether feature is enabled for this context */
  enabled: boolean;
  
  /** Reason why feature is enabled/disabled */
  reason: string;
  
  /** Override source if manually overridden */
  overrideSource?: 'user' | 'tenant' | 'environment' | 'percentage';
}

/**
 * Context for feature flag evaluation
 */
export interface FeatureFlagContext {
  /** Current environment */
  environment?: string;
  
  /** Current tenant ID */
  tenantId?: string;
  
  /** Current user ID */
  userId?: string;
  
  /** Request ID for consistent hashing */
  requestId?: string;
  
  /** Additional context properties */
  properties?: Record<string, any>;
}

/**
 * Default feature flag configurations - conservative defaults
 */
export const DEFAULT_FEATURE_FLAGS: Record<DelegationFeatureFlag, boolean> = {
  delegation_enabled: false,        // Disabled by default - must opt-in
  contract_management: true,        // Core feature - enabled when delegation enabled
  reputation_tracking: true,        // Core feature - enabled when delegation enabled
  permission_attenuation: true,     // Security feature - always enabled
  verification_framework: true,     // Quality feature - always enabled
  chain_tracking: true,             // Core feature - enabled when delegation enabled
  security_monitoring: true,        // Security feature - always enabled
  mcp_integration: true,            // Observability - enabled when delegation enabled
  performance_metrics: true,        // Monitoring - enabled when delegation enabled
  predictive_routing: false,        // Advanced feature - opt-in only
  capability_learning: false,       // Advanced feature - opt-in only
  multi_tenancy: false              // Enterprise feature - opt-in only
};

/**
 * Feature flag manager for delegation framework
 */
export class FeatureFlagManager {
  private configs: Map<DelegationFeatureFlag, FeatureFlagConfig> = new Map();
  private overrides: Map<string, Map<DelegationFeatureFlag, boolean>> = new Map();
  
  constructor(
    private defaultFlags: Record<DelegationFeatureFlag, boolean> = DEFAULT_FEATURE_FLAGS
  ) {
    // Initialize with default configurations
    for (const [flag, enabled] of Object.entries(defaultFlags)) {
      this.configs.set(flag as DelegationFeatureFlag, {
        flag: flag as DelegationFeatureFlag,
        enabled
      });
    }
  }
  
  /**
   * Configure a feature flag
   */
  configure(config: FeatureFlagConfig): void {
    // Store configuration without validation
    // Dependencies are validated at evaluation time, not configuration time
    this.configs.set(config.flag, config);
  }
  
  private checkUserOverride(
    flag: DelegationFeatureFlag,
    config: FeatureFlagConfig,
    context: FeatureFlagContext
  ): FeatureEvaluation | null {
    if (!context.userId || !config.users) return null;
    if (config.users.includes(context.userId)) {
      return { flag, enabled: true, reason: 'Enabled for specific user', overrideSource: 'user' };
    }
    return { flag, enabled: false, reason: 'User not in allowed users list' };
  }

  private checkTenantOverride(
    flag: DelegationFeatureFlag,
    config: FeatureFlagConfig,
    context: FeatureFlagContext
  ): FeatureEvaluation | null {
    if (!context.tenantId || !config.tenants) return null;
    if (config.tenants.includes(context.tenantId)) {
      return { flag, enabled: true, reason: 'Enabled for specific tenant', overrideSource: 'tenant' };
    }
    return { flag, enabled: false, reason: 'Tenant not in allowed tenants list' };
  }

  /**
   * Evaluate whether a feature is enabled for given context
   */
  isEnabled(
    flag: DelegationFeatureFlag,
    context: FeatureFlagContext = {}
  ): FeatureEvaluation {
    const config = this.configs.get(flag);
    
    if (!config) {
      return {
        flag,
        enabled: this.defaultFlags[flag] ?? false,
        reason: 'No configuration found, using default'
      };
    }
    
    // Check expiration
    if (config.expiresAt && new Date() > config.expiresAt) {
      return {
        flag,
        enabled: false,
        reason: 'Feature flag has expired'
      };
    }
    
    // Check master delegation switch
    if (flag !== 'delegation_enabled') {
      const masterSwitch = this.isEnabled('delegation_enabled', context);
      if (!masterSwitch.enabled) {
        return {
          flag,
          enabled: false,
          reason: 'Master delegation switch is disabled'
        };
      }
    }
    
    // Check user-specific override
    const userOverride = this.checkUserOverride(flag, config, context);
    if (userOverride !== null) return userOverride;
    
    // Check tenant-specific override
    const tenantOverride = this.checkTenantOverride(flag, config, context);
    if (tenantOverride !== null) return tenantOverride;
    
    // Check environment
    if (config.environment && context.environment) {
      const envEnabled = config.environment.includes(context.environment);
      if (!envEnabled) {
        return {
          flag,
          enabled: false,
          reason: `Not enabled for environment: ${context.environment}`
        };
      }
    }
    
    // Check rollout percentage
    if (config.rolloutPercentage !== undefined && config.rolloutPercentage < 100) {
      const hashKey = context.requestId || context.userId || context.tenantId || 'default';
      const hash = this.hashString(hashKey);
      const bucket = hash % 100;
      
      if (bucket >= config.rolloutPercentage) {
        return {
          flag,
          enabled: false,
          reason: `Outside rollout percentage (${config.rolloutPercentage}%)`,
          overrideSource: 'percentage'
        };
      }
    }
    
    // Check dependencies
    if (config.dependencies) {
      for (const dep of config.dependencies) {
        const depEval = this.isEnabled(dep, context);
        if (!depEval.enabled) {
          return {
            flag,
            enabled: false,
            reason: `Dependency '${dep}' is not enabled: ${depEval.reason}`
          };
        }
      }
    }
    
    return {
      flag,
      enabled: config.enabled,
      reason: config.enabled ? 'Feature is enabled' : 'Feature is disabled'
    };
  }
  
  /**
   * Enable a feature flag
   */
  enable(
    flag: DelegationFeatureFlag,
    options: {
      rolloutPercentage?: number;
      environment?: string[];
      tenants?: string[];
      users?: string[];
      reason?: string;
      enabledBy?: string;
    } = {}
  ): void {
    const config = this.configs.get(flag) || {
      flag,
      enabled: false
    };
    
    this.configure({
      ...config,
      enabled: true,
      rolloutPercentage: options.rolloutPercentage,
      environment: options.environment,
      tenants: options.tenants,
      users: options.users,
      metadata: {
        ...config.metadata,
        reason: options.reason,
        enabledBy: options.enabledBy,
        enabledAt: new Date(),
        lastModified: new Date()
      }
    });
  }
  
  /**
   * Disable a feature flag
   */
  disable(
    flag: DelegationFeatureFlag,
    reason?: string
  ): void {
    const config = this.configs.get(flag) || {
      flag,
      enabled: true
    };
    
    this.configure({
      ...config,
      enabled: false,
      metadata: {
        ...config.metadata,
        reason,
        lastModified: new Date()
      }
    });
  }
  
  /**
   * Get all feature flag states for context
   */
  getAllFlags(context: FeatureFlagContext = {}): Map<DelegationFeatureFlag, FeatureEvaluation> {
    const results = new Map<DelegationFeatureFlag, FeatureEvaluation>();
    
    for (const flag of Object.keys(this.defaultFlags) as DelegationFeatureFlag[]) {
      results.set(flag, this.isEnabled(flag, context));
    }
    
    return results;
  }
  
  /**
   * Emergency killswitch - disable all delegation features
   */
  emergencyDisable(reason: string): void {
    this.disable('delegation_enabled', `EMERGENCY KILLSWITCH: ${reason}`);
  }
  
  /**
   * Export feature flag configuration for persistence
   */
  export(): Record<DelegationFeatureFlag, FeatureFlagConfig> {
    const exported: Record<string, FeatureFlagConfig> = {};
    
    for (const [flag, config] of this.configs.entries()) {
      exported[flag] = config;
    }
    
    return exported as Record<DelegationFeatureFlag, FeatureFlagConfig>;
  }
  
  /**
   * Import feature flag configuration
   */
  import(configs: Record<DelegationFeatureFlag, FeatureFlagConfig>): void {
    for (const [flag, config] of Object.entries(configs)) {
      this.configure(config);
    }
  }
  
  /**
   * Simple hash function for consistent bucket assignment
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

/**
 * Singleton feature flag manager instance
 */
let featureFlagManager: FeatureFlagManager | null = null;

/**
 * Get global feature flag manager instance
 */
export function getFeatureFlagManager(): FeatureFlagManager {
  if (!featureFlagManager) {
    featureFlagManager = new FeatureFlagManager();
  }
  return featureFlagManager;
}

/**
 * Initialize feature flag manager with custom config
 */
export function initializeFeatureFlags(
  config?: Partial<Record<DelegationFeatureFlag, boolean>>
): FeatureFlagManager {
  const defaults = { ...DEFAULT_FEATURE_FLAGS, ...config };
  featureFlagManager = new FeatureFlagManager(defaults as Record<DelegationFeatureFlag, boolean>);
  return featureFlagManager;
}

/**
 * Quick check if delegation is enabled
 */
export function isDelegationEnabled(context: FeatureFlagContext = {}): boolean {
  return getFeatureFlagManager().isEnabled('delegation_enabled', context).enabled;
}

/**
 * Quick check if specific feature is enabled
 */
export function isFeatureEnabled(
  flag: DelegationFeatureFlag,
  context: FeatureFlagContext = {}
): boolean {
  return getFeatureFlagManager().isEnabled(flag, context).enabled;
}
