import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

type DecisionRunSummary = {
  id: string;
  feature_name: string;
  status: 'queued' | 'running' | 'failed' | 'completed' | 'needs_user_action';
  current_step?: string | null;
  created_at?: string;
  updated_at?: string;
};

type Artifact = {
  id?: string;
  type: string;
  json: any;
  created_at?: string;
};

type DecisionRunDetail = {
  id: string;
  workspace_id: string;
  feature_name: string;
  status: DecisionRunSummary['status'];
  current_step?: string | null;
  error?: string | null;
  artifacts: Artifact[];
  created_at?: string;
  updated_at?: string;
};

@Component({
  selector: 'app-decision-operator',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './decision-operator.component.html',
  styleUrls: ['./decision-operator.component.css']
})
export class DecisionOperatorComponent implements OnInit, OnDestroy {
  featureName = 'Dark Mode';
  runs: DecisionRunSummary[] = [];
  selectedRun: DecisionRunDetail | null = null;

  operatorHealth = 'unknown';
  notice = '';
  error = '';

  loadingRuns = false;
  creatingRun = false;
  importingSlack = false;
  connectingJira = false;

  jiraBaseUrl = 'https://your-org.atlassian.net';
  jiraSessionCookie = '';

  private pollHandle: any = null;

  async ngOnInit() {
    await Promise.all([this.refreshRuns(), this.checkOperatorHealth()]);
    this.pollHandle = setInterval(async () => {
      await this.refreshRuns();
      if (this.selectedRun?.id) {
        await this.loadRun(this.selectedRun.id, false);
      }
    }, 3000);
  }

  ngOnDestroy() {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  async checkOperatorHealth() {
    try {
      const response = await fetch('/api/operator/health');
      if (!response.ok) {
        throw new Error(`Health check failed (${response.status})`);
      }
      const data = await response.json();
      this.operatorHealth = data?.status || 'ok';
    } catch (err) {
      this.operatorHealth = 'offline';
      this.error = err instanceof Error ? err.message : 'Decision Operator API is unavailable';
    }
  }

  async refreshRuns() {
    this.loadingRuns = true;
    this.error = '';
    try {
      const response = await fetch('/api/operator/decision-runs');
      if (!response.ok) {
        throw new Error(`Failed to load runs (${response.status})`);
      }
      const data = await response.json();
      this.runs = Array.isArray(data) ? data : [];
      if (this.selectedRun?.id) {
        const exists = this.runs.find(item => item.id === this.selectedRun?.id);
        if (!exists) {
          this.selectedRun = null;
        }
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Unable to load decision runs';
    } finally {
      this.loadingRuns = false;
    }
  }

  async createRun() {
    const featureName = this.featureName.trim();
    if (!featureName || this.creatingRun) {
      return;
    }

    this.creatingRun = true;
    this.notice = '';
    this.error = '';
    try {
      const response = await fetch('/api/operator/decision-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature_name: featureName })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.detail || data?.error || `Failed to start run (${response.status})`);
      }

      this.notice = 'Decision run queued.';
      await this.refreshRuns();
      if (data?.decision_run_id) {
        await this.loadRun(String(data.decision_run_id));
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to start decision run';
    } finally {
      this.creatingRun = false;
    }
  }

  async loadRun(runID: string, focus = true) {
    this.error = '';
    try {
      const response = await fetch(`/api/operator/decision-runs/${runID}`);
      if (!response.ok) {
        throw new Error(`Failed to load run ${runID} (${response.status})`);
      }
      const data = await response.json();
      this.selectedRun = data;
      if (focus) {
        this.notice = `Loaded run ${runID}`;
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load run details';
    }
  }

  async importSlackState() {
    if (this.importingSlack) return;
    this.importingSlack = true;
    this.notice = '';
    this.error = '';

    try {
      const response = await fetch('/api/operator/connections/slack/import-from-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.detail || data?.error || `Slack import failed (${response.status})`);
      }

      const teamName = data?.team_name || 'workspace';
      const channels = Number(data?.selected_channel_count || 0);
      this.notice = `Slack imported from sentient-angular (${teamName}, ${channels} channels).`;
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Slack import failed';
    } finally {
      this.importingSlack = false;
    }
  }

  async connectJira() {
    if (this.connectingJira) return;

    this.connectingJira = true;
    this.notice = '';
    this.error = '';
    try {
      const response = await fetch('/api/operator/connections/jira', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_type: 'cookie_session',
          credential_blob: {
            base_url: this.jiraBaseUrl.trim(),
            session_cookie: this.jiraSessionCookie.trim()
          }
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.detail || data?.error || `Jira connection failed (${response.status})`);
      }
      this.notice = 'Jira connection saved.';
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Jira connection failed';
    } finally {
      this.connectingJira = false;
    }
  }

  trackRun(_index: number, run: DecisionRunSummary): string {
    return run.id;
  }

  statusTone(status: string): string {
    const normalized = (status || '').toLowerCase();
    if (normalized === 'completed') return 'tone-success';
    if (normalized === 'failed' || normalized === 'needs_user_action') return 'tone-danger';
    return 'tone-info';
  }

  getArtifact(type: string): any | null {
    const artifacts = this.selectedRun?.artifacts || [];
    const artifact = artifacts.find(item => item.type === type);
    return artifact?.json || null;
  }

  get runLogs(): any[] {
    const artifacts = this.selectedRun?.artifacts || [];
    const logs = artifacts.find(item => item.type === 'run_logs');
    return Array.isArray(logs?.json) ? logs.json : [];
  }

  pretty(value: any): string {
    return JSON.stringify(value, null, 2);
  }
}
