/**
 * DCYFR Messaging Gateway
 * TLP:AMBER - Internal Use Only
 *
 * Provides a platform-agnostic messaging interface for autonomous agents.
 * Features:
 *   - Platform adapter pattern (Telegram, Slack, Discord, HTTP, CLI)
 *   - Input sanitization (prompt injection detection, Unicode direction override blocking)
 *   - Trust-level assignment based on platform and user authentication
 *   - Outbound message formatting with platform-specific rendering
 *   - Telemetry integration (message.received, message.sent, message.blocked)
 *   - Rate limiting per user/platform
 *
 * @module gateway/message-gateway
 * @version 1.0.0
 * @date 2026-03-01
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Supported platforms */
export type GatewayPlatform = 'telegram' | 'slack' | 'discord' | 'http' | 'cli' | string;

/** Trust level assigned to inbound messages */
export type GatewayTrustLevel = 'full' | 'sandboxed' | 'readonly';

/**
 * Inbound message from a platform
 */
export interface InboundMessage {
  /** Unique message ID (from platform or auto-generated) */
  id: string;
  /** Platform the message originates from */
  platform: GatewayPlatform;
  /** User ID on the platform */
  userId: string;
  /** User display name (if available) */
  userName?: string;
  /** Chat/channel ID */
  chatId: string;
  /** Raw message text */
  text: string;
  /** Timestamp */
  timestamp: Date;
  /** Platform-specific raw payload */
  rawPayload?: unknown;
  /** Attachments (file URLs, images, etc.) */
  attachments?: MessageAttachment[];
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Message attachment
 */
export interface MessageAttachment {
  /** Attachment type */
  type: 'image' | 'file' | 'audio' | 'video' | 'document';
  /** URL or base64 data */
  url: string;
  /** MIME type */
  mimeType?: string;
  /** File name */
  fileName?: string;
  /** Size in bytes */
  sizeBytes?: number;
}

/**
 * Processed inbound message — after sanitization and enrichment
 */
export interface ProcessedMessage {
  /** Original inbound message */
  original: InboundMessage;
  /** Sanitized text (safe to pass to LLM) */
  sanitizedText: string;
  /** Assigned trust level */
  trustLevel: GatewayTrustLevel;
  /** Session ID (created or resumed) */
  sessionId?: string;
  /** Whether the message was flagged by sanitization */
  flagged: boolean;
  /** Sanitization warnings (if any) */
  warnings: string[];
  /** Processing timestamp */
  processedAt: Date;
}

/**
 * Outbound message to send to a platform
 */
export interface OutboundMessage {
  /** Platform to send to */
  platform: GatewayPlatform;
  /** Chat/channel ID */
  chatId: string;
  /** Message text (Markdown) */
  text: string;
  /** Reply to message ID (if applicable) */
  replyToId?: string;
  /** Parse mode */
  parseMode?: 'markdown' | 'html' | 'plain';
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result of sending an outbound message
 */
export interface SendResult {
  /** Whether the send was successful */
  success: boolean;
  /** Platform-assigned message ID */
  messageId?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Platform adapter interface — implement for each messaging platform
 */
export interface PlatformAdapter {
  /** Platform name */
  readonly platform: GatewayPlatform;

  /** Send a message to the platform */
  send(message: OutboundMessage): Promise<SendResult>;

  /** Format text for the platform's rendering engine */
  formatText(markdown: string): string;

