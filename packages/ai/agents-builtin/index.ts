/**
 * Built-in Public Agents
 *
 * Generic, reusable agents included with @dcyfr/ai.
 * These agents can be used standalone or extended for project-specific needs.
 *
 * @module @dcyfr/ai/agents-builtin
 */

import type { Agent } from '../agents/types';

// Development agents
export { fullstackDeveloper, frontendDeveloper, backendArchitect, typescriptPro } from './development';

// Testing agents
export { testEngineer, debugger } from './testing';

// Security agents
export { securityEngineer } from './security';

// Architecture agents
export { architectureReviewer, databaseArchitect, cloudArchitect } from './architecture';

// Performance agents
export { performanceProfiler } from './performance';

// DevOps agents
export { devopsEngineer } from './devops';

// Data agents
export { dataScientist } from './data';

// Content agents
export { technicalWriter } from './content';

// Research agents
export { researchOrchestrator } from './research';

/**
 * All built-in agents as an array for bulk loading
 */
export const builtinAgents: Agent[] = [];

// Lazy load all agents to avoid circular dependencies
export async function loadBuiltinAgents(): Promise<Agent[]> {
  const [
    { fullstackDeveloper, frontendDeveloper, backendArchitect, typescriptPro },
    { testEngineer, debugger: debugger_ },
    { securityEngineer },
    { architectureReviewer, databaseArchitect, cloudArchitect },
    { performanceProfiler },
    { devopsEngineer },
    { dataScientist },
    { technicalWriter },
    { researchOrchestrator },
  ] = await Promise.all([
    import('./development'),
    import('./testing'),
    import('./security'),
    import('./architecture'),
    import('./performance'),
    import('./devops'),
    import('./data'),
    import('./content'),
    import('./research'),
  ]);

  return [
    fullstackDeveloper,
    frontendDeveloper,
    backendArchitect,
    typescriptPro,
    testEngineer,
    debugger_,
    securityEngineer,
    architectureReviewer,
    databaseArchitect,
    cloudArchitect,
    performanceProfiler,
    devopsEngineer,
    dataScientist,
    technicalWriter,
    researchOrchestrator,
  ];
}

/**
 * Agent registry by name for quick lookup
 */
export const builtinAgentsByName: Record<string, () => Promise<Agent>> = {
  // Development
  'fullstack-developer': async () => (await import('./development')).fullstackDeveloper,
  'frontend-developer': async () => (await import('./development')).frontendDeveloper,
  'backend-architect': async () => (await import('./development')).backendArchitect,
  'typescript-pro': async () => (await import('./development')).typescriptPro,
  // Testing
  'test-engineer': async () => (await import('./testing')).testEngineer,
  'debugger': async () => (await import('./testing')).debugger,
  // Security
  'security-engineer': async () => (await import('./security')).securityEngineer,
  // Architecture
  'architecture-reviewer': async () => (await import('./architecture')).architectureReviewer,
  'database-architect': async () => (await import('./architecture')).databaseArchitect,
  'cloud-architect': async () => (await import('./architecture')).cloudArchitect,
  // Performance
  'performance-profiler': async () => (await import('./performance')).performanceProfiler,
  // DevOps
  'devops-engineer': async () => (await import('./devops')).devopsEngineer,
  // Data
  'data-scientist': async () => (await import('./data')).dataScientist,
  // Content
  'technical-writer': async () => (await import('./content')).technicalWriter,
  // Research
  'research-orchestrator': async () => (await import('./research')).researchOrchestrator,
};

/**
 * Get a built-in agent by name
 */
export async function getBuiltinAgent(name: string): Promise<Agent | undefined> {
  const loader = builtinAgentsByName[name];
  if (loader) {
    return loader();
  }
  return undefined;
}

/**
 * List all available built-in agent names
 */
export function listBuiltinAgents(): string[] {
  return Object.keys(builtinAgentsByName);
}
