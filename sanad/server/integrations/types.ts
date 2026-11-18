/**
 * Integration plugin contract. To add a new integration, create a folder/file
 * exporting an IntegrationPlugin and register it in ./registry.ts — its tools
 * are automatically offered to the agents listed on each tool, its routes are
 * mounted under /api/integrations, and it shows up on the Settings page.
 */
import type { Router } from "express";
import type { ToolDef } from "../tools/types";

export interface IntegrationStatus {
  configured: boolean; // required secrets are present
  connected: boolean; // a live check against the provider passed
  detail?: string;
  account?: string;
}

export interface IntegrationPlugin {
  id: string;
  name: string;
  description: string;
  category: "calendar" | "email" | "messaging" | "documents";
  requiredSecrets: string[];
  status(): Promise<IntegrationStatus>;
  /** browser URL that starts an OAuth flow */
  connectUrl?: string;
  /** server-side connect (e.g. register a webhook) */
  connect?(baseUrl: string): Promise<{ ok: boolean; detail: string }>;
  disconnect?(): Promise<void>;
  tools: ToolDef[];
  /** webhook/OAuth routes, mounted at /api/integrations */
  routes?(router: Router): void;
  /** routes that must be reachable without a login (webhooks) */
  publicRoutes?(router: Router): void;
}
