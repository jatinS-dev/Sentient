import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

type SlackSetupConfig = {
  clientId: string;
  redirectUrl: string;
  botScopes: string;
  appUIBaseURL: string;
  hasClientSecret: boolean;
  hasSigningSecret: boolean;
  updatedAt?: string;
  suggestedWebhookUrl?: string;
};

type SlackSetupStatus = {
  readyForConnect: boolean;
  missingFields: string[];
  connected: boolean;
  workspace?: string;
};

type SlackIntegrationSummary = {
  provider: string;
  name: string;
  status: string;
  detail: string;
  connectedAt?: string;
};

type SlackChannelItem = {
  id: string;
  name: string;
  isPrivate: boolean;
  isArchived: boolean;
  isMember: boolean;
  numMembers?: number;
  selected: boolean;
};

type SlackSignalItem = {
  id: string;
  title: string;
  summary: string;
  occurredAt: string;
  channelName?: string;
  channelID?: string;
};

@Component({
  selector: 'app-slack-integration',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './slack-integration.component.html',
  styleUrls: ['./slack-integration.component.css']
})
export class SlackIntegrationComponent implements OnInit {
  isLoading = true;
  saveBusy = false;
  validateBusy = false;
  actionBusy = false;
  channelsBusy = false;
  saveChannelsBusy = false;
  importBusy = false;
  signalsBusy = false;

  setupForm = {
    clientId: '',
    clientSecret: '',
    signingSecret: ''
  };

  autoConfig = {
    redirectUrl: '',
    webhookUrl: '',
    botScopes: ''
  };

  setupMeta = {
    hasClientSecret: false,
    hasSigningSecret: false,
    updatedAt: '',
    suggestedWebhookUrl: ''
  };

  setupStatus: SlackSetupStatus = {
    readyForConnect: false,
    missingFields: [],
    connected: false
  };

  integration: SlackIntegrationSummary = {
    provider: 'slack',
    name: 'Slack',
    status: 'Disconnected',
    detail: 'Connect for real-time alerts'
  };

