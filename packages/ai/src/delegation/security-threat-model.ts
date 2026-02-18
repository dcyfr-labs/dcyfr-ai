/**
 * Security Threat Model Validation for DCYFR Delegation Framework
 * TLP:AMBER - Internal Use Only
 * 
 * Implements attack scenario detection, delegation abuse monitoring, and
 * anomaly detection to protect against security threats in delegation chains.
 * 
 * Threat Vectors Addressed:
 * - Permission escalation through delegation chains
 * - Reputation gaming and manipulation
 * - Delegation abuse patterns and resource exhaustion
 * - Anomalous delegation behavior detection
 * 
 * @module delegation/security-threat-model
 * @version 1.1.0
 * @date 2026-02-14
 */

import type { DelegationContract, TLPLevel } from '../types/delegation-contracts.js';
import type { AgentClearance } from './tlp-enforcement.js';

/**
 * Security threat detection result
 */
export interface ThreatDetectionResult {
  /** Whether a threat was detected */
  threat_detected: boolean;
  
  /** Type of threat identified */
  threat_type: 'permission_escalation' | 'reputation_gaming' | 'abuse_pattern' | 'anomaly' | 'context_insufficiency' | 'prompt_injection' | 'resource_exhaustion' | 'none';
  
  /** Severity level of the threat */
  severity: 'low' | 'medium' | 'high' | 'critical';
  
  /** Threat description */
  description: string;
  
  /** Recommended action */
  action: 'allow' | 'warn' | 'block' | 'escalate' | 'terminate_chain';
  
  /** Supporting evidence */
  evidence: {
    /** Metrics that triggered the detection */
    metrics?: Record<string, number>;
    
    /** Related contracts or agents */
    related_entities?: string[];
    
    /** Timeline of suspicious activity */
    activity_timeline?: Array<{
      timestamp: string;
      event: string;
      details: Record<string, unknown>;
    }>;
  };
  
  /** Confidence score (0-1) */
  confidence: number;
}

/**
 * Agent activity tracking for anomaly detection
 */
interface AgentActivity {
  agent_id: string;
  contracts_created: number;
  contracts_accepted: number;
  contracts_completed: number;
  contracts_failed: number;
  average_execution_time: number;
  permission_scope_requests: string[];
  tlp_level_requests: TLPLevel[];
  recent_activity: Array<{
    timestamp: string;
    action: string;
    contract_id: string;
    details: Record<string, unknown>;
  }>;
  reputation_score: number;
  first_seen: string;
  last_seen: string;
}

/**
 * Delegation chain analysis for permission escalation detection
 */
interface ChainAnalysis {
  chain_id: string;
  depth: number;
  agents: string[];
  permission_escalation: boolean;
  scope_expansion: boolean;
  tlp_violations: boolean;
  suspicious_patterns: string[];
  risk_score: number;
}

/**
 * Security threat model validation engine
 */
export class SecurityThreatValidator {
  private agentActivities: Map<string, AgentActivity>;
  private delegationChains: Map<string, ChainAnalysis>;
  private threatHistory: ThreatDetectionResult[];
  private config: {
    max_chain_depth: number;
    max_contracts_per_hour: number;
    reputation_gaming_threshold: number;
    anomaly_detection_window_hours: number;
    permission_escalation_detection: boolean;
  };

  constructor(config: Partial<SecurityThreatValidator['config']> = {}) {
    this.agentActivities = new Map();
    this.delegationChains = new Map();
    this.threatHistory = [];
    
    this.config = {
      max_chain_depth: config.max_chain_depth || 5,
      max_contracts_per_hour: config.max_contracts_per_hour || 50,
      reputation_gaming_threshold: config.reputation_gaming_threshold || 0.1,
      anomaly_detection_window_hours: config.anomaly_detection_window_hours || 24,
      permission_escalation_detection: config.permission_escalation_detection ?? true,
    };
  }

