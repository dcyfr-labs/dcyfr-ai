/**
 * DCYFR Agent Capability Registry
 * TLP:CLEAR
 *
 * Manages agent capability manifests for intelligent task delegation and assignment.
 * Provides capability-based matching and agent selection for delegation framework.
 *
 * @version 1.0.0
 * @date 2026-02-13
 * @module dcyfr-ai/capability-registry
 */

import { EventEmitter } from 'events';
import type {
  AgentCapabilityManifest,
  TaskCapabilityMatch,
  CapabilityQuery,
  ICapabilityRegistry,
  AgentCapability,
} from './types/agent-capabilities';

/**
 * In-memory capability registry with event-driven updates
 */
export class CapabilityRegistry extends EventEmitter implements ICapabilityRegistry {
  private manifests: Map<string, AgentCapabilityManifest> = new Map();
  private lastUpdated: Map<string, number> = new Map();

  constructor() {
    super();
    this.setMaxListeners(100);
  }

  /**
   * Register agent capability manifest
   */
  registerManifest(manifest: AgentCapabilityManifest): void {
    // Validate manifest completeness
    if (!manifest.agent_id || !manifest.capabilities) {
      throw new Error('Invalid capability manifest: missing required fields');
    }

    // Validate capabilities structure (support both full and simplified formats)
    for (const capability of manifest.capabilities) {
      const conf = (capability as any).confidence_level ?? (capability as any).confidence;
      if (conf !== undefined && (conf < 0 || conf > 1)) {
        const capId = (capability as any).capability_id || (capability as any).capability;
        throw new Error(`Invalid confidence level for capability ${capId}: must be 0-1`);
      }
    }

    const now = Date.now();
    const updatedManifest: AgentCapabilityManifest = {
      ...manifest,
      updated_at: new Date().toISOString(),
      overall_confidence: manifest.overall_confidence ?? this.calculateOverallConfidence(manifest.capabilities),
    };

    this.manifests.set(manifest.agent_id, updatedManifest);
    this.lastUpdated.set(manifest.agent_id, now);

    this.emit('manifest_registered', { agentId: manifest.agent_id, manifest: updatedManifest });
  }

  /**
   * Update agent capability manifest
   */
  updateManifest(agentId: string, updates: Partial<AgentCapabilityManifest>): void {
    const existing = this.manifests.get(agentId);
    if (!existing) {
      throw new Error(`Agent manifest not found: ${agentId}`);
    }

    const updatedManifest: AgentCapabilityManifest = {
      ...existing,
      ...updates,
      agent_id: agentId, // Ensure ID cannot be changed
      updated_at: new Date().toISOString(),
    };

    // Recalculate overall confidence if capabilities updated
    if (updates.capabilities) {
      updatedManifest.overall_confidence = this.calculateOverallConfidence(updates.capabilities);
    }

    this.manifests.set(agentId, updatedManifest);
    this.lastUpdated.set(agentId,Date.now());

    this.emit('manifest_updated', { agentId, manifest: updatedManifest });
  }

  /**
   * Get agent capability manifest
   */
  getManifest(agentId: string): AgentCapabilityManifest | undefined {
    return this.manifests.get(agentId);
  }

  /**
   * List all registered manifests
   */
  listManifests(): AgentCapabilityManifest[] {
    return Array.from(this.manifests.values());
  }

