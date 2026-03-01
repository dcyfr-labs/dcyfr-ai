/**
 * Gateway Module
 * @module gateway
 */

export {
  MessageGateway,
  TelegramAdapter,
  CLIAdapter,
  HTTPAdapter,
  sanitizeInput,
  type GatewayPlatform,
  type GatewayTrustLevel,
  type InboundMessage,
  type MessageAttachment,
  type ProcessedMessage,
  type OutboundMessage,
  type SendResult,
  type PlatformAdapter,
  type TrustRule,
  type SanitizationResult,
  type GatewayTelemetryEvent,
  type MessageGatewayConfig,
} from './message-gateway.js';
