/**
 * DCYFR Permission Attenuation Engine
 * TLP:AMBER - Internal Use Only
 * 
 * Implements hierarchical permission token attenuation with least-privilege enforcement.
 * Ensures delegated permissions are always a proper subset of parent permissions.
 * 
 * @module permissions/attenuation-engine
 * @version 1.0.0
 * @date 2026-02-13
 */

import { randomUUID } from 'crypto';
import type {
  PermissionToken,
  AttenuatePermissionRequest,
  PermissionScope,
  PermissionAction,
  PermissionConstraint,
  PermissionTokenStatus,
} from '../types/permission-tokens';

/**
 * Attenuation validation result
 */
export interface AttenuationValidationResult {
  /** Whether attenuation is valid */
  valid: boolean;
  
  /** Validation errors */
  errors: string[];
  
  /** Validation warnings */
  warnings: string[];
  
  /** Detailed validation results per field */
  field_validations: {
    scopes: boolean;
    actions: boolean;
    resources: boolean;
    constraints: boolean;
    delegation_depth: boolean;
    expiration: boolean;
  };
}

/**
 * Permission Attenuation Engine
 * 
 * Enforces least-privilege principle by ensuring delegated permissions
 * are always strictly reduced from parent permissions.
 */
export class PermissionAttenuationEngine {
  private debugMode: boolean;
  
  constructor(options: { debug?: boolean } = {}) {
    this.debugMode = options.debug ?? false;
  }
  
  /**
   * Attenuate a permission token to create a child token with reduced permissions
   * 
   * @param parentToken - The parent token to attenuate
   * @param request - Attenuation request parameters
   * @returns Attenuated child token
   * @throws Error if attenuation violates least-privilege constraints
   */
  async attenuate(
    parentToken: PermissionToken,
    request: AttenuatePermissionRequest
  ): Promise<PermissionToken> {
    this.log(`Attenuating token ${parentToken.token_id} for ${request.new_holder}`);
    
    // Validate parent token is active and delegatable
    this.validateParentToken(parentToken);
    
    // Validate attenuation request
    const validation = this.validateAttenuation(parentToken, request);
    
    if (!validation.valid) {
      throw new Error(`Attenuation validation failed: ${validation.errors.join(', ')}`);
    }
    
    // Log warnings
    validation.warnings.forEach(warning => this.log(`Warning: ${warning}`));
    
    // Create attenuated child token
    const childToken = this.createChildToken(parentToken, request);
    
    this.log(`Created child token ${childToken.token_id} with depth ${childToken.delegation_depth}`);
    
    return childToken;
  }
  
  /**
   * Validate parent token is suitable for attenuation
   */
  private validateParentToken(token: PermissionToken): void {
    if (token.status !== 'active') {
      throw new Error(`Cannot attenuate ${token.status} token`);
    }
    
    if (!token.delegatable) {
      throw new Error('Token is not delegatable');
    }
    
    if (token.delegation_depth >= token.max_delegation_depth) {
      throw new Error(`Maximum delegation depth ${token.max_delegation_depth} reached`);
    }
    
    // Check if token has expired
    if (token.expires_at && new Date(token.expires_at) < new Date()) {
      throw new Error('Token has expired');
    }
    
    // Check count constraints
    const countConstraint = token.constraints?.find(c => c.type === 'count');
    if (countConstraint) {
      const params = countConstraint.parameters as { max_uses: number; current_uses?: number };
      if (params.current_uses !== undefined && params.current_uses >= params.max_uses) {
        throw new Error('Token usage limit exhausted');
      }
    }
  }
  
  /**
   * Validate attenuation request follows least-privilege principles
   */
  validateAttenuation(
    parentToken: PermissionToken,
    request: AttenuatePermissionRequest
  ): AttenuationValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Validate scopes are subset or more specific
    const scopeValidation = this.validateScopeAttenuation(parentToken.scopes, request.scopes);
    if (!scopeValidation.valid) {
      errors.push(...scopeValidation.errors);
    }
    warnings.push(...scopeValidation.warnings);
    