  /** Platform-specific message validation */
  validate(message: InboundMessage): boolean;
}

/**
 * Trust assignment rule — maps platform/user criteria to trust levels
 */
export interface TrustRule {
  /** Rule name */
  name: string;
  /** Platform filter (null = all platforms) */
  platform?: GatewayPlatform;
  /** User IDs that match this rule */
  userIds?: string[];
  /** Trust level to assign */
  trustLevel: GatewayTrustLevel;
  /** Priority (higher = checked first) */
  priority: number;
}

/**
 * Sanitization result
 */
export interface SanitizationResult {
  /** Sanitized text */
  text: string;
  /** Whether any issues were found */
  flagged: boolean;
  /** Warning messages */
  warnings: string[];
  /** Whether the message was blocked entirely */
  blocked: boolean;
  /** Block reason (if blocked) */
  blockReason?: string;
}

/**
 * Rate limit window entry
 */
interface RateLimitEntry {
  timestamps: number[];
}

/**
 * Gateway telemetry event
 */
export interface GatewayTelemetryEvent {
  type: 'message.received' | 'message.sent' | 'message.blocked' |
    'message.sanitized' | 'message.rate_limited';
  data: Record<string, unknown>;
  timestamp: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Input Sanitization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Prompt injection patterns to detect and block
 */
const INJECTION_PATTERNS: Array<{ name: string; pattern: RegExp; severity: 'block' | 'warn' }> = [
  {
    name: 'ignore_instructions',
    pattern: /ignore\s+(all\s+)?previous\s+(instructions|constraints|rules)/i,
    severity: 'block',
  },
  {
    name: 'system_override',
    pattern: /\[SYSTEM[^\]]*\]|\[OVERRIDE\]|\[ADMIN\]|\[ROOT\]/i,
    severity: 'block',
  },
  {
    name: 'jailbreak_phrase',
    pattern: /DAN mode|jailbreak|developer mode enabled/i,
    severity: 'block',
  },
  {
    name: 'role_injection',
    pattern: /you are now|from now on you|act as if you are|pretend to be/i,
    severity: 'warn',
  },
  {
    name: 'base64_override',
    pattern: /base64[:\s]+(ignore|override|system|admin)/i,
    severity: 'block',
  },
];

/**
 * Unicode direction override characters to strip
 */
const UNICODE_DIRECTION_OVERRIDES = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

/**
 * Sanitize inbound message text
 */
export function sanitizeInput(text: string): SanitizationResult {
  const warnings: string[] = [];
  let sanitized = text;
  let flagged = false;
  let blocked = false;
  let blockReason: string | undefined;

  // 1. Strip Unicode direction overrides
  if (UNICODE_DIRECTION_OVERRIDES.test(sanitized)) {
    sanitized = sanitized.replace(UNICODE_DIRECTION_OVERRIDES, '');
    warnings.push('Unicode direction override characters removed');
    flagged = true;
  }

  // 2. Check for prompt injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.pattern.test(sanitized)) {
      flagged = true;
      if (pattern.severity === 'block') {
        blocked = true;
        blockReason = `Prompt injection detected: ${pattern.name}`;
        break;
      }
      warnings.push(`Suspicious pattern: ${pattern.name}`);
    }
  }

  // 3. Trim excessive whitespace
  sanitized = sanitized.replace(/\n{4,}/g, '\n\n\n');

  // 4. Length limit (32K characters)
  if (sanitized.length > 32_768) {
    sanitized = sanitized.slice(0, 32_768);
    warnings.push('Message truncated to 32K characters');
    flagged = true;
  }

  return { text: sanitized, flagged, warnings, blocked, blockReason };
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform Adapters
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Telegram Platform Adapter
 *
 * Formats messages for Telegram's MarkdownV2 syntax.
 * In a real implementation, this would use the Telegram Bot API.
 */
export class TelegramAdapter implements PlatformAdapter {
  readonly platform: GatewayPlatform = 'telegram';
  private readonly sendFn?: (message: OutboundMessage) => Promise<SendResult>;

  constructor(options?: { sendFn?: (message: OutboundMessage) => Promise<SendResult> }) {
    this.sendFn = options?.sendFn;
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    if (this.sendFn) {
      return this.sendFn(message);
    }
    // Default: log and return success (for testing/local dev)
    return { success: true, messageId: `tg-${randomUUID().slice(0, 8)}` };
  }

  formatText(markdown: string): string {
    // Telegram MarkdownV2: escape special chars
    return markdown
      .replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
  }

  validate(message: InboundMessage): boolean {
    return !!message.text && message.text.length > 0 && message.text.length <= 4096;
  }
}

/**
 * CLI Platform Adapter — for local development and testing
 */
export class CLIAdapter implements PlatformAdapter {
  readonly platform: GatewayPlatform = 'cli';
  readonly messages: OutboundMessage[] = [];

  async send(message: OutboundMessage): Promise<SendResult> {
    this.messages.push(message);
    return { success: true, messageId: `cli-${randomUUID().slice(0, 8)}` };
  }

  formatText(markdown: string): string {
    // CLI: strip markdown formatting
    return markdown
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`(.*?)`/g, '$1');
  }

  validate(_message: InboundMessage): boolean {
    return true;
  }
}

/**
 * HTTP Webhook Platform Adapter — for generic HTTP integrations
 */
export class HTTPAdapter implements PlatformAdapter {
  readonly platform: GatewayPlatform = 'http';
  private readonly sendFn?: (message: OutboundMessage) => Promise<SendResult>;