  /**
   * Validate delegation contract for security threats
   */
  async validateDelegationSecurity(contract: DelegationContract): Promise<ThreatDetectionResult> {
    // Update agent activity tracking
    this.trackAgentActivity(contract);
    
    // Run all threat detection checks
    const threats = await Promise.all([
      this.detectPermissionEscalation(contract),
      this.detectReputationGaming(contract),
      this.detectAbusePatterns(contract),
      this.detectAnomalies(contract),
      this.detectContextInsufficiency(contract),
      this.detectPromptInjection(contract),
      this.detectResourceExhaustion(contract),
    ]);
    
    // Find the most appropriate threat to report based on severity and threat type priority
    const severeThreat = this.selectPrimaryThreat(threats);
    
    // Log threat detection result
    this.threatHistory.push(severeThreat);
    
    // Emit security event for monitoring
    if (severeThreat.threat_detected) {
      console.warn(`🚨 Security Threat Detected: ${severeThreat.threat_type} (${severeThreat.severity}) - ${severeThreat.description}`);
    }
    
    return severeThreat;
  }

  /**
   * Select the primary threat to report based on severity and threat type priority
   */
  private selectPrimaryThreat(threats: ThreatDetectionResult[]): ThreatDetectionResult {
    const detectedThreats = threats.filter(t => t.threat_detected);
    
    if (detectedThreats.length === 0) {
      return { threat_detected: false, threat_type: 'none', severity: 'low', description: 'No threats detected', action: 'allow', evidence: {}, confidence: 0 };
    }
    
    // Threat type priority (higher number = higher priority to report)
    const threatPriority = {
      'prompt_injection': 6,     // Highest - direct security attack
      'permission_escalation': 5, // Highest priority - critical security issue
      'resource_exhaustion': 4,   // High - DoS attacks
      'context_insufficiency': 3, // Medium - prevents dead-end implementations
      'abuse_pattern': 3,         // High priority - system abuse
      'anomaly': 2,              // Medium priority - unusual behavior  
      'reputation_gaming': 1,     // Lower priority - unless severe
      'none': 0
    };
    
    // Severity weight
    const severityWeight = { low: 0, medium: 1, high: 2, critical: 3 };
    
    // Calculate combined score: (priority * 10) + severity weight
    // This ensures threat type priority is dominant, but severity still matters
    const threatScores = detectedThreats.map(threat => ({
      threat,
      score: (threatPriority[threat.threat_type] * 10) + severityWeight[threat.severity]
    }));
    
    // Sort by score (descending) and return the highest priority threat
    threatScores.sort((a, b) => b.score - a.score);
    
    return threatScores[0].threat;
  }

  /**
   * Detect permission escalation attempts through delegation chains
   */
  /** Check privilege scopes and return risk delta + patterns */
  private checkPrivilegeScopes(contract: DelegationContract): { risk: number; patterns: string[] } {
    const patterns: string[] = [];
    let risk = 0;
    if (!contract.permission_token?.scopes) return { risk, patterns };
    const highPriv = ['admin', 'root', 'execute', 'delete', 'modify_system'];
    const escalated = contract.permission_token.scopes.filter(s =>
      highPriv.some(p => s.toLowerCase().includes(p.toLowerCase()))
    );
    if (escalated.length > 0) {
      patterns.push(`High-privilege scopes requested: ${escalated.join(', ')}`);
      risk += Math.min(0.3 * escalated.length, 0.7);
    }
    if (contract.permission_token.actions && contract.permission_token.actions.length > 5) {
      patterns.push(`Excessive permission actions requested: ${contract.permission_token.actions.length} actions`);
      risk += 0.6;
    }
    return { risk, patterns };
  }