    // Validate actions are subset
    const actionValidation = this.validateActionAttenuation(
      parentToken.actions,
      request.actions || parentToken.actions
    );
    if (!actionValidation.valid) {
      errors.push(...actionValidation.errors);
    }
    
    // Validate resources are subset
    const resourceValidation = this.validateResourceAttenuation(
      parentToken.resources,
      parentToken.resource_patterns,
      request.resources
    );
    if (!resourceValidation.valid) {
      errors.push(...resourceValidation.errors);
    }
    
    // Validate constraints are more restrictive
    const constraintValidation = this.validateConstraintAttenuation(
      parentToken.constraints,
      request.additional_constraints
    );
    if (!constraintValidation.valid) {
      errors.push(...constraintValidation.errors);
    }
    
    // Validate delegation depth
    const depthValid = this.validateDelegationDepth(parentToken);
    if (!depthValid) {
      errors.push(`Delegation depth limit reached (${parentToken.max_delegation_depth})`);
    }
    
    // Validate expiration
    const expirationValidation = this.validateExpiration(
      parentToken.expires_at,
      request.expires_at
    );
    if (!expirationValidation.valid) {
      errors.push(...expirationValidation.errors);
    }
    warnings.push(...expirationValidation.warnings);
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      field_validations: {
        scopes: scopeValidation.valid,
        actions: actionValidation.valid,
        resources: resourceValidation.valid,
        constraints: constraintValidation.valid,
        delegation_depth: depthValid,
        expiration: expirationValidation.valid,
      },
    };
  }
  
  /**
   * Validate scope attenuation (hierarchical)
   * 
   * Child scopes must be equal to or more specific than parent scopes.
   * Examples:
   * - "workspace.read" → "workspace.read.code" ✓
   * - "workspace.read.code" → "workspace.read" ✗
   * - "workspace.read" → "workspace.write" ✗
   */
  private validateScopeAttenuation(
    parentScopes: PermissionScope[],
    childScopes: PermissionScope[]
  ): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (childScopes.length === 0) {
      errors.push('Child scopes cannot be empty');
      return { valid: false, errors, warnings };
    }
    
    for (const childScope of childScopes) {
      // Check if child scope is covered by at least one parent scope
      const isCovered = parentScopes.some(parentScope =>
        this.isScopeAttenuation(parentScope, childScope)
      );
      
      if (!isCovered) {
        errors.push(`Scope '${childScope}' is not covered by parent scopes: ${parentScopes.join(', ')}`);
      }
    }
    
    // Warn if significantly reducing scopes
    if (childScopes.length < parentScopes.length / 2) {
      warnings.push(`Significantly reducing scopes from ${parentScopes.length} to ${childScopes.length}`);
    }
    
    return { valid: errors.length === 0, errors, warnings };
  }
  
  /**
   * Check if childScope is a valid attenuation of parentScope
   * 
   * Valid attenuations:
   * - Exact match: "workspace.read" === "workspace.read"
   * - More specific: "workspace.read.code" extends "workspace.read"
   */
  private isScopeAttenuation(parentScope: string, childScope: string): boolean {
    // Exact match is valid
    if (parentScope === childScope) {
      return true;
    }
    
    // Child must be more specific (longer hierarchical path)
    // Example: parent "workspace.read", child "workspace.read.code" ✓
    if (childScope.startsWith(parentScope + '.')) {
      return true;
    }
    
    // Wildcard support: "workspace.*" covers "workspace.read"
    if (parentScope.endsWith('.*')) {
      const baseScope = parentScope.slice(0, -2);
      return childScope.startsWith(baseScope);
    }
    
    return false;
  }
  
  /**
   * Validate action attenuation
   * 
   * Child actions must be a subset of parent actions.
   * Action hierarchy: manage > create/delete > write > read/execute
   */
  private validateActionAttenuation(
    parentActions: PermissionAction[],
    childActions: PermissionAction[]
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (childActions.length === 0) {
      errors.push('Child actions cannot be empty');
      return { valid: false, errors };
    }
    
    for (const childAction of childActions) {
      if (!parentActions.includes(childAction)) {
        // Check if parent has a higher-level action that implies this action
        const impliedByParent = this.actionImpliedBy(childAction, parentActions);
        
        if (!impliedByParent) {
          errors.push(`Action '${childAction}' not permitted by parent actions: ${parentActions.join(', ')}`);
        }
      }
    }
    
    return { valid: errors.length === 0, errors };
  }
  
  /**
   * Check if an action is implied by higher-level actions
   * 
   * Example: 'manage' implies all actions EXCEPT 'delegate'
   * 'delegate' requires explicit granting for security
   */
  private actionImpliedBy(action: PermissionAction, parentActions: PermissionAction[]): boolean {
    // 'delegate' requires explicit granting (never implied)
    if (action === 'delegate') {
      return parentActions.includes('delegate');
    }
    
    // 'manage' implies all other actions (except delegate, handled above)
    if (parentActions.includes('manage')) {
      return true;
    }
    
    // 'write' implies 'read'
    if (action === 'read' && parentActions.includes('write')) {
      return true;
    }
    
    // 'delete' implies 'write'
    if (action === 'write' && parentActions.includes('delete')) {
      return true;
    }
    
    // 'create' implies 'write'
    if (action === 'write' && parentActions.includes('create')) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Validate resource attenuation
   * 
   * Child resources must be a subset of parent resources or match patterns.
   */
  private validateResourceAttenuation(
    parentResources: string[] | undefined,
    parentPatterns: string[] | undefined,
    childResources: string[] | undefined
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // If parent has no resource restrictions, child can specify any
    if (!parentResources && !parentPatterns) {
      return { valid: true, errors };
    }
    
    // If child has no resources, it inherits parent's (valid)
    if (!childResources) {
      return { valid: true, errors };
    }
    
    // Check each child resource is covered by parent
    for (const childResource of childResources) {
      const covered =
        (parentResources && parentResources.includes(childResource)) ||
        (parentResources && this.matchesPatterns(childResource, parentResources)) ||
        (parentPatterns && this.matchesPatterns(childResource, parentPatterns));
      
      if (!covered) {
        errors.push(`Resource '${childResource}' not covered by parent resources/patterns`);
      }
    }
    
    return { valid: errors.length === 0, errors };
  }
  
  /**
   * Check if a resource matches any of the given patterns
   * 
   * Supports glob-style patterns: *, **, ?
   * Also supports hierarchical path matching (e.g., /src/** matches /src/utils/**)
   */
  private matchesPatterns(resource: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
      // Special case: /path/** should match /path/anything/nested/**
      if (pattern.endsWith('/**')) {
        const basePath = pattern.slice(0, -3);
        if (resource.startsWith(basePath + '/')) {
          return true;
        }
      }
      
      // Convert glob pattern to regex
      const regexPattern = pattern
        .replace(/\*\*/g, '.*')     // ** matches any path
        .replace(/\*/g, '[^/]*')    // * matches any non-slash
        .replace(/\?/g, '.');        // ? matches single char
      
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(resource);
    });
  }
  
  /**
   * Validate constraint attenuation
   * 
   * Additional constraints can only make permissions MORE restrictive.
   */
  private validateConstraintAttenuation(
    parentConstraints: PermissionConstraint[] | undefined,
    additionalConstraints: PermissionConstraint[] | undefined
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Additional constraints are always valid (they only restrict further)
    // However, we validate they don't contradict existing constraints
    
    if (!additionalConstraints || additionalConstraints.length === 0) {
      return { valid: true, errors };
    }
    
    // Check for contradictory constraints
    for (const newConstraint of additionalConstraints) {
      const existing = parentConstraints?.find(c => c.type === newConstraint.type);
      
      if (existing) {
        // Validate new constraint is more restrictive
        const moreRestrictive = this.isMoreRestrictive(existing, newConstraint);
        
        if (!moreRestrictive) {
          errors.push(
            `New ${newConstraint.type} constraint is less restrictive than parent constraint`
          );
        }
      }
    }
    
    return { valid: errors.length === 0, errors };
  }
  
  /**
   * Check if new constraint is more restrictive than existing
   */
  private isMoreRestrictive(
    existing: PermissionConstraint,
    newConstraint: PermissionConstraint
  ): boolean {
    switch (existing.type) {
      case 'count': {
        const existingMax = (existing.parameters as { max_uses: number }).max_uses;
        const newMax = (newConstraint.parameters as { max_uses: number }).max_uses;
        return newMax <= existingMax;
      }
      
      case 'rate': {
        const existingRate = (existing.parameters as { max_operations: number }).max_operations;
        const newRate = (newConstraint.parameters as { max_operations: number }).max_operations;
        return newRate <= existingRate;
      }
      
      case 'size': {
        const existingSize = (existing.parameters as { max_size_bytes: number }).max_size_bytes;
        const newSize = (newConstraint.parameters as { max_size_bytes: number }).max_size_bytes;
        return newSize <= existingSize;
      }
      
      case 'time': {
        const existingEnd = (existing.parameters as { end_time?: string }).end_time;
        const newEnd = (newConstraint.parameters as { end_time?: string }).end_time;
        
        if (!existingEnd || !newEnd) {
          return true; // Can't compare, assume valid
        }
        
        return new Date(newEnd) <= new Date(existingEnd);
      }
      
      default:
        // Custom constraints - assume valid
        return true;
    }
  }
  
  /**
   * Validate delegation depth
   */
  private validateDelegationDepth(parentToken: PermissionToken): boolean {
    return parentToken.delegation_depth + 1 <= parentToken.max_delegation_depth;
  }
  
  /**
   * Validate expiration time
   */
  private validateExpiration(
    parentExpiration: string | undefined,
    childExpiration: string | undefined
  ): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // If parent has no expiration, child can set any
    if (!parentExpiration) {
      return { valid: true, errors, warnings };
    }
    
    // If child has no expiration, it inherits parent's
    if (!childExpiration) {
      return { valid: true, errors, warnings };
    }
    
    // Child expiration cannot exceed parent
    const parentDate = new Date(parentExpiration);
    const childDate = new Date(childExpiration);
    
    if (childDate > parentDate) {
      errors.push(
        `Child expiration (${childExpiration}) exceeds parent expiration (${parentExpiration})`
      );
    }
    
    // Warn if child expiration is very close to parent
    const timeDiff = parentDate.getTime() - childDate.getTime();
    if (timeDiff < 60000) { // Less than 1 minute difference
      warnings.push('Child expiration is very close to parent expiration');
    }
    
    return { valid: errors.length === 0, errors, warnings };
  }
  
  /**
   * Create child token from parent and request
   */
  private createChildToken(
    parentToken: PermissionToken,
    request: AttenuatePermissionRequest
  ): PermissionToken {
    const childTokenId = randomUUID();
    const now = new Date().toISOString();
    
    // Merge constraints: parent + additional
    const mergedConstraints = [
      ...(parentToken.constraints || []),
      ...(request.additional_constraints || []),
    ];
    
    // Merge revocation conditions
    const mergedRevocationConditions = [
      ...(parentToken.revocation_conditions || []),
      ...(request.additional_revocation_conditions || []),
    ];
    
    const childToken: PermissionToken = {
      token_id: childTokenId,
      version: '1.0.0',
      status: 'active',
      holder: request.new_holder,
      issuer: parentToken.holder, // Parent holder becomes issuer
      scopes: request.scopes,
      actions: request.actions || parentToken.actions,
      resource_types: parentToken.resource_types,
      resources: request.resources || parentToken.resources,
      resource_patterns: parentToken.resource_patterns,
      constraints: mergedConstraints.length > 0 ? mergedConstraints : undefined,
      revocation_conditions:
        mergedRevocationConditions.length > 0 ? mergedRevocationConditions : undefined,
      expires_at: request.expires_at || parentToken.expires_at,
      delegatable: request.delegatable ?? false, // Default to non-delegatable for safety
      max_delegation_depth: parentToken.max_delegation_depth,
      delegation_depth: parentToken.delegation_depth + 1,
      parent_token_id: parentToken.token_id,
      grant: {
        granted_by: parentToken.holder,
        granted_at: now,
        reason: request.reason,
        authorization_source: parentToken.token_id,
      },
      metadata: request.metadata,
      created_at: now,
    };
    
    return childToken;
  }
  
  /**
   * Check if a permission hierarchy is valid (all tokens properly attenuated)
   * 
   * @param tokens - Array of tokens from root to leaf
   * @returns Validation result with any violations
   */
  validateHierarchy(tokens: PermissionToken[]): {
    valid: boolean;
    violations: Array<{ tokenIndex: number; error: string }>;
  } {
    const violations: Array<{ tokenIndex: number; error: string }> = [];
    
    for (let i = 1; i < tokens.length; i++) {
      const parent = tokens[i - 1];
      const child = tokens[i];
      
      // Verify parent-child relationship
      if (child.parent_token_id !== parent.token_id) {
        violations.push({
          tokenIndex: i,
          error: `Token ${child.token_id} parent_token_id mismatch`,
        });
      }
      
      // Verify delegation depth increases
      if (child.delegation_depth !== parent.delegation_depth + 1) {
        violations.push({
          tokenIndex: i,
          error: `Invalid delegation depth: parent=${parent.delegation_depth}, child=${child.delegation_depth}`,
        });
      }
      
      // Verify scopes are properly attenuated
      const scopeValidation = this.validateScopeAttenuation(parent.scopes, child.scopes);
      if (!scopeValidation.valid) {
        violations.push({
          tokenIndex: i,
          error: `Scope violation: ${scopeValidation.errors.join(', ')}`,
        });
      }
    }
    
    return {
      valid: violations.length === 0,
      violations,
    };
  }
  
  /**
   * Calculate effective permissions for a token (considering all parent constraints)
   * 
   * @param token - Token to analyze
   * @param parentTokens - Array of parent tokens (from root to immediate parent)
   * @returns Effective permissions merging all hierarchical constraints
   */
  calculateEffectivePermissions(
    token: PermissionToken,
    parentTokens: PermissionToken[]
  ): {
    effectiveScopes: PermissionScope[];
    effectiveActions: PermissionAction[];
    effectiveResources: string[];
    effectiveConstraints: PermissionConstraint[];
  } {
    // Start with token's own permissions
    let effectiveScopes = [...token.scopes];
    let effectiveActions = [...token.actions];
    let effectiveResources = [...(token.resources || [])];
    const effectiveConstraints = [...(token.constraints || [])];
    
    // Apply each parent's restrictions
    for (const parent of parentTokens) {
      // Intersect scopes (keep only scopes covered by parent)
      effectiveScopes = effectiveScopes.filter(childScope =>
        parent.scopes.some(parentScope => this.isScopeAttenuation(parentScope, childScope))
      );
      
      // Intersect actions
      effectiveActions = effectiveActions.filter(
        action => parent.actions.includes(action) || this.actionImpliedBy(action, parent.actions)
      );
      
      // Intersect resources
      if (parent.resources && parent.resources.length > 0) {
        effectiveResources = effectiveResources.filter(
          resource =>
            parent.resources!.includes(resource) ||
            (parent.resource_patterns &&
              this.matchesPatterns(resource, parent.resource_patterns))
        );
      }
      
      // Merge constraints (most restrictive wins)
      for (const parentConstraint of parent.constraints || []) {
        const existingIndex = effectiveConstraints.findIndex(
          c => c.type === parentConstraint.type
        );
        
        if (existingIndex >= 0) {
          // Keep more restrictive constraint
          if (!this.isMoreRestrictive(parentConstraint, effectiveConstraints[existingIndex])) {
            effectiveConstraints[existingIndex] = parentConstraint;
          }
        } else {
          effectiveConstraints.push(parentConstraint);
        }
      }
    }
    
    return {
      effectiveScopes,
      effectiveActions,
      effectiveResources,
      effectiveConstraints,
    };
  }
  
  /**
   * Log debug messages
   */
  private log(message: string): void {
    if (this.debugMode) {
      console.log(`[AttenuationEngine] ${message}`);
    }
  }
}