  constructor(options?: { sendFn?: (message: OutboundMessage) => Promise<SendResult> }) {
    this.sendFn = options?.sendFn;
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    if (this.sendFn) {
      return this.sendFn(message);
    }
    return { success: true, messageId: `http-${randomUUID().slice(0, 8)}` };
  }

  formatText(markdown: string): string {
    return markdown; // HTTP: pass through as-is
  }

  validate(message: InboundMessage): boolean {
    return !!message.text && message.text.length > 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MessageGateway
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for MessageGateway
 */
export interface MessageGatewayConfig {
  /** Platform adapters */
  adapters?: PlatformAdapter[];
  /** Trust assignment rules (sorted by priority) */
  trustRules?: TrustRule[];
  /** Default trust level for unmatched messages */
  defaultTrustLevel?: GatewayTrustLevel;
  /** Rate limit: max messages per user per window */
  rateLimitMaxMessages?: number;
  /** Rate limit: window size in ms */
  rateLimitWindowMs?: number;
}

/**
 * Message Gateway
 *
 * Platform-agnostic messaging interface for autonomous agents.
 * Handles inbound message reception and sanitization, trust-level assignment,
 * outbound message sending, and telemetry.
 *
 * Emits:
 *   - `message.received` — Inbound message processed
 *   - `message.sent` — Outbound message sent successfully
 *   - `message.blocked` — Message blocked by sanitization
 *   - `message.sanitized` — Message had sanitization warnings
 *   - `message.rate_limited` — Message rate-limited
 */
export class MessageGateway extends EventEmitter {
  private readonly adapters = new Map<GatewayPlatform, PlatformAdapter>();
  private readonly trustRules: TrustRule[];
  private readonly defaultTrustLevel: GatewayTrustLevel;
  private readonly rateLimitMaxMessages: number;
  private readonly rateLimitWindowMs: number;
  private readonly rateLimits = new Map<string, RateLimitEntry>();

  constructor(config: MessageGatewayConfig = {}) {
    super();
    this.trustRules = (config.trustRules ?? []).sort((a, b) => b.priority - a.priority);
    this.defaultTrustLevel = config.defaultTrustLevel ?? 'sandboxed';
    this.rateLimitMaxMessages = config.rateLimitMaxMessages ?? 30;
    this.rateLimitWindowMs = config.rateLimitWindowMs ?? 60_000;

    // Register adapters
    for (const adapter of config.adapters ?? []) {
      this.adapters.set(adapter.platform, adapter);
    }
  }

  // ─────────────── Adapter Management ───────────────

  /**
   * Register a platform adapter
   */
  registerAdapter(adapter: PlatformAdapter): void {
    this.adapters.set(adapter.platform, adapter);
  }

  /**
   * Get a registered adapter
   */
  getAdapter(platform: GatewayPlatform): PlatformAdapter | undefined {
    return this.adapters.get(platform);
  }

  /**
   * List all registered platform names
   */
  getPlatforms(): GatewayPlatform[] {
    return Array.from(this.adapters.keys());
  }

  // ─────────────── Inbound Processing ───────────────

  /**
   * Process an inbound message:
   * 1. Validate via platform adapter
   * 2. Check rate limits
   * 3. Sanitize input
   * 4. Assign trust level
   * 5. Return processed message
   *
   * @throws Error if platform adapter is not registered
   */
  async processInbound(message: InboundMessage): Promise<ProcessedMessage> {
    const adapter = this.adapters.get(message.platform);

    // Validate via adapter (if registered)
    if (adapter && !adapter.validate(message)) {
      const blocked: ProcessedMessage = {
        original: message,
        sanitizedText: '',
        trustLevel: 'readonly',
        flagged: true,
        warnings: ['Platform validation failed'],
        processedAt: new Date(),
      };
      this.emit('message.blocked', this._telemetryEvent('message.blocked', {
        platform: message.platform,
        userId: message.userId,
        reason: 'platform_validation_failed',
      }));
      return blocked;
    }

    // Rate limit check
    if (this._isRateLimited(message.userId, message.platform)) {
      const limited: ProcessedMessage = {
        original: message,
        sanitizedText: '',
        trustLevel: 'readonly',
        flagged: true,
        warnings: ['Rate limit exceeded'],
        processedAt: new Date(),
      };
      this.emit('message.rate_limited', this._telemetryEvent('message.rate_limited', {
        platform: message.platform,
        userId: message.userId,
      }));
      return limited;
    }

    // Sanitize
    const sanitized = sanitizeInput(message.text);

    if (sanitized.blocked) {
      const blocked: ProcessedMessage = {
        original: message,
        sanitizedText: '',
        trustLevel: 'readonly',
        flagged: true,
        warnings: [sanitized.blockReason ?? 'Message blocked by sanitization'],
        processedAt: new Date(),
      };
      this.emit('message.blocked', this._telemetryEvent('message.blocked', {
        platform: message.platform,
        userId: message.userId,
        reason: sanitized.blockReason,
      }));
      return blocked;
    }

    // Assign trust level
    const trustLevel = this._assignTrustLevel(message);

    const processed: ProcessedMessage = {
      original: message,
      sanitizedText: sanitized.text,
      trustLevel,
      flagged: sanitized.flagged,
      warnings: sanitized.warnings,
      processedAt: new Date(),
    };

    // Emit events
    if (sanitized.flagged) {
      this.emit('message.sanitized', this._telemetryEvent('message.sanitized', {
        platform: message.platform,
        userId: message.userId,
        warnings: sanitized.warnings,
      }));
    }

    this.emit('message.received', this._telemetryEvent('message.received', {
      platform: message.platform,
      userId: message.userId,
      trustLevel,
      flagged: sanitized.flagged,
    }));

    return processed;
  }

  // ─────────────── Outbound Sending ───────────────

  /**
   * Send a message to a platform
   *
   * @throws Error if platform adapter is not registered
   */
  async send(message: OutboundMessage): Promise<SendResult> {
    const adapter = this.adapters.get(message.platform);
    if (!adapter) {
      return {
        success: false,
        error: `No adapter registered for platform: ${message.platform}`,
      };
    }

    // Format text for the platform
    const formatted = {
      ...message,
      text: adapter.formatText(message.text),
    };

    const result = await adapter.send(formatted);

    if (result.success) {
      this.emit('message.sent', this._telemetryEvent('message.sent', {
        platform: message.platform,
        chatId: message.chatId,
        messageId: result.messageId,
      }));
    }

    return result;
  }

  /**
   * Send a reply to a specific message
   */
  async reply(
    originalMessage: InboundMessage,
    text: string,
    parseMode: 'markdown' | 'html' | 'plain' = 'markdown',
  ): Promise<SendResult> {
    return this.send({
      platform: originalMessage.platform,
      chatId: originalMessage.chatId,
      text,
      replyToId: originalMessage.id,
      parseMode,
    });
  }

  // ─────────────── Trust Level Assignment ───────────────

  /**
   * Add a trust rule
   */
  addTrustRule(rule: TrustRule): void {
    this.trustRules.push(rule);
    this.trustRules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Assign trust level based on rules
   */
  private _assignTrustLevel(message: InboundMessage): GatewayTrustLevel {
    for (const rule of this.trustRules) {
      // Platform filter
      if (rule.platform && rule.platform !== message.platform) continue;
      // User filter
      if (rule.userIds && !rule.userIds.includes(message.userId)) continue;
      // All filters passed — use this rule's trust level
      return rule.trustLevel;
    }
    return this.defaultTrustLevel;
  }

  // ─────────────── Rate Limiting ───────────────

  /**
   * Check if a user is rate-limited
   */
  private _isRateLimited(userId: string, platform: GatewayPlatform): boolean {
    const key = `${platform}:${userId}`;
    const now = Date.now();
    const cutoff = now - this.rateLimitWindowMs;

    const entry = this.rateLimits.get(key);
    if (!entry) {
      this.rateLimits.set(key, { timestamps: [now] });
      return false;
    }

    // Clean old timestamps
    entry.timestamps = entry.timestamps.filter(t => t > cutoff);

    if (entry.timestamps.length >= this.rateLimitMaxMessages) {
      return true;
    }

    entry.timestamps.push(now);
    return false;
  }

  // ─────────────── Telemetry Helpers ───────────────

  private _telemetryEvent(
    type: GatewayTelemetryEvent['type'],
    data: Record<string, unknown>,
  ): GatewayTelemetryEvent {
    return { type, data, timestamp: new Date() };
  }

  // ─────────────── Cleanup ───────────────

  /**
   * Clear rate limit state
   */
  clearRateLimits(): void {
    this.rateLimits.clear();
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.rateLimits.clear();
    this.adapters.clear();
    this.removeAllListeners();
  }
}