  private async detectPermissionEscalation(contract: DelegationContract): Promise<ThreatDetectionResult> {
    if (!this.config.permission_escalation_detection) {
      return { threat_detected: false, threat_type: 'none', severity: 'low', description: 'Permission escalation detection disabled', action: 'allow', evidence: {}, confidence: 0 };
    }

    const suspicious_patterns: string[] = [];
    let risk_score = 0;

    const scopeCheck = this.checkPrivilegeScopes(contract);
    risk_score += scopeCheck.risk;
    suspicious_patterns.push(...scopeCheck.patterns);

    // Check delegation chain depth for escalation patterns
    if (contract.metadata?.delegation_depth !== undefined && contract.metadata.delegation_depth > this.config.max_chain_depth) {
      suspicious_patterns.push(`Delegation chain exceeds safe depth: ${contract.metadata.delegation_depth} > ${this.config.max_chain_depth}`);
      risk_score += 0.6;
    }

    // Check TLP escalation without proper clearance
    const tlp_risk = this.checkTLPEscalation(contract);
    risk_score += tlp_risk.risk;
    if (tlp_risk.patterns) suspicious_patterns.push(...tlp_risk.patterns);

    if (risk_score > 0.5) {
      return {
        threat_detected: true,
        threat_type: 'permission_escalation',
        severity: risk_score > 0.8 ? 'critical' : risk_score > 0.6 ? 'high' : 'medium',
        description: `Potential permission escalation detected with risk score ${risk_score.toFixed(2)}`,
        action: risk_score > 0.8 ? 'block' : risk_score > 0.6 ? 'escalate' : 'warn',
        evidence: {
          metrics: { risk_score, pattern_count: suspicious_patterns.length },
          related_entities: [contract.delegator_agent_id, contract.delegatee_agent_id],
          activity_timeline: [{
            timestamp: new Date().toISOString(),
            event: 'permission_escalation_analysis',
            details: { suspicious_patterns, contract_id: contract.contract_id }
          }]
        },
        confidence: Math.min(risk_score, 0.95)
      };
    }

    return { threat_detected: false, threat_type: 'none', severity: 'low', description: 'No permission escalation detected', action: 'allow', evidence: {}, confidence: 0.1 };
  }

  /** Check for circular delegation and rapid success patterns */
  private checkReputationPatterns(contract: DelegationContract): { risk: number; patterns: string[] } {
    const patterns: string[] = [];
    let risk = 0;
    const delegator_activity = this.agentActivities.get(contract.delegator_agent_id);
    const delegatee_activity = this.agentActivities.get(contract.delegatee_agent_id);

    if (delegator_activity && delegatee_activity) {
      const mutual = this.checkMutualDelegations(contract.delegator_agent_id, contract.delegatee_agent_id);
      if (mutual > 3) { patterns.push('Circular delegation pattern detected'); risk += 0.3; }
    }

    if (delegatee_activity) {
      const success_rate = delegatee_activity.contracts_completed / (delegatee_activity.contracts_accepted || 1);
      if (success_rate > 0.95 && delegatee_activity.contracts_completed > 10) {
        patterns.push('Unusually high success rate suggesting gaming'); risk += 0.2;
      }
      if (delegatee_activity.contracts_accepted < 3) {
        const agent_age = Date.now() - new Date(delegatee_activity.first_seen).getTime();
        if (agent_age < 12 * 60 * 60 * 1000) { patterns.push('Delegation to very new agent'); risk += 0.05; }
      }
    }
    return { risk, patterns };
  }

  /**
   * Detect reputation gaming attempts
   */
  private async detectReputationGaming(contract: DelegationContract): Promise<ThreatDetectionResult> {
    const { risk: risk_score, patterns: suspicious_patterns } = this.checkReputationPatterns(contract);

    if (risk_score > 0.2) {
      return {
        threat_detected: true,
        threat_type: 'reputation_gaming',
        severity: risk_score > 0.4 ? 'high' : 'medium',
        description: `Potential reputation gaming detected with risk score ${risk_score.toFixed(2)}`,
        action: risk_score > 0.4 ? 'escalate' : 'warn',
        evidence: {
          metrics: { risk_score, mutual_delegations: this.checkMutualDelegations(contract.delegator_agent_id, contract.delegatee_agent_id) },
          related_entities: [contract.delegator_agent_id, contract.delegatee_agent_id],
        },
        confidence: risk_score
      };
    }

    return { threat_detected: false, threat_type: 'none', severity: 'low', description: 'No reputation gaming detected', action: 'allow', evidence: {}, confidence: 0.1 };
  }

  /** Check resource requirements for abuse patterns */
  private checkResourceAbuse(contract: DelegationContract): { risk: number; patterns: string[] } {
    const patterns: string[] = [];
    let risk = 0;
    if (!contract.resource_requirements) return { risk, patterns };
    const { memory_mb, cpu_cores, disk_space_mb } = contract.resource_requirements;
    if (memory_mb && memory_mb > 8192) { patterns.push('Excessive memory requirement'); risk += 0.2; }
    if (cpu_cores && cpu_cores > 4) { patterns.push('Excessive CPU requirement'); risk += 0.2; }
    if (disk_space_mb && disk_space_mb > 102400) { patterns.push('Excessive disk space requirement'); risk += 0.2; }
    return { risk, patterns };
  }