  notice = {
    type: 'info' as 'success' | 'error' | 'info',
    text: ''
  };
  channels: SlackChannelItem[] = [];
  channelFilter = '';
  signals: SlackSignalItem[] = [];

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) { }

  async ngOnInit() {
    this.handleCallbackQuery();
    await this.refreshAll();
  }

  async refreshAll() {
    this.isLoading = true;
    await Promise.all([this.loadSetup(), this.loadIntegration()]);
    if (this.integration.status === 'Connected') {
      await Promise.all([this.loadChannels(), this.loadSignals()]);
    } else {
      this.channels = [];
      this.signals = [];
    }
    this.isLoading = false;
  }

  async saveSetup() {
    if (this.saveBusy) return;
    this.saveBusy = true;
    try {
      const response = await fetch('/api/integrations/slack/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: this.setupForm.clientId.trim(),
          clientSecret: this.setupForm.clientSecret.trim(),
          signingSecret: this.setupForm.signingSecret.trim()
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `Save setup failed (${response.status})`);
      }

      this.applySetupResponse(data);
      this.setupForm.clientSecret = '';
      this.setupForm.signingSecret = '';
      this.setNotice('success', 'Slack setup saved');
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Failed to save Slack setup';
      this.setNotice('error', message);
    } finally {
      this.saveBusy = false;
    }
  }

  async validateSetup() {
    if (this.validateBusy) return;
    this.validateBusy = true;
    try {
      const response = await fetch('/api/integrations/slack/setup/validate', {
        method: 'POST'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `Validate setup failed (${response.status})`);
      }

      this.setupStatus.readyForConnect = !!data?.readyForConnect;
      this.setupStatus.missingFields = Array.isArray(data?.missingFields) ? data.missingFields : [];
      this.setNotice(this.setupStatus.readyForConnect ? 'success' : 'info', data?.message || 'Validation complete');
      await this.loadIntegration();
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Failed to validate Slack setup';
      this.setNotice('error', message);
    } finally {
      this.validateBusy = false;
    }
  }

  async connectSlack(fullAccess = true) {
    if (this.actionBusy) return;

    const ready = await this.prepareSetupForAuthorization();
    if (!ready) {
      const missing = this.missingFieldsFriendly || 'Client ID, Client Secret, Signing Secret';
      this.setNotice('info', `Complete setup first. Missing: ${missing}`);
      return;
    }

    this.actionBusy = true;
    try {
      const endpoint = fullAccess
        ? '/api/integrations/slack/connect-url?access=full'
        : '/api/integrations/slack/connect-url';
      const response = await fetch(endpoint, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `Connect failed (${response.status})`);
      }
      if (!data?.url) {
        throw new Error('Connect URL missing in response');
      }
      window.location.href = data.url;
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Unable to start Slack connect flow';
      this.setNotice('error', message);
      this.actionBusy = false;
    }
  }

  private async prepareSetupForAuthorization(): Promise<boolean> {
    if (this.setupStatus.readyForConnect) return true;
    if (!this.hasSetupInputForAutoSave()) return false;

    await this.saveSetup();
    await this.validateSetup();
    return this.setupStatus.readyForConnect;
  }

  private hasSetupInputForAutoSave(): boolean {
    const hasClientID = this.setupForm.clientId.trim().length > 0;
    const hasClientSecret = this.setupForm.clientSecret.trim().length > 0 || this.setupMeta.hasClientSecret;
    const hasSigningSecret = this.setupForm.signingSecret.trim().length > 0 || this.setupMeta.hasSigningSecret;
    return hasClientID && hasClientSecret && hasSigningSecret;
  }

  async disconnectSlack() {
    if (this.actionBusy) return;
    this.actionBusy = true;
    try {
      const response = await fetch('/api/integrations/slack/disconnect', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `Disconnect failed (${response.status})`);
      }
      await this.refreshAll();
      this.setNotice('info', 'Slack disconnected');
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Failed to disconnect Slack';
      this.setNotice('error', message);
    } finally {
      this.actionBusy = false;
    }
  }

  async loadChannels() {
    if (this.channelsBusy) return;
    if (this.integration.status !== 'Connected') return;

    this.channelsBusy = true;
    try {
      const response = await fetch('/api/integrations/slack/channels');
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `Load channels failed (${response.status})`);
      }

      this.channels = Array.isArray(data?.channels) ? data.channels : [];
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Unable to load Slack channels';
      this.setNotice('error', message);
    } finally {
      this.channelsBusy = false;
    }
  }

  async saveChannelSelection() {
    if (this.saveChannelsBusy) return;
    this.saveChannelsBusy = true;
    try {
      const selectedIDs = this.channels.filter(ch => ch.selected).map(ch => ch.id);
      const response = await fetch('/api/integrations/slack/channels', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelIds: selectedIDs })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `Save channel selection failed (${response.status})`);
      }
      this.setNotice('success', `Saved ${selectedIDs.length} selected channel(s)`);
      await this.loadChannels();
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Failed to save channel selection';
      this.setNotice('error', message);
    } finally {
      this.saveChannelsBusy = false;
    }
  }

  async importSelectedChannels() {
    if (this.importBusy) return;
    this.importBusy = true;
    try {
      const selectedIDs = this.channels.filter(ch => ch.selected).map(ch => ch.id);
      const response = await fetch('/api/integrations/slack/channels/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelIds: selectedIDs })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `Import failed (${response.status})`);
      }

      const imported = Number(data?.importedSignals || 0);
      const errors = Array.isArray(data?.errors) ? data.errors.length : 0;
      if (errors > 0) {
        this.setNotice('info', `Imported ${imported} messages with ${errors} warning(s).`);
      } else {
        this.setNotice('success', `Imported ${imported} messages from selected channels.`);
      }
      await this.loadSignals();
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Failed to import channel data';
      this.setNotice('error', message);
    } finally {
      this.importBusy = false;
    }
  }

  toggleAllChannels(selectAll: boolean) {
    this.channels = this.channels.map(ch => ({ ...ch, selected: selectAll }));
  }

  async loadSignals() {
    if (this.signalsBusy) return;
    this.signalsBusy = true;
    try {
      const response = await fetch('/api/signals?source=Slack&limit=50');
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `Load signals failed (${response.status})`);
      }

      const incoming = Array.isArray(data?.signals) ? data.signals : [];
      this.signals = incoming.map((signal: any) => ({
        id: String(signal?.id || ''),
        title: String(signal?.title || 'Slack activity'),
        summary: String(signal?.summary || ''),
        occurredAt: String(signal?.occurredAt || ''),
        channelName: String(signal?.meta?.channelName || ''),
        channelID: String(signal?.meta?.channel || '')
      }));
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Unable to load Slack signals';
      this.setNotice('error', message);
    } finally {
      this.signalsBusy = false;
    }
  }

  async copyValue(value: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      this.setNotice('success', 'Copied to clipboard');
    } catch (error) {
      console.error(error);
      this.setNotice('error', 'Clipboard copy failed');
    }
  }

  async copySlackConfigBundle() {
    const value = [
      `OAuth Redirect URL: ${this.autoConfig.redirectUrl}`,
      `Event Request URL: ${this.webhookUrl}`,
      `Bot Scopes: ${this.autoConfig.botScopes}`
    ].join('\n');
    await this.copyValue(value);
  }

  fieldLabel(field: string): string {
    if (field === 'clientId') return 'Client ID';
    if (field === 'clientSecret') return 'Client Secret';
    if (field === 'signingSecret') return 'Signing Secret';
    return field;
  }

  get missingFieldsFriendly(): string {
    return this.setupStatus.missingFields.map(field => this.fieldLabel(field)).join(', ');
  }

  get selectedChannelsCount(): number {
    return this.channels.filter(ch => ch.selected).length;
  }

  get filteredChannels(): SlackChannelItem[] {
    const query = this.channelFilter.trim().toLowerCase();
    if (!query) return this.channels;
    return this.channels.filter(ch => ch.name.toLowerCase().includes(query));
  }

  get authorizeButtonLabel(): string {
    if (this.actionBusy) return 'Redirecting...';
    if (this.integration.status === 'Connected') return 'Re-authorize In Slack';
    return 'Authorize In Slack';
  }

  get webhookUrl(): string {
    return this.setupMeta.suggestedWebhookUrl || this.autoConfig.webhookUrl || '';
  }

  formatSignalTime(iso: string): string {
    const trimmed = iso.trim();
    if (!trimmed) return 'Unknown time';
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return trimmed;
    return parsed.toLocaleString();
  }

  private async loadSetup() {
    try {
      const response = await fetch('/api/integrations/slack/setup');
      if (!response.ok) {
        throw new Error(`Load setup failed (${response.status})`);
      }
      const data = await response.json();
      this.applySetupResponse(data);
    } catch (error) {
      console.error(error);
      this.setNotice('error', 'Unable to load Slack setup');
    }
  }

  private async loadIntegration() {
    try {
      const response = await fetch('/api/integrations');
      if (!response.ok) {
        throw new Error(`Load integrations failed (${response.status})`);
      }
      const data = await response.json();
      const integrations = Array.isArray(data?.integrations) ? data.integrations : [];
      const slack = integrations.find((item: any) =>
        String(item?.provider || item?.name || '').toLowerCase() === 'slack'
      );
      if (slack) {
        this.integration = {
          provider: slack.provider || 'slack',
          name: slack.name || 'Slack',
          status: slack.status || 'Disconnected',
          detail: slack.detail || '',
          connectedAt: slack.connectedAt || ''
        };
      }
    } catch (error) {
      console.error(error);
      this.setNotice('error', 'Unable to load integration status');
    }
  }

  private applySetupResponse(data: any) {
    const config: SlackSetupConfig = data?.config || {
      clientId: '',
      redirectUrl: '',
      botScopes: '',
      appUIBaseURL: '',
      hasClientSecret: false,
      hasSigningSecret: false
    };
    const status: SlackSetupStatus = data?.status || {
      readyForConnect: false,
      missingFields: [],
      connected: false
    };

    this.setupForm.clientId = config.clientId || '';
    this.autoConfig.redirectUrl = config.redirectUrl || '';
    this.autoConfig.botScopes = config.botScopes || '';

    this.setupMeta.hasClientSecret = !!config.hasClientSecret;
    this.setupMeta.hasSigningSecret = !!config.hasSigningSecret;
    this.setupMeta.updatedAt = config.updatedAt || '';
    this.setupMeta.suggestedWebhookUrl = config.suggestedWebhookUrl || '';
    this.autoConfig.webhookUrl = config.suggestedWebhookUrl || '';

    this.setupStatus.readyForConnect = !!status.readyForConnect;
    this.setupStatus.missingFields = Array.isArray(status.missingFields) ? status.missingFields : [];
    this.setupStatus.connected = !!status.connected;
    this.setupStatus.workspace = status.workspace || '';
  }

  private setNotice(type: 'success' | 'error' | 'info', text: string) {
    this.notice = { type, text };
  }

  private handleCallbackQuery() {
    const params = this.route.snapshot.queryParamMap;
    const integration = params.get('integration');
    const status = params.get('status');
    const message = params.get('message');

    if (integration === 'slack' && status) {
      if (status === 'connected') {
        this.setNotice('success', message || 'Slack connected');
      } else if (status === 'error') {
        this.setNotice('error', message || 'Slack connection failed');
      } else {
        this.setNotice('info', message || 'Slack callback received');
      }

      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {
          integration: null,
          status: null,
          message: null
        },
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    }
  }
}
