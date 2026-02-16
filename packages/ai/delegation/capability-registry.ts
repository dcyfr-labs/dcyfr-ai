/**
 * DCYFR Capability Registry
 * TLP:AMBER - Internal Use Only
 * 
 * Central registry for agent capability manifests.
 * Enables intelligent task delegation based on agent capabilities,
 * confidence levels, and resource requirements.
 * 
 * @module capability-registry
 * @version 1.0.0
 * @date 2026-02-15
 */

import type {
  AgentCapability,
  AgentCapabilityManifest,
  CapabilityMatchCriteria,
  CapabilityMatchResult,
  CapabilityQuery,
  RegisterCapabilityRequest,
  UpdateCapabilityRequest,
  ProficiencyLevel,
} from '../types/agent-capabilities.js';

/**
 * In-memory capability registry
 * Production implementation would use persistent storage
 */
export class CapabilityRegistry {
  private manifests: Map<string, AgentCapabilityManifest> = new Map();
  private capabilities: Map<string, AgentCapability> = new Map();

  /**
   * Register a complete agent capability manifest
   */
  registerManifest(manifest: AgentCapabilityManifest): void {
    // Validate manifest
    if (!manifest.agent_id || !manifest.agent_name) {
      throw new Error('Agent ID and name are required');
    }

    if (!manifest.capabilities || manifest.capabilities.length === 0) {
      throw new Error('At least one capability must be declared');
    }

    // Store manifest
    this.manifests.set(manifest.agent_id, manifest);

    // Index individual capabilities for fast lookup
    for (const capability of manifest.capabilities) {
      const capabilityKey = `${manifest.agent_id}:${capability.capability_id}`;
      this.capabilities.set(capabilityKey, capability);
    }

    console.log(`📋 Registered capability manifest for agent: ${manifest.agent_name} (${manifest.capabilities.length} capabilities)`);
  }