  /**
   * Detect delegation abuse patterns
   */
  private async detectAbusePatterns(contract: DelegationContract): Promise<ThreatDetectionResult> {
    const delegator_activity = this.agentActivities.get(contract.delegator_agent_id);
    
    if (!delegator_activity) {
      return { threat_detected: false, threat_type: 'none', severity: 'low', description: 'No activity history available', action: 'allow', evidence: {}, confidence: 0 };
    }

    const suspicious_patterns: string[] = [];
    let risk_score = 0;

    const recent_hour = Date.now() - 60 * 60 * 1000;
    const recent_contracts = delegator_activity.recent_activity.filter(
      activity => new Date(activity.timestamp).getTime() > recent_hour
    ).length;

    if (recent_contracts > this.config.max_contracts_per_hour) {
      suspicious_patterns.push('Excessive delegation frequency detected');
      risk_score += 0.4;
    }

    const resourceCheck = this.checkResourceAbuse(contract);
    risk_score += resourceCheck.risk;
    suspicious_patterns.push(...resourceCheck.patterns);

    if (risk_score > 0.3) {
      return {
        threat_detected: true,
        threat_type: 'abuse_pattern',
        severity: risk_score > 0.6 ? 'high' : 'medium',
        description: `Delegation abuse pattern detected with risk score ${risk_score.toFixed(2)}`,
        action: risk_score > 0.6 ? 'block' : 'warn',
        evidence: {
          metrics: { risk_score, recent_contracts },
          related_entities: [contract.delegator_agent_id],
        },
        confidence: risk_score
      };
    }

    return { threat_detected: false, threat_type: 'none', severity: 'low', description: 'No abuse patterns detected', action: 'allow', evidence: {}, confidence: 0.1 };
  }

  /** Check if execution time is anomalous compared to historical average */
  private checkExecutionTimeAnomaly(contract: DelegationContract, activity: { contracts_created: number; average_execution_time: number }): { isAnomaly: boolean } {
    if (!contract.metadata?.estimated_duration_ms || activity.average_execution_time <= 0) return { isAnomaly: false };
    const estimated = contract.metadata.estimated_duration_ms as number;
    const total = activity.contracts_created;
    const historicalAvg = total > 1
      ? ((activity.average_execution_time * total) - estimated) / (total - 1)
      : activity.average_execution_time;
    return { isAnomaly: estimated > historicalAvg * 3 };
  }

  /** Check for unusual time-of-day patterns */
  private checkTimeOfDay(activity: { recent_activity: Array<{ timestamp: string }> }): boolean {
    const current_hour = new Date().getHours();
    const usual_hours = activity.recent_activity
      .map(a => new Date(a.timestamp).getHours())
      .reduce((acc, hour) => { acc[hour] = (acc[hour] || 0) + 1; return acc; }, {} as Record<number, number>);
    return usual_hours[current_hour] === undefined && Object.keys(usual_hours).length > 5;
  }

  /**
   * Detect anomalous delegation behavior
   */
  private async detectAnomalies(contract: DelegationContract): Promise<ThreatDetectionResult> {
    const delegator_activity = this.agentActivities.get(contract.delegator_agent_id);
    
    if (!delegator_activity || delegator_activity.contracts_created < 5) {
      return { threat_detected: false, threat_type: 'none', severity: 'low', description: 'Insufficient data for anomaly detection', action: 'allow', evidence: {}, confidence: 0 };
    }

    const suspicious_patterns: string[] = [];
    let anomaly_score = 0;

    const historical_tlp = delegator_activity.tlp_level_requests.slice(0, -1).slice(-20);
    const usual_tlp = new Set(historical_tlp);
    const requested_tlp = contract.tlp_classification || 'TLP:CLEAR';
    if (requested_tlp !== 'TLP:CLEAR' && !usual_tlp.has(requested_tlp)) {
      suspicious_patterns.push('Unusual TLP level requested');
      anomaly_score += 0.4;
    }

    if (this.checkExecutionTimeAnomaly(contract, delegator_activity).isAnomaly) {
      suspicious_patterns.push('Unusually long execution time estimated');
      anomaly_score += 0.4;
    }

    if (this.checkTimeOfDay(delegator_activity)) {
      suspicious_patterns.push('Unusual time-of-day activity');
      anomaly_score += 0.2;
    }

    if (anomaly_score > 0.3) {
      return {
        threat_detected: true,
        threat_type: 'anomaly',
        severity: anomaly_score > 0.6 ? 'high' : anomaly_score > 0.4 ? 'medium' : 'low',
        description: `Anomalous delegation behavior detected with score ${anomaly_score.toFixed(2)}`,
        action: anomaly_score > 0.6 ? 'escalate' : anomaly_score > 0.4 ? 'warn' : 'allow',
        evidence: {
          metrics: { anomaly_score, pattern_count: suspicious_patterns.length },
          related_entities: [contract.delegator_agent_id],
        },
        confidence: Math.min(anomaly_score, 0.9)
      };
    }

    return { threat_detected: false, threat_type: 'none', severity: 'low', description: 'No anomalies detected', action: 'allow', evidence: {}, confidence: 0.1 };
  }

