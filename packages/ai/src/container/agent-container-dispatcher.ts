/**
 * AgentContainerDispatcher
 * TLP:CLEAR
 *
 * High-level coordinator that bridges GitHub issues / freeform tasks with the
 * container execution backend and the delegation framework.
 *
 * Responsibilities:
 *  - Parse issue metadata → detect affected scope, capabilities, resource tier
 *  - Select the best delegatee agent via CapabilityRegistry
 *  - Create a DelegationContract and provision an agent container
 *  - Track active dispatches in-memory; surface them via getActiveDispatches()
 *  - Cancel running dispatches (tears down container, marks contract failed)
 *
 * @module container/agent-container-dispatcher
 * @version 1.0.0
 * @date 2026-03-12
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { DelegationContractManager } from '../../delegation/contract-manager.js';
import type { CapabilityRegistry } from '../capability-registry.js';
import type {
  ContainerExecutionBackend,
  AgentContainerConfig,
  ContainerHandle,
  ContainerBackendType,
} from './types.js';
import type { DelegationContract, DelegationAgent } from '../../types/delegation-contracts.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Lightweight description of a GitHub issue for dispatch purposes. */
export interface IssueDispatchInput {
  /** The GitHub issue number (used for PR linking). */
  issueNumber: number;
  /** Issue title. */
  title: string;
  /** Issue body (markdown). May be empty. */
  body?: string;
  /** Labels applied to the issue (lowercase, hyphenated). */
  labels?: string[];
  /** GitHub repository in "owner/repo" format. */
  repo: string;
  /** Optional runtime backend override (e.g. 'remote-docker'). */
  backendType?: ContainerBackendType;
}

/** Freeform task dispatch (no issue linked). */
export interface TaskDispatchInput {
  /** Short task identifier (slug). */
  taskId: string;
  /** Human-readable description of what the agent should do. */
  description: string;
  /** Constrain which capabilities the agent must have. */
  requiredCapabilities?: string[];
  /** GitHub repository the agent should operate on. */
  repo: string;
  /** Optional runtime backend override (e.g. 'remote-docker'). */
  backendType?: ContainerBackendType;
}

/** Options shared by both dispatch methods. */
export interface DispatchOptions {
  /**
   * Override image for this dispatch.
   * Defaults to `AgentContainerDispatcherOptions.defaultImage`.
   */
  image?: string;
  /** Execution time limit in milliseconds. Defaults to 1800000 (30 min). */
  maxExecutionTimeMs?: number;
  /** When true, skip push / PR creation (dry-run mode). */
  dryRun?: boolean;
  /**
   * Base64-encoded script to run inside the container.
   * Takes priority over task description auto-generation.
   */
  taskScriptB64?: string;

  /** Runtime backend override for this dispatch (e.g. 'remote-docker'). */
  backendType?: ContainerBackendType;
}

/** Record of a live dispatch. */
export interface DispatchRecord {
  /** Contract ID (also used as primary key in the delegation DB). */
  contractId: string;
  /** Human-readable task slug. */
  taskId: string;
  /** Container handle returned by the backend. */
  containerHandle: ContainerHandle;
  /** ISO timestamp when the dispatch was started. */
  dispatchedAt: string;
  /** GitHub issue number, if this dispatch originated from an issue. */
  issueNumber?: number;
  /** Target repository. */
  repo: string;
}

// Resource tier presets ---------------------------------------------------

type ResourceTier = 'small' | 'medium' | 'large';

const RESOURCE_PRESETS: Record<ResourceTier, { maxMemory: string; maxCpus: number; maxExecutionTimeMs: number }> = {
  small:  { maxMemory: '512m', maxCpus: 1,   maxExecutionTimeMs:  900_000 }, // 15 min
  medium: { maxMemory: '2g',   maxCpus: 2,   maxExecutionTimeMs: 1_800_000 }, // 30 min
  large:  { maxMemory: '4g',   maxCpus: 4,   maxExecutionTimeMs: 3_600_000 }, // 60 min
};

// Scope / label → capability category mapping ----------------------------

