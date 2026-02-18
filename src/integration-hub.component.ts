import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';

type IntegrationSummary = {
  provider: string;
  name: string;
  status: string;
  detail: string;
  connectedAt?: string;
};

type BackendIntegrationSummary = {
  provider: string;
  name: string;
  status: string;
  detail: string;
  connectedAt?: string;
};

const FALLBACK_INTEGRATIONS: IntegrationSummary[] = [
  { name: 'Salesforce', status: 'Connected', detail: '1,247 opportunities synced', provider: 'salesforce' },
  { name: 'Slack', status: 'Disconnected', detail: 'Connect for real-time alerts', provider: 'slack' },
  { name: 'Intercom', status: 'Connected', detail: '12,489 conversations indexed', provider: 'intercom' },
  { name: 'Gong', status: 'Connected', detail: '2,847 calls analyzed', provider: 'gong' },
  { name: 'GitHub', status: 'Connected', detail: '14 repos, 892 PRs tracked', provider: 'github' },
  { name: 'Jira', status: 'Connected', detail: '6 projects, 1,247 issues synced', provider: 'jira' },
  { name: 'Stripe', status: 'Connected', detail: 'Revenue metrics live', provider: 'stripe' },
  { name: 'Notion', status: 'Connected', detail: 'Product docs + wikis', provider: 'notion' },
  { name: 'Microsoft Teams', status: 'Disconnected', detail: 'Connect for real-time alerts', provider: 'microsoft-teams' },
  { name: 'Zoom', status: 'Disconnected', detail: 'Import call transcripts', provider: 'zoom' }
];

@Component({
  selector: 'app-integration-hub',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './integration-hub.component.html',
  styleUrls: ['./integration-hub.component.css']
})
export class IntegrationHubComponent implements OnInit {
  loading = true;
  error = '';
  integrations: IntegrationSummary[] = FALLBACK_INTEGRATIONS.map(item => ({ ...item }));

  async ngOnInit() {
    await this.refreshIntegrations();
  }

  get connectedCount(): number {
    return this.integrations.filter(item => item.status === 'Connected').length;
  }

  get disconnectedCount(): number {
    return this.integrations.filter(item => item.status !== 'Connected').length;
  }

  async refreshIntegrations() {
    this.loading = true;
    this.error = '';
    try {
      const response = await fetch('/api/integrations');
      if (!response.ok) {
        throw new Error(`integrations request failed: ${response.status}`);
      }
      const data = await response.json();
      const summaries: BackendIntegrationSummary[] = Array.isArray(data?.integrations)
        ? data.integrations
        : [];
      summaries.forEach(summary => this.applyBackendIntegrationSummary(summary));
    } catch (error) {
      console.error('failed to refresh integrations:', error);
      this.error = 'Unable to sync live statuses right now. Showing last known integration data.';
    } finally {
      this.loading = false;
    }
  }

  isSlackIntegration(integration: IntegrationSummary): boolean {
    return (integration.provider || integration.name).toLowerCase() === 'slack';
  }

  statusTone(status: string): 'connected' | 'disabled' | 'disconnected' {
    const normalized = status.trim().toLowerCase();
    if (normalized === 'connected') return 'connected';
    if (normalized === 'disabled') return 'disabled';
    return 'disconnected';
  }

  formatConnectedAt(value: string | undefined): string {
    const text = (value || '').trim();
    if (!text) return '';
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return text;
    return parsed.toLocaleString();
  }

  trackByProvider(_index: number, item: IntegrationSummary): string {
    return item.provider || item.name;
  }

  private applyBackendIntegrationSummary(summary: BackendIntegrationSummary) {
    const provider = (summary.provider || summary.name || '').toLowerCase();
    const index = this.integrations.findIndex(item =>
      (item.provider || item.name).toLowerCase() === provider
      || item.name.toLowerCase() === summary.name.toLowerCase()
    );

    if (index < 0) {
      this.integrations.push({
        name: summary.name,
        provider: summary.provider || provider,
        status: summary.status,
        detail: summary.detail,
        connectedAt: summary.connectedAt
      });
      return;
    }

    this.integrations[index] = {
      ...this.integrations[index],
      status: summary.status,
      detail: summary.detail,
      connectedAt: summary.connectedAt || this.integrations[index].connectedAt,
      provider: summary.provider || this.integrations[index].provider
    };
  }
}