  /**
   * Track agent activity for pattern analysis
   */
  private trackAgentActivity(contract: DelegationContract): void {
    const timestamp = new Date().toISOString();
    
    // Track delegator activity
    const delegator_activity = this.agentActivities.get(contract.delegator_agent_id) || {
      agent_id: contract.delegator_agent_id,
      contracts_created: 0,
      contracts_accepted: 0,
      contracts_completed: 0,
      contracts_failed: 0,
      average_execution_time: 0,
      permission_scope_requests: [],
      tlp_level_requests: [],
      recent_activity: [],
      reputation_score: 0.5,
      first_seen: timestamp,
      last_seen: timestamp,
    };

    delegator_activity.contracts_created++;
    delegator_activity.last_seen = timestamp;
    
    // Track average execution time if provided
    if (contract.metadata?.estimated_duration_ms) {
      const new_duration = contract.metadata.estimated_duration_ms;
      if (delegator_activity.average_execution_time === 0) {
        delegator_activity.average_execution_time = new_duration;
      } else {
        // Update rolling average
        const total_contracts = delegator_activity.contracts_created;
        delegator_activity.average_execution_time = 
          ((delegator_activity.average_execution_time * (total_contracts - 1)) + new_duration) / total_contracts;
      }
    }
    
    if (contract.permission_token?.scopes) {
      delegator_activity.permission_scope_requests.push(...contract.permission_token.scopes);
    }
    
    if (contract.tlp_classification) {
      delegator_activity.tlp_level_requests.push(contract.tlp_classification);
    }

    delegator_activity.recent_activity.push({
      timestamp,
      action: 'contract_created',
      contract_id: contract.contract_id,
      details: {
        delegatee: contract.delegatee_agent_id,
        tlp_classification: contract.tlp_classification,
        estimated_duration_ms: contract.metadata?.estimated_duration_ms,
      },
    });

    // Keep only recent activity (last 100 entries)
    if (delegator_activity.recent_activity.length > 100) {
      delegator_activity.recent_activity = delegator_activity.recent_activity.slice(-100);
    }

    this.agentActivities.set(contract.delegator_agent_id, delegator_activity);
  }

  /**
   * Check for TLP escalation risks
   */
  private checkTLPEscalation(contract: DelegationContract): { risk: number; patterns?: string[] } {
    const tlp_classification = contract.tlp_classification;
    
    if (!tlp_classification || tlp_classification === 'TLP:CLEAR') {
      return { risk: 0 };
    }

    const patterns = [];
    let risk = 0;

    // Check if requesting higher TLP without proper justification
    if (tlp_classification === 'TLP:RED' && !contract.metadata?.requires_production_access) {
      patterns.push('TLP:RED requested without production access justification');
      risk += 0.6; // Increased from 0.3 to ensure detection
    }

    if (tlp_classification === 'TLP:AMBER' && (!contract.verification_policy || contract.verification_policy === 'none')) {
      patterns.push('TLP:AMBER requested without verification policy');
      risk += 0.4; // Increased from 0.2 to ensure detection
    }

    return { risk, patterns: patterns.length > 0 ? patterns : undefined };
  }