  /**
   * Register a single capability for an agent
   */
  registerCapability(request: RegisterCapabilityRequest): string {
    const { agent_id, agent_name, capability } = request;

    // Generate capability ID
    const capability_id = `${capability.capability_name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;

    // Create full capability
    const fullCapability: AgentCapability = {
      ...capability,
      capability_id,
      registered_at: new Date().toISOString(),
    };

    // Get or create manifest
    let manifest = this.manifests.get(agent_id);
    if (!manifest) {
      manifest = {
        agent_id,
        agent_name,
        agent_version: '1.0.0',
        manifest_version: '1.0.0',
        capabilities: [],
        overall_confidence: 0,
        availability: 'available',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.manifests.set(agent_id, manifest);
    }

    // Add capability
    manifest.capabilities.push(fullCapability);
    manifest.updated_at = new Date().toISOString();

    // Recalculate overall confidence
    manifest.overall_confidence = this.calculateOverallConfidence(manifest.capabilities);

    // Index capability
    const capabilityKey = `${agent_id}:${capability_id}`;
    this.capabilities.set(capabilityKey, fullCapability);

    console.log(`✅ Registered capability: ${fullCapability.capability_name} for ${agent_name}`);

    return capability_id;
  }

  /**
   * Update an existing capability
   */
  updateCapability(agent_id: string, update: UpdateCapabilityRequest): void {
    const capabilityKey = `${agent_id}:${update.capability_id}`;
    const capability = this.capabilities.get(capabilityKey);

    if (!capability) {
      throw new Error(`Capability not found: ${update.capability_id}`);
    }

    // Apply updates
    if (update.confidence_level !== undefined) {
      capability.confidence_level = update.confidence_level;
    }
    if (update.estimated_completion_time_ms !== undefined) {
      capability.estimated_completion_time_ms = update.estimated_completion_time_ms;
    }
    if (update.performance) {
      capability.performance = update.performance;
    }
    if (update.calibration) {
      capability.calibration = update.calibration;
    }
    if (update.metadata) {
      capability.metadata = { ...capability.metadata, ...update.metadata };
    }

    capability.last_validated_at = new Date().toISOString();

    // Update manifest
    const manifest = this.manifests.get(agent_id);
    if (manifest) {
      manifest.updated_at = new Date().toISOString();
      manifest.overall_confidence = this.calculateOverallConfidence(manifest.capabilities);
    }

    console.log(`♻️ Updated capability: ${capability.capability_name}`);
  }

  /**
   * Get manifest for a specific agent
   */
  getManifest(agent_id: string): AgentCapabilityManifest | undefined {
    return this.manifests.get(agent_id);
  }

  /**
   * Get all registered manifests
   */
  getAllManifests(): AgentCapabilityManifest[] {
    return Array.from(this.manifests.values());
  }

  /**
   * Query capabilities based on criteria
   */
  queryCapabilities(query: CapabilityQuery): AgentCapability[] {
    let results = Array.from(this.capabilities.values());

    // Filter by agent
    if (query.agent_id) {
      results = results.filter(cap => 
        this.capabilities.has(`${query.agent_id}:${cap.capability_id}`)
      );
    }

    // Filter by category
    if (query.category) {
      const categories = Array.isArray(query.category) ? query.category : [query.category];
      results = results.filter(cap => categories.includes(cap.category));
    }

    // Filter by minimum confidence
    if (query.min_confidence !== undefined) {
      results = results.filter(cap => cap.confidence_level >= query.min_confidence!);
    }

    // Filter by proficiency level
    if (query.proficiency_level) {
      const levels = Array.isArray(query.proficiency_level) 
        ? query.proficiency_level 
        : [query.proficiency_level];
      results = results.filter(cap => levels.includes(cap.proficiency_level));
    }

    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      results = results.filter(cap => 
        query.tags!.some(tag => cap.tags?.includes(tag))
      );
    }

    // Sort results
    if (query.sort_by) {
      results.sort((a, b) => {
        const aVal = (a as unknown as Record<string, number>)[query.sort_by!] ?? 0;
        const bVal = (b as unknown as Record<string, number>)[query.sort_by!] ?? 0;
        return query.sort_order === 'desc' ? bVal - aVal : aVal - bVal;
      });
    }

    // Pagination
    const offset = query.offset || 0;
    const limit = query.limit || results.length;
    results = results.slice(offset, offset + limit);

    return results;
  }

  /**
   * Match agents to task requirements
   */
  matchAgents(criteria: CapabilityMatchCriteria): CapabilityMatchResult[] {
    const results: CapabilityMatchResult[] = [];

    for (const manifest of this.manifests.values()) {
      // Check availability
      if (criteria.exclude_at_capacity && manifest.current_workload && manifest.current_workload >= 1.0) {
        continue;
      }

      // Check TLP clearance
      if (criteria.required_tlp_clearance) {
        if (!manifest.tlp_clearance?.includes(criteria.required_tlp_clearance)) {
          continue;
        }
      }

      // Find matching capabilities
      const matchedCapabilities: AgentCapability[] = [];
      let totalMatchScore = 0;

      for (const capability of manifest.capabilities) {
        let capabilityMatchScore = 0;
        let matches = true;

        // Category match
        if (criteria.required_categories && criteria.required_categories.length > 0) {
          if (!criteria.required_categories.includes(capability.category)) {
            matches = false;
          } else {
            capabilityMatchScore += 0.3;
          }
        }

        // Confidence threshold
        if (criteria.min_confidence !== undefined) {
          if (capability.confidence_level < criteria.min_confidence) {
            matches = false;
          } else {
            capabilityMatchScore += 0.3 * (capability.confidence_level / criteria.min_confidence);
          }
        }

        // Proficiency level
        if (criteria.min_proficiency_level) {
          const proficiencyScore = this.getProficiencyScore(capability.proficiency_level);
          const minProficiencyScore = this.getProficiencyScore(criteria.min_proficiency_level);
          if (proficiencyScore < minProficiencyScore) {
            matches = false;
          } else {
            capabilityMatchScore += 0.2;
          }
        }

        // Completion time
        if (criteria.max_completion_time_ms !== undefined) {
          if (capability.estimated_completion_time_ms > criteria.max_completion_time_ms) {
            matches = false;
          } else {
            capabilityMatchScore += 0.2;
          }
        }

        if (matches) {
          matchedCapabilities.push(capability);
          totalMatchScore += capabilityMatchScore;
        }
      }

      // Only include agents with matching capabilities
      if (matchedCapabilities.length > 0) {
        const aggregateConfidence = matchedCapabilities.reduce(
          (sum, cap) => sum + cap.confidence_level, 
          0
        ) / matchedCapabilities.length;

        const estimatedTime = Math.max(
          ...matchedCapabilities.map(cap => cap.estimated_completion_time_ms)
        );

        results.push({
          agent_id: manifest.agent_id,
          agent_name: manifest.agent_name,
          matched_capabilities: matchedCapabilities,
          match_score: totalMatchScore / matchedCapabilities.length,
          aggregate_confidence: aggregateConfidence,
          estimated_completion_time_ms: estimatedTime,
          meets_all_criteria: true,
        });
      }
    }

    // Sort by match score
    results.sort((a, b) => b.match_score - a.match_score);

    // Assign ranks
    results.forEach((result, index) => {
      result.rank = index + 1;
    });

    return results;
  }

  /**
   * Calculate overall confidence from capabilities
   */
  private calculateOverallConfidence(capabilities: AgentCapability[]): number {
    if (capabilities.length === 0) return 0;
    
    const sum = capabilities.reduce((acc, cap) => acc + cap.confidence_level, 0);
    return sum / capabilities.length;
  }

  /**
   * Get numeric proficiency score
   */
  private getProficiencyScore(level: ProficiencyLevel): number {
    const scores: Record<ProficiencyLevel, number> = {
      novice: 1,
      intermediate: 2,
      advanced: 3,
      expert: 4,
      master: 5,
    };
    return scores[level];
  }

  /**
   * Get registry statistics
   */
  getStatistics() {
    const manifests = Array.from(this.manifests.values());
    const capabilities = Array.from(this.capabilities.values());

    return {
      total_agents: manifests.length,
      total_capabilities: capabilities.length,
      available_agents: manifests.filter(m => m.availability === 'available').length,
      avg_capabilities_per_agent: manifests.length > 0 
        ? capabilities.length / manifests.length 
        : 0,
      avg_confidence: capabilities.length > 0
        ? capabilities.reduce((sum, cap) => sum + cap.confidence_level, 0) / capabilities.length
        : 0,
    };
  }
}