const LABEL_TO_CAPABILITY: Record<string, string> = {
  'type:bug':          'code_review',
  'type:feature':      'code_generation',
  'type:refactor':     'code_generation',
  'type:test':         'test_generation',
  'type:docs':         'documentation',
  'type:security':     'security_analysis',
  'type:performance':  'performance_analysis',
  'type:api':          'api_development',
  'type:ui':           'ui_development',
};

// Keywords in issue title/body that suggest specific capabilities ----------

const KEYWORD_TO_CAPABILITY: Array<[RegExp, string]> = [
  [/\btest(s|ing)?\b/i,         'test_generation'],
  [/\bsecurity|vuln|CVE\b/i,   'security_analysis'],
  [/\bperformance|slow|latency\b/i, 'performance_analysis'],
  [/\bdocument(ation)?\b/i,    'documentation'],
  [/\brefactor\b/i,             'code_generation'],
  [/\bbug|fix|error|crash\b/i,  'code_review'],
];

// ---------------------------------------------------------------------------
// Constructor options
// ---------------------------------------------------------------------------

export interface AgentContainerDispatcherOptions {
  /** Agent container backend (e.g., LocalDockerBackend). */
  backend: ContainerExecutionBackend;
  /** Delegation contract manager for contract lifecycle. */
  contractManager: DelegationContractManager;
  /** Capability registry for delegatee agent selection. */
  capabilityRegistry?: CapabilityRegistry;
  /**
   * Agent to use as delegator (who is "assigning" the container work).
   * Defaults to a system dispatcher agent.
   */
  delegatorAgent?: DelegationAgent;
  /** GitHub token for container secret injection. */
  githubToken: string;
  /** Default container image tag. */
  defaultImage?: string;