  /**
   * Check for mutual delegation patterns between agents
   */
  private checkMutualDelegations(agent1: string, agent2: string): number {
    const activity1 = this.agentActivities.get(agent1);
    const activity2 = this.agentActivities.get(agent2);
    
    if (!activity1 || !activity2) return 0;

    // Count delegations between these two agents
    let mutual_count = 0;
    
    activity1.recent_activity.forEach(activity => {
      if (activity.details && typeof activity.details === 'object' && 
          'delegatee' in activity.details && activity.details.delegatee === agent2) {
        mutual_count++;
      }
    });

    activity2.recent_activity.forEach(activity => {
      if (activity.details && typeof activity.details === 'object' &&
          'delegatee' in activity.details && activity.details.delegatee === agent1) {
        mutual_count++;
      }
    });

    return mutual_count;
  }

  /**
   * Detect context insufficiency — agents proceeding without adequate information
   * 
   * This threat vector catches delegation chains where agents are likely to make
   * assumption-based decisions. It checks whether the contract has sufficient
   * context for the delegatee to act without guessing.
   * 
   * Threat indicators:
   * - context_verification_required is true but minimum_context_confidence is very low
   * - Task description is vague or missing critical details
   * - No required capabilities specified for complex tasks
   * - High-complexity tasks without success criteria
   * - Cross-package tasks without explicit scope boundaries
   */
  /** Check task criteria coverage for complex tasks */
  private checkTaskCriteriaGaps(contract: DelegationContract, complexity: number): { risk: number; patterns: string[] } {
    const patterns: string[] = [];
    let risk = 0;
    if (complexity <= 5) return { risk, patterns };
    if (!contract.success_criteria?.required_checks || contract.success_criteria.required_checks.length === 0) {
      patterns.push('Complex task delegated without success criteria — delegatee will have to guess expected outcomes');
      risk += 0.25;
    }
    if (!contract.required_capabilities || contract.required_capabilities.length === 0) {
      patterns.push('Complex task delegated without required capabilities — agent match will be assumption-based');
      risk += 0.15;
    }
    return { risk, patterns };
  }

  /** Check for cross-package task without explicit resource scope */
  private checkCrossPackageScope(contract: DelegationContract): { risk: number; patterns: string[] } {
    const patterns: string[] = [];
    let risk = 0;
    const taskCategories = contract.metadata?.task_categories;
    if (!Array.isArray(taskCategories)) return { risk, patterns };
    const crossPkg = taskCategories.filter((cat: unknown) => {
      if (typeof cat !== 'string') return false;
      return cat.includes('cross-package') || cat.includes('multi-project') || cat.includes('workspace-wide');
    });
    if (crossPkg.length > 0 && !contract.permission_token?.resources?.length) {
      patterns.push('Cross-package task without explicit resource scope — agents may assume boundaries');
      risk += 0.2;
    }
    return { risk, patterns };
  }

  private async detectContextInsufficiency(contract: DelegationContract): Promise<ThreatDetectionResult> {
    const suspicious_patterns: string[] = [];
    let risk_score = 0;

    if (contract.context_verification_required &&
        contract.minimum_context_confidence !== undefined &&
        contract.minimum_context_confidence < 0.3) {
      suspicious_patterns.push('Context verification required but confidence threshold is dangerously low');
      risk_score += 0.3;
    }

    if (!contract.task_description || contract.task_description.trim().length < 20) {
      suspicious_patterns.push('Task description is missing or too vague for informed decision-making');
      risk_score += 0.3;
    }

    const estimatedComplexity = contract.metadata?.estimated_complexity as number | undefined;
    if (estimatedComplexity) {
      const criteriaCheck = this.checkTaskCriteriaGaps(contract, estimatedComplexity);
      risk_score += criteriaCheck.risk;
      suspicious_patterns.push(...criteriaCheck.patterns);

      if (estimatedComplexity > 7 && !contract.context_verification_required) {
        suspicious_patterns.push('High-complexity task does not require context verification — assumption risk is elevated');
        risk_score += 0.2;
      }
    }

    const scopeCheck = this.checkCrossPackageScope(contract);
    risk_score += scopeCheck.risk;
    suspicious_patterns.push(...scopeCheck.patterns);

    if (risk_score > 0.3) {
      return {
        threat_detected: true,
        threat_type: 'context_insufficiency',
        severity: risk_score > 0.7 ? 'high' : risk_score > 0.5 ? 'medium' : 'low',
        description: `Context insufficiency risk detected (score: ${risk_score.toFixed(2)}) — delegatee agent may make assumption-based decisions`,
        action: risk_score > 0.7 ? 'block' : 'warn',
        evidence: {
          metrics: {
            risk_score,
            pattern_count: suspicious_patterns.length,
            estimated_complexity: estimatedComplexity ?? 0,
            has_success_criteria: (contract.success_criteria?.required_checks?.length ?? 0) > 0 ? 1 : 0,
            context_verification_required: contract.context_verification_required ? 1 : 0,
          },
          related_entities: [contract.delegator_agent_id, contract.delegatee_agent_id],
          activity_timeline: [{
            timestamp: new Date().toISOString(),
            event: 'context_insufficiency_analysis',
            details: { suspicious_patterns, contract_id: contract.contract_id }
          }]
        },
        confidence: Math.min(risk_score, 0.9)
      };
    }

    return {
      threat_detected: false,
      threat_type: 'none',
      severity: 'low',
      description: 'Sufficient context provided for delegation',
      action: 'allow',
      evidence: {},
      confidence: 0.1
    };
  }

