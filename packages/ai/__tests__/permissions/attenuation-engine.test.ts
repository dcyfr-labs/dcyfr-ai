/**
 * Tests for Permission Attenuation Engine
 * TLP:AMBER - Internal Use Only
 * 
 * @module __tests__/permissions/attenuation-engine.test.ts
 * @version 1.0.0
 * @date 2026-02-13
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PermissionAttenuationEngine } from '../../permissions/attenuation-engine';
import type {
  PermissionToken,
  AttenuatePermissionRequest,
} from '../../types/permission-tokens';

describe('PermissionAttenuationEngine', () => {
  let engine: PermissionAttenuationEngine;
  let parentToken: PermissionToken;
  
  beforeEach(() => {
    engine = new PermissionAttenuationEngine({ debug: false });
    
    // Create a standard parent token for testing
    parentToken = {
      token_id: 'parent-token-1',
      version: '1.0.0',
      status: 'active',
      holder: 'agent-parent',
      issuer: 'agent-root',
      scopes: ['workspace.read', 'workspace.write'],
      actions: ['read', 'write', 'execute'],
      resource_types: ['file', 'directory', 'code'],
      resources: ['/src/**', '/docs/**'],
      resource_patterns: ['**/*.ts', '**/*.md'],
      delegatable: true,
      max_delegation_depth: 5,
      delegation_depth: 0,
      grant: {
        granted_by: 'agent-root',
        granted_at: '2026-02-13T10:00:00Z',
        reason: 'Root token grant',
      },
      created_at: '2026-02-13T10:00:00Z',
    };
  });
  
  describe('basic attenuation', () => {
    it('should create attenuated child token with reduced scopes', async () => {
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: ['workspace.read.code'], // More specific than parent
        reason: 'Read-only code access',
      };
      
      const childToken = await engine.attenuate(parentToken, request);
      
      expect(childToken.holder).toBe('agent-child');
      expect(childToken.issuer).toBe('agent-parent');
      expect(childToken.scopes).toEqual(['workspace.read.code']);
      expect(childToken.delegation_depth).toBe(1);
      expect(childToken.parent_token_id).toBe(parentToken.token_id);
      expect(childToken.status).toBe('active');
    });
    
    it('should create child token with reduced actions', async () => {
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
        actions: ['read'], // Subset of parent actions
      };
      
      const childToken = await engine.attenuate(parentToken, request);
      
      expect(childToken.actions).toEqual(['read']);
    });
    
    it('should create child token with specific resources', async () => {
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
        resources: ['/src/utils/**'], // Subset of parent resources
      };
      
      const childToken = await engine.attenuate(parentToken, request);
      
      expect(childToken.resources).toEqual(['/src/utils/**']);
    });
    
    it('should inherit parent expiration when not specified', async () => {
      parentToken.expires_at = '2026-12-31T23:59:59Z';
      
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: ['workspace.read'],
      };
      
      const childToken = await engine.attenuate(parentToken, request);
      
      expect(childToken.expires_at).toBe(parentToken.expires_at);
    });
  });
  
  describe('scope attenuation validation', () => {
    it('should accept more specific scopes', async () => {
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: ['workspace.read.code.src'], // More specific
      };
      
      const childToken = await engine.attenuate(parentToken, request);
      
      expect(childToken.scopes).toEqual(['workspace.read.code.src']);
    });
    
    it('should accept exact scope match', async () => {
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: ['workspace.read'], // Exact match
      };
      
      const childToken = await engine.attenuate(parentToken, request);
      
      expect(childToken.scopes).toEqual(['workspace.read']);
    });
    
    it('should reject less specific scopes', async () => {
      parentToken.scopes = ['workspace.read.code'];
      
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: ['workspace.read'], // Less specific (broader)
      };
      
      await expect(engine.attenuate(parentToken, request)).rejects.toThrow(
        /Scope 'workspace.read' is not covered by parent scopes/
      );
    });
    
    it('should reject unrelated scopes', async () => {
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: ['project.admin'], // Completely different
      };
      
      await expect(engine.attenuate(parentToken, request)).rejects.toThrow(
        /Scope 'project.admin' is not covered by parent scopes/
      );
    });
    
    it('should support wildcard scopes', async () => {
      parentToken.scopes = ['workspace.*'];
      
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: ['workspace.read', 'workspace.write'],
      };
      
      const childToken = await engine.attenuate(parentToken, request);
      
      expect(childToken.scopes).toEqual(['workspace.read', 'workspace.write']);
    });
    
    it('should reject empty scopes', async () => {
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: [],
      };
      
      await expect(engine.attenuate(parentToken, request)).rejects.toThrow(
        /Child scopes cannot be empty/
      );
    });
  });
  
  describe('action attenuation validation', () => {
    it('should accept subset of actions', async () => {
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
        actions: ['read', 'execute'], // Subset
      };
      
      const childToken = await engine.attenuate(parentToken, request);
      
      expect(childToken.actions).toEqual(['read', 'execute']);
    });
    
    it('should accept read when parent has write (implied)', async () => {
      parentToken.actions = ['write'];
      
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
        actions: ['read'], // Implied by write
      };
      
      const childToken = await engine.attenuate(parentToken, request);
      
      expect(childToken.actions).toEqual(['read']);
    });
    
    it('should accept all actions when parent has manage', async () => {
      parentToken.actions = ['manage'];
      
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
        actions: ['read', 'write', 'execute'], // All implied by manage
      };
      
      const childToken = await engine.attenuate(parentToken, request);
      
      expect(childToken.actions).toEqual(['read', 'write', 'execute']);
    });
    
    it('should reject actions not in parent', async () => {
      parentToken.actions = ['read'];
      
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
        actions: ['write'], // Not in parent
      };
      
      await expect(engine.attenuate(parentToken, request)).rejects.toThrow(
        /Action 'write' not permitted by parent actions/
      );
    });
    
    it('should reject delegate action without explicit parent permission', async () => {
      parentToken.actions = ['manage'];
      
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
        actions: ['delegate'], // Requires explicit grant
      };
      
      await expect(engine.attenuate(parentToken, request)).rejects.toThrow(
        /Action 'delegate' not permitted/
      );
    });
    
    it('should reject empty actions', async () => {
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
        actions: [],
      };
      
      await expect(engine.attenuate(parentToken, request)).rejects.toThrow(
        /Child actions cannot be empty/
      );
    });
  });
  
  describe('resource attenuation validation', () => {
    it('should accept resources matching parent resources', async () => {
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
        resources: ['/src/**'], // In parent resources
      };
      
      const childToken = await engine.attenuate(parentToken, request);
      
      expect(childToken.resources).toEqual(['/src/**']);
    });
    
    it('should accept resources matching parent patterns', async () => {
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
        resources: ['/src/utils.ts'], // Matches **/*.ts pattern
      };
      
      const childToken = await engine.attenuate(parentToken, request);
      
      expect(childToken.resources).toEqual(['/src/utils.ts']);
    });
    
    it('should reject resources not covered by parent', async () => {
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
        resources: ['/config/secrets.json'], // Not in parent
      };
      
      await expect(engine.attenuate(parentToken, request)).rejects.toThrow(
        /Resource '\/config\/secrets.json' not covered/
      );
    });
    
    it('should inherit parent resources when not specified', async () => {
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
      };
      
      const childToken = await engine.attenuate(parentToken, request);
      
      expect(childToken.resources).toEqual(parentToken.resources);
    });
    
    it('should allow any resources when parent has no restrictions', async () => {
      parentToken.resources = undefined;
      parentToken.resource_patterns = undefined;
      
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
        resources: ['/anything/goes.txt'],
      };
      
      const childToken = await engine.attenuate(parentToken, request);
      
      expect(childToken.resources).toEqual(['/anything/goes.txt']);
    });
  });
  
  describe('constraint attenuation validation', () => {
    it('should accept additional count constraint (more restrictive)', async () => {
      parentToken.constraints = [
        {
          type: 'count',
          parameters: { max_uses: 100 },
          description: 'Max 100 uses',
        },
      ];
      
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
        additional_constraints: [
          {
            type: 'count',
            parameters: { max_uses: 50 }, // More restrictive
            description: 'Max 50 uses',
          },
        ],
      };
      
      const childToken = await engine.attenuate(parentToken, request);
      
      expect(childToken.constraints).toHaveLength(2);
      expect(childToken.constraints?.[1].parameters).toEqual({ max_uses: 50 });
    });
    
    it('should accept additional time constraint', async () => {
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
        additional_constraints: [
          {
            type: 'time',
            parameters: {
              end_time: '2026-06-01T00:00:00Z',
            },
          },
        ],
      };
      
      const childToken = await engine.attenuate(parentToken, request);
      
      expect(childToken.constraints).toHaveLength(1);
      expect(childToken.constraints?.[0].type).toBe('time');
    });
    
    it('should reject less restrictive count constraint', async () => {
      parentToken.constraints = [
        {
          type: 'count',
          parameters: { max_uses: 50 },
        },
      ];
      
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
        additional_constraints: [
          {
            type: 'count',
            parameters: { max_uses: 100 }, // Less restrictive
          },
        ],
      };
      
      await expect(engine.attenuate(parentToken, request)).rejects.toThrow(
        /less restrictive than parent constraint/
      );
    });
    
    it('should reject less restrictive rate constraint', async () => {
      parentToken.constraints = [
        {
          type: 'rate',
          parameters: { max_operations: 10, window_ms: 1000 },
        },
      ];
      
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
        additional_constraints: [
          {
            type: 'rate',
            parameters: { max_operations: 20, window_ms: 1000 }, // Less restrictive
          },
        ],
      };
      
      await expect(engine.attenuate(parentToken, request)).rejects.toThrow(
        /less restrictive than parent constraint/
      );
    });
  });
  
  describe('delegation depth enforcement', () => {
    it('should increment delegation depth', async () => {
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
      };
      
      const childToken = await engine.attenuate(parentToken, request);
      
      expect(childToken.delegation_depth).toBe(parentToken.delegation_depth + 1);
    });
    
    it('should reject attenuation at max delegation depth', async () => {
      parentToken.delegation_depth = 5;
      parentToken.max_delegation_depth = 5;
      
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
      };
      
      await expect(engine.attenuate(parentToken, request)).rejects.toThrow(
        /Maximum delegation depth 5 reached/
      );
    });
    
    it('should allow attenuation one level before max depth', async () => {
      parentToken.delegation_depth = 4;
      parentToken.max_delegation_depth = 5;
      
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
      };
      
      const childToken = await engine.attenuate(parentToken, request);
      
      expect(childToken.delegation_depth).toBe(5);
    });
  });
  
  describe('expiration validation', () => {
    it('should accept child expiration before parent', async () => {
      parentToken.expires_at = '2026-12-31T23:59:59Z';
      
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
        expires_at: '2026-06-30T23:59:59Z', // Before parent
      };
      
      const childToken = await engine.attenuate(parentToken, request);
      
      expect(childToken.expires_at).toBe('2026-06-30T23:59:59Z');
    });
    
    it('should reject child expiration after parent', async () => {
      parentToken.expires_at = '2026-06-30T23:59:59Z';
      
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
        expires_at: '2026-12-31T23:59:59Z', // After parent
      };
      
      await expect(engine.attenuate(parentToken, request)).rejects.toThrow(
        /Child expiration .* exceeds parent expiration/
      );
    });
    
    it('should allow child without expiration when parent has none', async () => {
      parentToken.expires_at = undefined;
      
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
        expires_at: '2026-12-31T23:59:59Z',
      };
      
      const childToken = await engine.attenuate(parentToken, request);
      
      expect(childToken.expires_at).toBe('2026-12-31T23:59:59Z');
    });
  });
  
  describe('parent token validation', () => {
    it('should reject attenuation of expired token', async () => {
      parentToken.status = 'expired';
      
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
      };
      
      await expect(engine.attenuate(parentToken, request)).rejects.toThrow(
        /Cannot attenuate expired token/
      );
    });
    
    it('should reject attenuation of revoked token', async () => {
      parentToken.status = 'revoked';
      
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
      };
      
      await expect(engine.attenuate(parentToken, request)).rejects.toThrow(
        /Cannot attenuate revoked token/
      );
    });
    
    it('should reject attenuation of non-delegatable token', async () => {
      parentToken.delegatable = false;
      
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
      };
      
      await expect(engine.attenuate(parentToken, request)).rejects.toThrow(
        /Token is not delegatable/
      );
    });
    
    it('should reject attenuation of token past expiration time', async () => {
      parentToken.expires_at = '2020-01-01T00:00:00Z'; // Past
      
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
      };
      
      await expect(engine.attenuate(parentToken, request)).rejects.toThrow(
        /Token has expired/
      );
    });
    
    it('should reject attenuation of exhausted token', async () => {
      parentToken.constraints = [
        {
          type: 'count',
          parameters: { max_uses: 10, current_uses: 10 },
        },
      ];
      
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
      };
      
      await expect(engine.attenuate(parentToken, request)).rejects.toThrow(
        /Token usage limit exhausted/
      );
    });
  });
  
  describe('hierarchy validation', () => {
    it('should validate correct 3-level hierarchy', () => {
      const rootToken: PermissionToken = {
        ...parentToken,
        token_id: 'root',
        delegation_depth: 0,
      };
      
      const level1Token: PermissionToken = {
        ...parentToken,
        token_id: 'level1',
        parent_token_id: 'root',
        delegation_depth: 1,
      };
      
      const level2Token: PermissionToken = {
        ...parentToken,
        token_id: 'level2',
        parent_token_id: 'level1',
        delegation_depth: 2,
      };
      
      const result = engine.validateHierarchy([rootToken, level1Token, level2Token]);
      
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
    
    it('should detect parent-child ID mismatch', () => {
      const rootToken: PermissionToken = {
        ...parentToken,
        token_id: 'root',
        delegation_depth: 0,
      };
      
      const level1Token: PermissionToken = {
        ...parentToken,
        token_id: 'level1',
        parent_token_id: 'wrong-parent', // Mismatch
        delegation_depth: 1,
      };
      
      const result = engine.validateHierarchy([rootToken, level1Token]);
      
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].error).toContain('parent_token_id mismatch');
    });
    
    it('should detect invalid delegation depth increment', () => {
      const rootToken: PermissionToken = {
        ...parentToken,
        token_id: 'root',
        delegation_depth: 0,
      };
      
      const level1Token: PermissionToken = {
        ...parentToken,
        token_id: 'level1',
        parent_token_id: 'root',
        delegation_depth: 3, // Skips levels
      };
      
      const result = engine.validateHierarchy([rootToken, level1Token]);
      
      expect(result.valid).toBe(false);
      expect(result.violations[0].error).toContain('Invalid delegation depth');
    });
    
    it('should detect scope violations in hierarchy', () => {
      const rootToken: PermissionToken = {
        ...parentToken,
        token_id: 'root',
        scopes: ['workspace.read.code'],
        delegation_depth: 0,
      };
      
      const level1Token: PermissionToken = {
        ...parentToken,
        token_id: 'level1',
        parent_token_id: 'root',
        scopes: ['workspace.read'], // Less specific (invalid)
        delegation_depth: 1,
      };
      
      const result = engine.validateHierarchy([rootToken, level1Token]);
      
      expect(result.valid).toBe(false);
      expect(result.violations[0].error).toContain('Scope violation');
    });
  });
  
  describe('effective permissions calculation', () => {
    it('should calculate effective scopes from hierarchy', () => {
      const rootToken: PermissionToken = {
        ...parentToken,
        scopes: ['workspace.*'],
      };
      
      const childToken: PermissionToken = {
        ...parentToken,
        scopes: ['workspace.read', 'workspace.write'],
      };
      
      const effective = engine.calculateEffectivePermissions(childToken, [rootToken]);
      
      expect(effective.effectiveScopes).toEqual(['workspace.read', 'workspace.write']);
    });
    
    it('should intersect actions from hierarchy', () => {
      const rootToken: PermissionToken = {
        ...parentToken,
        actions: ['read', 'write'],
      };
      
      const childToken: PermissionToken = {
        ...parentToken,
        actions: ['read', 'write', 'execute'], // Has extra
      };
      
      const effective = engine.calculateEffectivePermissions(childToken, [rootToken]);
      
      // Should only include actions parent allows
      expect(effective.effectiveActions).toEqual(['read', 'write']);
    });
    
    it('should keep most restrictive count constraint', () => {
      const rootToken: PermissionToken = {
        ...parentToken,
        constraints: [
          {
            type: 'count',
            parameters: { max_uses: 100 },
          },
        ],
      };
      
      const childToken: PermissionToken = {
        ...parentToken,
        constraints: [
          {
            type: 'count',
            parameters: { max_uses: 50 },
          },
        ],
      };
      
      const effective = engine.calculateEffectivePermissions(childToken, [rootToken]);
      
      // Should keep child's 50 (more restrictive)
      expect(effective.effectiveConstraints).toHaveLength(1);
      expect((effective.effectiveConstraints[0].parameters as { max_uses: number }).max_uses).toBe(
        50
      );
    });
  });
  
  describe('edge cases', () => {
    it('should handle delegatable=false in request', async () => {
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
        delegatable: false,
      };
      
      const childToken = await engine.attenuate(parentToken, request);
      
      expect(childToken.delegatable).toBe(false);
    });
    
    it('should default delegatable to false when not specified', async () => {
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
      };
      
      const childToken = await engine.attenuate(parentToken, request);
      
      expect(childToken.delegatable).toBe(false);
    });
    
    it('should include grant metadata in child token', async () => {
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: parentToken.scopes,
        reason: 'Temporary task access',
        metadata: { task_id: 'task-123' },
      };
      
      const childToken = await engine.attenuate(parentToken, request);
      
      expect(childToken.grant.reason).toBe('Temporary task access');
      expect(childToken.metadata).toEqual({ task_id: 'task-123' });
    });
    
    it('should handle validation with warnings', async () => {
      parentToken.scopes = ['a', 'b', 'c', 'd', 'e', 'f'];
      
      const request: AttenuatePermissionRequest = {
        parent_token_id: parentToken.token_id,
        new_holder: 'agent-child',
        scopes: ['a'], // Significant reduction
      };
      
      // Should succeed but with warnings
      const childToken = await engine.attenuate(parentToken, request);
      
      expect(childToken.scopes).toEqual(['a']);
    });
  });
});