  /** Optional backend map for runtime per-dispatch backend override. */
  backendsByType?: Partial<Record<ContainerBackendType, ContainerExecutionBackend>>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class AgentContainerDispatcher extends EventEmitter {
  private readonly backend: ContainerExecutionBackend;
  private readonly contractManager: DelegationContractManager;
  private readonly capabilityRegistry?: CapabilityRegistry;
  private readonly delegatorAgent: DelegationAgent;
  private readonly githubToken: string;
  private readonly defaultImage: string;
  private readonly backendsByType: Partial<Record<ContainerBackendType, ContainerExecutionBackend>>;

  /** In-memory active dispatch registry. */
  private readonly _dispatches = new Map<string, DispatchRecord>();

  constructor(options: AgentContainerDispatcherOptions) {
    super();
    this.backend = options.backend;
    this.contractManager = options.contractManager;
    this.capabilityRegistry = options.capabilityRegistry;
    this.githubToken = options.githubToken;
    this.defaultImage = options.defaultImage ?? 'dcyfr/agent:latest';
    this.backendsByType = {
      [this.backend.backendType]: this.backend,
      ...(options.backendsByType ?? {}),
    };
    this.delegatorAgent = options.delegatorAgent ?? {
      agent_id: 'agent-container-dispatcher',
      agent_name: 'AgentContainerDispatcher',
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Dispatch an agent container from a GitHub issue.
   *
   * Detects scope (affected packages/capabilities) from issue labels and
   * body keywords, selects the best available delegatee agent via the
   * capability registry, creates a delegation contract, and provisions
   * an agent container.
   */
  async dispatchFromIssue(
    issue: IssueDispatchInput,
    options: DispatchOptions = {},
  ): Promise<DispatchRecord> {
    const capability = this.detectCapability(issue.labels ?? [], issue.title + ' ' + (issue.body ?? ''));
    const tier = this.estimateResourceTier(issue.title + ' ' + (issue.body ?? ''));
    const taskId = `issue-${issue.issueNumber}-${randomUUID().slice(0, 8)}`;
    const taskDescription = this.buildTaskDescription(issue);

    return this.createDispatch({
      taskId,
      taskDescription,
      capability,
      tier,
      repo: issue.repo,
      issueNumber: issue.issueNumber,
      options: {
        ...options,
        backendType: options.backendType ?? issue.backendType,
      },
    });
  }

  /**
   * Dispatch an agent container from a freeform task description.
   */
  async dispatchFromTask(
    task: TaskDispatchInput,
    options: DispatchOptions = {},
  ): Promise<DispatchRecord> {
    const capability = (task.requiredCapabilities?.[0]) ??
      this.detectCapabilityFromText(task.description);
    const tier = this.estimateResourceTier(task.description);

    return this.createDispatch({
      taskId: task.taskId,
      taskDescription: task.description,
      capability,
      tier,
      repo: task.repo,
      options: {
        ...options,
        backendType: options.backendType ?? task.backendType,
      },
    });
  }

  /**
   * Cancel a running dispatch by contract ID.
   * Tears down the container and marks the contract as failed.
   */
  async cancel(contractId: string): Promise<void> {
    const record = this._dispatches.get(contractId);
    if (!record) {
      return; // Already gone
    }

    try {
      const selectedBackend = this.resolveBackend(record.containerHandle.backendType);
      await selectedBackend.teardown(record.containerHandle);
    } catch {
      // Best-effort teardown
    }

    this._dispatches.delete(contractId);

    try {
      await this.contractManager.updateContract({
        contract_id: contractId,
        status: 'failed',
        metadata: { cancellation_reason: 'Cancelled by AgentContainerDispatcher.cancel()' },
      } as Parameters<typeof this.contractManager.updateContract>[0]);
    } catch {
      // Best-effort contract update
    }

    this.emit('dispatch_cancelled', { contractId });
  }

  /**
   * List all currently active dispatches.
   */
  async getActiveDispatches(): Promise<DispatchRecord[]> {
    return Array.from(this._dispatches.values());
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async createDispatch(params: {
    taskId: string;
    taskDescription: string;
    capability: string;
    tier: ResourceTier;
    repo: string;
    issueNumber?: number;
    options: DispatchOptions;
  }): Promise<DispatchRecord> {
    const { taskId, taskDescription, capability, tier, repo, issueNumber, options } = params;
    const contractId = randomUUID();
    const resources = RESOURCE_PRESETS[tier];
    const selectedBackend = this.resolveBackend(options.backendType);

    // Select best available delegatee agent for the capability
    const delegateeAgent = await this.selectDelegatee(capability);

    // Create delegation contract
    const contract = await this.contractManager.createContract({
      contract_id: contractId,
      delegator: this.delegatorAgent,
      delegatee: delegateeAgent,
      task_id: taskId,
      task_description: taskDescription,
      verification_policy: 'automated_test',
      success_criteria: {
        quality_threshold: 0.85,
        required_checks: ['typecheck', 'lint', 'test'],
      },
      timeout_ms: options.maxExecutionTimeMs ?? resources.maxExecutionTimeMs,
    });

    // Build container config
    const containerConfig: AgentContainerConfig = {
      image: options.image ?? this.defaultImage,
      repo,
      taskId,
      taskDescription,
      contractId: contract.contract_id,
      githubToken: this.githubToken,
      issueNumber: issueNumber,
      dryRun: options.dryRun,
      taskScriptB64: options.taskScriptB64,
      resourceLimits: {
        maxMemory: resources.maxMemory,
        maxCpus: resources.maxCpus,
        maxExecutionTimeMs: options.maxExecutionTimeMs ?? resources.maxExecutionTimeMs,
      },
    };

    // Provision container
    const handle = await selectedBackend.provision(containerConfig);

    // Link contract to container
    this.contractManager.dispatchToContainer(contract.contract_id, {
      containerId: handle.containerId,
      containerName: handle.containerName,
      startedAt: handle.startedAt.toISOString(),
      backendType: handle.backendType,
    });

    const record: DispatchRecord = {
      contractId: contract.contract_id,
      taskId,
      containerHandle: handle,
      dispatchedAt: new Date().toISOString(),
      issueNumber,
      repo,
    };

    this._dispatches.set(contract.contract_id, record);

    // Auto-cleanup when container exits
    this.watchContainer(contract, handle, selectedBackend);

    this.emit('dispatched', record);
    return record;
  }

  /** Watch container exit and reconcile contract state. */
  private watchContainer(
    contract: DelegationContract,
    handle: ContainerHandle,
    backend: ContainerExecutionBackend,
  ): void {
    backend.waitForExit(handle).then((result) => {
      this._dispatches.delete(contract.contract_id);
      const newStatus = result.success ? 'completed' : 'failed';
      const existing = this.contractManager.getContractById(contract.contract_id);
      const existingMetadata = existing?.metadata ?? {};

      this.contractManager.updateContract({
        contract_id: contract.contract_id,
        status: newStatus,
        metadata: {
          ...existingMetadata,
          container_exit_code: result.exitCode,
          container_execution_time_ms: result.executionTimeMs,
          pull_request_url: result.pullRequestUrl,
          timed_out: result.timedOut,
        },
      } as Parameters<typeof this.contractManager.updateContract>[0]).catch(() => { /* best-effort */ });

      this.emit(result.success ? 'dispatch_completed' : 'dispatch_failed', {
        contractId: contract.contract_id,
        result,
      });
    }).catch(() => {
      // Container watch failed — mark as failed
      this._dispatches.delete(contract.contract_id);
      const existing = this.contractManager.getContractById(contract.contract_id);
      const existingMetadata = existing?.metadata ?? {};
      this.contractManager.updateContract({
        contract_id: contract.contract_id,
        status: 'failed',
        metadata: {
          ...existingMetadata,
          container_watch_error: true,
        },
      } as Parameters<typeof this.contractManager.updateContract>[0]).catch(() => { /* best-effort */ });

      this.emit('dispatch_failed', {
        contractId: contract.contract_id,
        result: { success: false, exitCode: -1 },
      });
    });
  }

  /** Resolve per-dispatch backend override, falling back to constructor backend. */
  private resolveBackend(overrideType?: ContainerBackendType): ContainerExecutionBackend {
    if (!overrideType) return this.backend;
    return this.backendsByType[overrideType] ?? this.backend;
  }

  /** Select the best delegatee for a given capability. */
  private async selectDelegatee(capability: string): Promise<DelegationAgent> {
    if (this.capabilityRegistry) {
      try {
        const agents = await (this.capabilityRegistry as CapabilityRegistryLike)
          .getAgentsForCapability?.(capability);
        if (agents && agents.length > 0) {
          return {
            agent_id: agents[0].agentName,
            agent_name: agents[0].agentName,
          };
        }
      } catch {
        // Fall through to default
      }
    }

    // Default: map capability to a known workspace agent
    const capabilityToAgent: Record<string, string> = {
      code_review:         'security-engineer',
      code_generation:     'fullstack-developer',
      test_generation:     'test-engineer',
      security_analysis:   'security-engineer',
      performance_analysis:'performance-profiler',
      documentation:       'documentation-expert',
      api_development:     'fullstack-developer',
      ui_development:      'frontend-developer',
    };

    const agentName = capabilityToAgent[capability] ?? 'fullstack-developer';
    return { agent_id: agentName, agent_name: agentName };
  }

  /** Detect the best capability from issue labels, then fall back to keywords. */
  private detectCapability(labels: string[], text: string): string {
    for (const label of labels) {
      const cap = LABEL_TO_CAPABILITY[label.toLowerCase()];
      if (cap) return cap;
    }
    return this.detectCapabilityFromText(text);
  }

  /** Keyword-based capability detection from free text. */
  private detectCapabilityFromText(text: string): string {
    for (const [pattern, cap] of KEYWORD_TO_CAPABILITY) {
      if (pattern.test(text)) return cap;
    }
    return 'code_generation'; // safe default
  }

  /** Estimate a resource tier based on keywords in the task text. */
  private estimateResourceTier(text: string): ResourceTier {
    const lower = text.toLowerCase();
    if (/\brefactor all\b|\bmigrat\b|\blarge\b|\bcomp(lex|rehensive)\b/.test(lower)) return 'large';
    if (/\bmultiple\b|\bseveral\b|\bcross.pack(age)?\b|\bmedium\b/.test(lower)) return 'medium';
    return 'small';
  }

  /** Format a task description for the agent entrypoint. */
  private buildTaskDescription(issue: IssueDispatchInput): string {
    const labels = issue.labels?.length ? `Labels: ${issue.labels.join(', ')}\n` : '';
    return `Issue #${issue.issueNumber}: ${issue.title}\n${labels}\n${issue.body ?? ''}`.trim();
  }
}

// Minimal structural type for optional CapabilityRegistry usage
interface CapabilityRegistryLike {
  getAgentsForCapability?: (capability: string) => Promise<Array<{ agentName: string }>>;
}