  /**
   * Get threat detection statistics
   */
  getThreatStatistics(): {
    total_validations: number;
    threats_detected: number;
    threat_types: Record<string, number>;
    severity_distribution: Record<string, number>;
    action_distribution: Record<string, number>;
  } {
    const threat_types: Record<string, number> = {};
    const severity_distribution: Record<string, number> = {};
    const action_distribution: Record<string, number> = {};

    this.threatHistory.forEach(threat => {
      if (threat.threat_detected) {
        threat_types[threat.threat_type] = (threat_types[threat.threat_type] || 0) + 1;
        severity_distribution[threat.severity] = (severity_distribution[threat.severity] || 0) + 1;
        action_distribution[threat.action] = (action_distribution[threat.action] || 0) + 1;
      }
    });

    return {
      total_validations: this.threatHistory.length,
      threats_detected: this.threatHistory.filter(t => t.threat_detected).length,
      threat_types,
      severity_distribution,
      action_distribution,
    };
  }

  /**
   * Get recent threat detections
   */
  getRecentThreats(limit = 10): ThreatDetectionResult[] {
    return this.threatHistory
      .filter(threat => threat.threat_detected)
      .slice(-limit)
      .reverse();
  }

  /**
   * Validate delegation request for security threats
   * Simplified method for integration tests - creates a minimal contract for validation
   */
  async validateDelegationRequest(request: {
    task_description: string;
    delegatee_agent_id: string;
    delegator_agent_id?: string;
    required_capabilities?: string[];
    capabilities_required?: string[];
    timeout_ms?: number;
    metadata?: Record<string, unknown>;
  }): Promise<{ is_safe: boolean; threats_detected: number; threat_types: string[] }> {
    // Create a minimal contract for validation
    const contract: DelegationContract = {
      contract_id: `validation_${Date.now()}`,
      task_id: 'validation_task',
      delegator: {
        agent_id: request.delegator_agent_id || 'system',
        agent_name: 'System',
      },
      delegatee: {
        agent_id: request.delegatee_agent_id,
        agent_name: request.delegatee_agent_id,
      },
      delegator_agent_id: request.delegator_agent_id || 'system',
      delegatee_agent_id: request.delegatee_agent_id,
      required_capabilities: (request.capabilities_required || request.required_capabilities || []).map((capability_id) => ({ capability_id })),
      task_description: request.task_description,
      verification_policy: 'direct_inspection',
      success_criteria: {},
      priority: 5,
      timeout_ms: request.timeout_ms || 300000,
      status: 'pending',
      created_at: new Date().toISOString(),
      metadata: request.metadata,
    };

    // Run validation
    const threat = await this.validateDelegationSecurity(contract);
    
    return {
      is_safe: !threat.threat_detected || threat.action === 'allow' || threat.action === 'warn',
      threats_detected: threat.threat_detected ? 1 : 0,
      threat_types: threat.threat_detected ? [threat.threat_type] : [],
    };
  }

