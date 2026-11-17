/**
 * All integration plugins. Add new ones here (see ./types.ts for the contract).
 */
import type { IntegrationPlugin } from "./types";
import { googleCalendarPlugin } from "./google/calendar";
import { gmailPlugin } from "./google/gmail";
import { telegramPlugin, whatsappPlugin } from "./messaging";
import { notionPlugin } from "./notion";

export const integrations: IntegrationPlugin[] = [googleCalendarPlugin, gmailPlugin, telegramPlugin, whatsappPlugin, notionPlugin];

export const integrationById = (id: string) => integrations.find((i) => i.id === id);