  /**
   * Query agents by capability criteria
   */
  queryCapabilities(query: CapabilityQuery): TaskCapabilityMatch[] {
    const matches: TaskCapabilityMatch[] = [];

    for (const [agentId, manifest] of this.manifests) {
      // Skip offline/unavailable agents if requested
      if (query.only_available && manifest.availability !== 'available') {
        continue;
      }

      // Skip excluded agents
      if (query.exclude_agents?.includes(agentId)) {
        continue;
      }

      // Find matching capabilities
      const matchingCapabilities = manifest.capabilities.filter(capability =>
        this.matchesCapabilityQuery(capability, query)
      );

      // Create matches for each qualifying capability
      for (const capability of matchingCapabilities) {
        const match: TaskCapabilityMatch = {
          agent_id: agentId,
          agent_name: manifest.agent_name,
          capability,
          match_score: this.calculateMatchScore(capability, query, manifest),
          match_reasons: this.generateMatchReasons(capability, query),
          estimated_completion_time_ms: capability.completion_time_estimate_ms,
          availability: manifest.availability || 'available',
          current_workload: manifest.current_workload || 0,
          priority: this.calculatePriority(capability, manifest, query),
        };

        // Add warnings for potential issues
        const warnings = this.generateWarnings(capability, manifest, query);
        if (warnings.length > 0) {
          match.warnings = warnings;
        }

        matches.push(match);
      }
    }

    // Sort by priority (descending) and match score (descending)
    matches.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return b.match_score - a.match_score;
    });

    return matches;
  }

  /**
   * Update agent availability
   */
  updateAvailability(agentId: string, availability: 'available' | 'busy' | 'offline' | 'maintenance'): void {
    const manifest = this.manifests.get(agentId);
    if (!manifest) {
      throw new Error(`Agent manifest not found: ${agentId}`);
    }

    manifest.availability = availability;
    manifest.updated_at = new Date().toISOString();

    this.emit('availability_updated', { agentId, availability });
  }

  /**
   * Update agent workload
   */
  updateWorkload(agentId: string, currentWorkload: number): void {
    const manifest = this.manifests.get(agentId);
    if (!manifest) {
      throw new Error(`Agent manifest not found: ${agentId}`);
    }

    manifest.current_workload = currentWorkload;
    manifest.updated_at = new Date().toISOString();

    this.emit('workload_updated', { agentId, currentWorkload });
  }

  /**
   * Delete agent manifest
   */
  deleteManifest(agentId: string): void {
    const deleted = this.manifests.delete(agentId);
    if (!deleted) {
      throw new Error(`Agent manifest not found: ${agentId}`);
    }

    this.lastUpdated.delete(agentId);
    this.emit('manifest_deleted', { agentId });
  }

  /**
   * Find capability matches for a query (alias for queryCapabilities)
   */
  findMatches(query: CapabilityQuery): TaskCapabilityMatch[] {
    return this.queryCapabilities(query);
  }

  /**
   * Register multiple agent capability manifests at once
   */
  registerManifests(manifests: AgentCapabilityManifest[]): void {
    for (const manifest of manifests) {
      this.registerManifest(manifest);
    }
  }

  /**
   * Clear all registered manifests
   */
  clear(): void {
    this.manifests.clear();
    this.lastUpdated.clear();
    this.emit('registry_cleared');
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalAgents: number;
    availableAgents: number;
    totalCapabilities: number;
    avgConfidence: number;
    lastUpdated: string;
  } {
    const manifests = Array.from(this.manifests.values());
    const availableCount = manifests.filter(m => m.availability === 'available').length;
    const totalCapabilities = manifests.reduce((sum, m) => sum + m.capabilities.length, 0);
    const avgConfidence = manifests.length > 0
      ? manifests.reduce((sum, m) => sum + (m.overall_confidence || 0), 0) / manifests.length
      : 0;

    const lastUpdate = Math.max(...Array.from(this.lastUpdated.values()));

    return {
      totalAgents: manifests.length,
      availableAgents: availableCount,
      totalCapabilities,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      lastUpdated: new Date(lastUpdate).toISOString(),
    };
  }

  // Private helper methods

  private calculateOverallConfidence(capabilities: AgentCapability[]): number {
    if (capabilities.length === 0) return 0;
    const sum = capabilities.reduce((acc, cap) => acc + cap.confidence_level, 0);
    return Math.round((sum / capabilities.length) * 100) / 100;
  }

  private matchesCapabilityQuery(capability: AgentCapability, query: CapabilityQuery): boolean {
    // Check required capabilities
    if (query.required_capabilities && !query.required_capabilities.includes(capability.capability_id)) {
      return false;
    }

    // Check minimum confidence
    if (query.min_confidence && capability.confidence_level < query.min_confidence) {
      return false;
    }

    // Check maximum completion time
    if (query.max_completion_time_ms && capability.completion_time_estimate_ms > query.max_completion_time_ms) {
      return false;
    }

    // Check TLP clearance
    if (query.required_tlp_clearance && capability.tlp_clearance !== query.required_tlp_clearance) {
      return false;
    }

    // Check success rate
    if (query.min_success_rate && (capability.success_rate || 0) < query.min_success_rate) {
      return false;
    }

    // Check minimum completions
    if (query.min_completions && (capability.successful_completions || 0) < query.min_completions) {
      return false;
    }

    // Check task patterns
    if (query.task_patterns) {
      const hasMatchingPattern = query.task_patterns.some(pattern =>
        capability.supported_patterns?.some(supportedPattern =>
          supportedPattern.toLowerCase().includes(pattern.toLowerCase())
        )
      );
      if (!hasMatchingPattern) return false;
    }

    // Check required tags
    if (query.required_tags) {
      const hasAllTags = query.required_tags.every(requiredTag =>
        capability.tags?.some(tag => tag.toLowerCase() === requiredTag.toLowerCase())
      );
      if (!hasAllTags) return false;
    }

    return true;
  }

  private calculateMatchScore(capability: AgentCapability, query: CapabilityQuery, manifest: AgentCapabilityManifest): number {
    let score = capability.confidence_level;

    // Bonus for success rate
    if (capability.success_rate) {
      score += capability.success_rate * 0.2;
    }

    // Bonus for experience (completions)
    if (capability.successful_completions) {
      const experienceBonus = Math.min(capability.successful_completions / 100, 0.2);
      score += experienceBonus;
    }

    // Penalty for high workload
    if (manifest.current_workload && manifest.max_concurrent_tasks) {
      const workloadRatio = manifest.current_workload / manifest.max_concurrent_tasks;
      score -= workloadRatio * 0.3;
    }

    // Availability bonus
    if (manifest.availability === 'available') {
      score += 0.1;
    }

    return Math.min(Math.max(score, 0), 1);
  }

  private generateMatchReasons(capability: AgentCapability, query: CapabilityQuery): string[] {
    const reasons: string[] = [];

    if (query.required_capabilities?.includes(capability.capability_id)) {
      reasons.push(`Matches required capability: ${capability.name}`);
    }

    if (capability.confidence_level >= (query.min_confidence || 0)) {
      reasons.push(`High confidence level: ${Math.round(capability.confidence_level * 100)}%`);
    }

    if (capability.success_rate && capability.success_rate >= (query.min_success_rate || 0)) {
      reasons.push(`Strong success rate: ${Math.round(capability.success_rate * 100)}%`);
    }

    if (capability.successful_completions && capability.successful_completions >= (query.min_completions || 0)) {
      reasons.push(`Experienced: ${capability.successful_completions} completions`);
    }

    return reasons;
  }

  private generateWarnings(capability: AgentCapability, manifest: AgentCapabilityManifest, query: CapabilityQuery): string[] {
    const warnings: string[] = [];

    // High workload warning
    if (manifest.current_workload && manifest.max_concurrent_tasks) {
      const workloadRatio = manifest.current_workload / manifest.max_concurrent_tasks;
      if (workloadRatio > 0.8) {
        warnings.push(`High workload: ${manifest.current_workload}/${manifest.max_concurrent_tasks} tasks`);
      }
    }

    // Low success rate warning
    if (capability.success_rate && capability.success_rate < 0.8) {
      warnings.push(`Lower success rate: ${Math.round(capability.success_rate * 100)}%`);
    }

    // Limited experience warning
    if (capability.successful_completions && capability.successful_completions < 5) {
      warnings.push(`Limited experience: ${capability.successful_completions} completions`);
    }

    // Capability limitations
    if (capability.limitations && capability.limitations.length > 0) {
      warnings.push(`Known limitations: ${capability.limitations.join(', ')}`);
    }

    return warnings;
  }

  private calculatePriority(capability: AgentCapability, manifest: AgentCapabilityManifest, query: CapabilityQuery): number {
    let priority = 50; // Base priority

    // Higher priority for exact capability matches
    if (query.required_capabilities?.includes(capability.capability_id)) {
      priority += 30;
    }

    // Priority based on confidence
    priority += capability.confidence_level * 20;

    // Priority based on availability
    switch (manifest.availability) {
      case 'available':
        priority += 20;
        break;
      case 'busy':
        priority -= 10;
        break;
      case 'offline':
        priority -= 30;
        break;
      case 'maintenance':
        priority -= 20;
        break;
    }

    // Priority based on workload
    if (manifest.current_workload && manifest.max_concurrent_tasks) {
      const workloadRatio = manifest.current_workload / manifest.max_concurrent_tasks;
      priority -= workloadRatio * 15;
    }

    return Math.max(priority, 0);
  }

  /**
   * Find agents by capability (convenience wrapper for queryCapabilities)
   */
  async findByCapability(
    capabilityId: string,
    options: { minConfidence?: number } = {}
  ): Promise<TaskCapabilityMatch[]> {
    return this.queryCapabilities({
      required_capabilities: [capabilityId],
      min_confidence: options.minConfidence,
      only_available: true,
    });
  }

  /**
   * Rank agents by multiple capabilities (convenience wrapper for queryCapabilities)
   */
  async rankAgents(
    requiredCapabilities: string[],
    options: { confidenceWeight?: number; considerWorkload?: boolean } = {}
  ): Promise<TaskCapabilityMatch[]> {
    return this.queryCapabilities({
      required_capabilities: requiredCapabilities,
      only_available: true,
    });
  }

  /**
   * Increment agent workload (convenience wrapper for updateWorkload)
   */
  async incrementWorkload(agentId: string): Promise<void> {
    const manifest = this.manifests.get(agentId);
    if (!manifest) {
      throw new Error(`Agent manifest not found: ${agentId}`);
    }
    const currentWorkload = (manifest.current_workload || 0) + 1;
    await this.updateWorkload(agentId, currentWorkload);
  }

  /**
   * Decrement agent workload (convenience wrapper for updateWorkload)
   */
  async decrementWorkload(agentId: string): Promise<void> {
    const manifest = this.manifests.get(agentId);
    if (!manifest) {
      throw new Error(`Agent manifest not found: ${agentId}`);
    }
    const currentWorkload = Math.max(0, (manifest.current_workload || 0) - 1);
    await this.updateWorkload(agentId, currentWorkload);
  }
}

/**
 * Default capability registry instance
 */
export const defaultCapabilityRegistry = new CapabilityRegistry();

/**
 * Create a new capability registry instance
 */
export function createCapabilityRegistry(): CapabilityRegistry {
  return new CapabilityRegistry();
}