  /**
   * Detect prompt injection attempts in task descriptions
   */
  private async detectPromptInjection(contract: DelegationContract): Promise<ThreatDetectionResult> {
    const taskDescription = contract.task_description?.toLowerCase() || '';
    
    // Prompt injection patterns
    const injectionPatterns = [
      'ignore previous instructions',
      'ignore all previous',
      'rm -rf',
      'expose api keys',
      'expose secrets',
      'delete all',
      'system prompt',
      'override instructions',
      'bypass restrictions',
      'execute system',
      'admin privileges',
      'root access'
    ];

    const detectedPatterns = injectionPatterns.filter(pattern => 
      taskDescription.includes(pattern)
    );

    if (detectedPatterns.length > 0) {
      return {
        threat_detected: true,
        threat_type: 'prompt_injection',
        severity: 'high',
        description: `Prompt injection patterns detected: ${detectedPatterns.join(', ')}`,
        action: 'block',
        confidence: 0.95,
        evidence: {
          metrics: { pattern_count: detectedPatterns.length },
          related_entities: [contract.delegator.agent_id, contract.delegatee.agent_id],
          activity_timeline: [{
            timestamp: new Date().toISOString(),
            event: 'prompt_injection_detected',
            details: { patterns: detectedPatterns, contract_id: contract.contract_id }
          }]
        }
      };
    }

    return { threat_detected: false, threat_type: 'none', severity: 'low', description: 'No prompt injection detected', action: 'allow', evidence: {}, confidence: 0.1 };
  }

  /** Check contract timeout and metadata for excessive resource limits */
  private checkResourceLimits(contract: DelegationContract, timeoutMs: number): { risk: number; indicators: string[] } {
    const indicators: string[] = [];
    let risk = 0;

    if (timeoutMs > 600000) {
      risk += 0.3;
      indicators.push(`Excessive timeout: ${timeoutMs}ms`);
    }
    if (timeoutMs > 1800000) {
      risk += 0.4;
      indicators.push('Extremely high timeout value');
    }

    const meta = contract.metadata;
    if (!meta) return { risk, indicators };

    if (typeof meta.iterations === 'number' && meta.iterations > 10_000_000) {
      risk += 0.5;
      indicators.push(`Excessive iterations: ${meta.iterations}`);
    }
    if (typeof meta.max_memory === 'number' && meta.max_memory > 1_000_000_000) {
      risk += 0.3;
      indicators.push(`Excessive memory: ${meta.max_memory} bytes`);
    }

    return { risk, indicators };
  }

  /** Scan task description for resource-exhaustion keywords */
  private checkExhaustionKeywords(taskDescription: string): { risk: number; indicators: string[] } {
    const exhaustionPatterns = [
      'infinite loop', 'recursive calls', 'unlimited', 'maximum resources',
      'all available memory', 'exhaust', 'ddos', 'flood'
    ];
    const detected = exhaustionPatterns.filter(p => taskDescription.includes(p));
    return {
      risk: detected.length * 0.2,
      indicators: detected.map(p => `Resource exhaustion pattern: ${p}`)
    };
  }

  /**
   * Detect resource exhaustion attempts
   */
  private async detectResourceExhaustion(contract: DelegationContract): Promise<ThreatDetectionResult> {
    const timeoutMs = contract.timeout_ms ?? 0;

    const limits = this.checkResourceLimits(contract, timeoutMs);
    const keywords = this.checkExhaustionKeywords(contract.task_description?.toLowerCase() ?? '');

    const riskScore = limits.risk + keywords.risk;
    const indicators = [...limits.indicators, ...keywords.indicators];

    if (riskScore > 0.4) {
      return {
        threat_detected: true,
        threat_type: 'resource_exhaustion',
        severity: riskScore > 0.7 ? 'high' : 'medium',
        description: `Resource exhaustion risk detected (score: ${riskScore.toFixed(2)})`,
        action: riskScore > 0.7 ? 'block' : 'warn',
        confidence: Math.min(riskScore, 0.9),
        evidence: {
          metrics: { risk_score: riskScore, indicator_count: indicators.length },
          related_entities: [contract.delegator.agent_id, contract.delegatee.agent_id],
          activity_timeline: [{
            timestamp: new Date().toISOString(),
            event: 'resource_exhaustion_analysis',
            details: { indicators, contract_id: contract.contract_id }
          }]
        }
      };
    }

    return { threat_detected: false, threat_type: 'none', severity: 'low', description: 'No resource exhaustion risk detected', action: 'allow', evidence: {}, confidence: 0.1 };
  }
}
