import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ClerkUserButtonComponent } from 'ngx-clerk';

type ViewKey =
  | 'agent'
  | 'chat'
  | 'inbox'
  | 'kanban'
  | 'sprints'
  | 'automations'
  | 'integrations'
  | 'reports'
  | 'settings';

type RiskLevel = 'high' | 'medium' | 'low';
type DecisionStatus = 'draft' | 'review' | 'approved' | 'archived';
type ChatRole = 'user' | 'assistant';
type ToastType = 'success' | 'error' | 'info';
type SignalSource = 'Slack' | 'Intercom' | 'Gong' | 'Jira' | 'Notion' | 'Email';
type ToneMode = 'graphite' | 'signal';

interface DecisionOption {
  title: string;
  detail: string;
}

interface Decision {
  id: string;
  title: string;
  description: string;
  owner: string;
  confidence: number;
  impact: string;
  status: DecisionStatus;
  risk: RiskLevel;
  problem: string;
  evidence: string;
  tradeoff: string;
  options: DecisionOption[];
}

interface Signal {
  id: string;
  source: SignalSource;
  title: string;
  summary: string;
  timestamp: string;
}

interface ChatMessage {
  id: string;
  role: ChatRole;
  name: string;
  content: string;
  timestamp: string;
  citations?: string[];
}

interface ChatThread {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
  messages: ChatMessage[];
}

interface SearchResult {
  id: string;
  type: 'Decision' | 'Signal' | 'View';
  title: string;
  subtitle: string;
  targetView: ViewKey;
  targetId?: string;
}

interface KpiCard {
  id: 'active' | 'confidence' | 'time' | 'velocity';
  label: string;
  trend: string;
  direction: 'up' | 'down' | 'neutral';
}

interface TimelineEvent {
  id: string;
  title: string;
  detail: string;
  time: string;
  tone: 'success' | 'warning' | 'info';
}

interface KanbanCard {
  id: string;
  title: string;
  tag: string;
  priority: 'High' | 'Medium' | 'Low';
  assignee: string;
}

interface KanbanColumn {
  id: string;
  title: string;
  wipLimit: number;
  items: KanbanCard[];
}

interface ToggleSetting {
  title: string;
  description: string;
  enabled: boolean;
}

interface IntegrationSetting {
  name: string;
  status: 'Connected' | 'Disconnected';
  events: string;
  enabled: boolean;
}

interface WorkspaceOption {
  id: string;
  name: string;
}

type FeatureResearchStatus = 'queued' | 'running' | 'failed' | 'completed';

interface FeatureResearchProgress {
  pagesVisited: number;
  evidenceCount: number;
  themesCount: number;
}

interface FeatureResearchRun {
  runId: string;
  status: FeatureResearchStatus;
  step: string;
  progress: FeatureResearchProgress;
  error: string | null;
}

interface FeatureResearchTheme {
  label: string;
  count: number;
  confidence: number;
}

interface FeatureResearchEvidence {
  id?: string;
  source_type: string;
  source_name: string;
  url: string;
  title: string;
  snippet: string;
  query: string;
  captured_at: string;
}

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

@Component({
  selector: 'app-ui',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ClerkUserButtonComponent],
  templateUrl: './app-ui.component.html',
  styleUrls: ['./app-ui.component.css']
})
export class AppUiComponent implements OnInit, OnDestroy {
  @ViewChild('globalSearchInput') globalSearchInput?: ElementRef<HTMLInputElement>;
  @ViewChild('newDecisionModal') newDecisionModal?: ElementRef<HTMLElement>;
  @ViewChild('newDecisionTitleInput') newDecisionTitleInput?: ElementRef<HTMLInputElement>;

  isDarkMode = false;
  toneMode: ToneMode = 'graphite';
  isSidebarOpen = false;
  isSidebarHiddenDesktop = false;
  isWorkspaceMenuOpen = false;
  showNewDecisionModal = false;
  showShortcutsModal = false;

  currentView: ViewKey = 'chat';

  searchQuery = '';
  searchResults: SearchResult[] = [];
  chatThreadSearch = '';

  chatInput = '';
  chatIsLoading = false;
  chatSuggestions = [
    'Draft API rate limit decision',
    'Analyze churn risk by segment',
    'Summarize top buyer objections',
    'Create exec-ready recommendation'
  ];

  contextDraft: { source: SignalSource; title: string; summary: string } = {
    source: 'Slack',
    title: '',
    summary: ''
  };

  readonly viewOptions: { key: ViewKey; label: string; shortcut?: string; unread?: boolean }[] = [
    { key: 'agent', label: 'Agent Feature', shortcut: 'Ctrl+3' },
    { key: 'chat', label: 'Decision Chat', shortcut: 'Ctrl+1' },
    { key: 'inbox', label: 'Decision Inbox', shortcut: 'Ctrl+2', unread: true },
    { key: 'kanban', label: 'Kanban Board' },
    { key: 'sprints', label: 'Sprints' }
  ];

  readonly operationsOptions: { key: ViewKey; label: string; disconnected?: boolean }[] = [
    { key: 'automations', label: 'Automations' },
    { key: 'integrations', label: 'Integrations', disconnected: true },
    { key: 'reports', label: 'Reports' },
    { key: 'settings', label: 'Settings' }
  ];

  readonly kpiCards: KpiCard[] = [
    { id: 'active', label: 'Active Decisions', trend: '+3 this week', direction: 'up' },
    { id: 'confidence', label: 'Avg Confidence', trend: '+2.4%', direction: 'up' },
    { id: 'time', label: 'Time to Decision', trend: '-6h', direction: 'up' },
    { id: 'velocity', label: 'Signal Velocity', trend: '148/day', direction: 'neutral' }
  ];

  readonly workspaceOptions: WorkspaceOption[] = [
    { id: 'ws-labs', name: 'Sentinent Labs' },
    { id: 'ws-enterprise', name: 'Enterprise Pod' },
    { id: 'ws-research', name: 'Research Ops' }
  ];

  selectedWorkspaceId = this.workspaceOptions[0].id;

  featureResearchForm = {
    feature: '',
    category: '',
    persona: '',
    competitors: '',
    time_window_days: 180
  };
  featureResearchIsSubmitting = false;
  featureResearchRun: FeatureResearchRun | null = null;
  featureResearchRunId = '';
  featureResearchArtifacts: { themes?: any; evidence?: any; brief?: any; urls?: any; market_signal?: any } = {};
  featureResearchTab: 'themes' | 'evidence' | 'brief' = 'themes';
  featureResearchDemoMode = false;

  decisionQueue: Decision[] = [
    {
      id: 'd-01',
      title: 'Launch self-serve enterprise tier',
      description: 'Enterprise buyers abandon checkout due to sales-assisted friction.',
      owner: 'S. Chen',
      confidence: 91,
      impact: '+$8.5M ARR',
      status: 'review',
      risk: 'high',
      problem: '68% of enterprise-intent sessions drop off on pricing due to forced sales interaction.',
      evidence: '847 abandoned sessions, 23 lost deals citing purchase friction, and 14 Gong calls requesting instant checkout.',
      tradeoff: 'Requires 4 FTEs for 6 weeks, delaying one analytics milestone.',
      options: [
        { title: 'Full self-serve + usage metering', detail: 'Highest upside, highest engineering cost.' },
        { title: 'Hybrid checkout with sales assist', detail: 'Balanced risk, faster rollout.' },
        { title: 'Demand capture waitlist', detail: 'Fastest to ship, least revenue capture.' }
      ]
    },
    {
      id: 'd-02',
      title: 'Raise API rate limits for enterprise plans',
      description: 'Large accounts are throttled during peak ingestion windows.',
      owner: 'R. Gupta',
      confidence: 86,
      impact: '-$2.1M churn risk',
      status: 'draft',
      risk: 'medium',
      problem: 'Rate limits are causing mission-critical workflows to fail for enterprise tenants.',
      evidence: '38% of churn signals in the last 30 days mention API bottlenecks.',
      tradeoff: 'Higher infra spend (+$42k/month) and potential noisy-neighbor impacts.',
      options: [
        { title: 'Global limit increase', detail: 'Fastest path, broad infra impact.' },
        { title: 'Plan-based adaptive limits', detail: 'Best long-term control with moderate complexity.' }
      ]
    },
    {
      id: 'd-03',
      title: 'Package board-ready weekly decision brief',
      description: 'Exec team needs a stable narrative for decision confidence and risk.',
      owner: 'A. Lewis',
      confidence: 78,
      impact: 'Faster board prep',
      status: 'approved',
      risk: 'low',
      problem: 'Decision context is scattered across channels and hard to summarize quickly.',
      evidence: 'Leadership requested manual summaries 4 weeks in a row.',
      tradeoff: 'Automation may miss nuance without owner review.',
      options: [
        { title: 'Automated draft + owner approval', detail: 'Maintains quality while saving time.' },
        { title: 'Fully automatic board packet', detail: 'Maximum speed, higher quality risk.' }
      ]
    }
  ];

  selectedDecisionId = this.decisionQueue[0].id;

  signalStream: Signal[] = [
    { id: 's-01', source: 'Intercom', title: 'SSO requests rising', summary: '34 enterprise tickets mention SSO and provisioning blockers.', timestamp: '4m ago' },
    { id: 's-02', source: 'Slack', title: 'Revenue at-risk alert', summary: 'Acme account escalated after 3 unresolved P1 incidents.', timestamp: '16m ago' },
    { id: 's-03', source: 'Gong', title: 'Win-call pattern', summary: 'Win rate rises 18% when AI decision flow is demoed live.', timestamp: '41m ago' },
    { id: 's-04', source: 'Jira', title: 'Throughput trend', summary: 'API v2 branch reduced queue latency by 32%.', timestamp: '1h ago' }
  ];

  contextItems: Signal[] = [
    { id: 'c-01', source: 'Slack', title: 'Customer escalation thread', summary: 'Two enterprise teams blocked by API burst throttling.', timestamp: '9m ago' },
    { id: 'c-02', source: 'Intercom', title: 'Support trend', summary: 'Dashboard export + SSO are top friction points this week.', timestamp: '21m ago' },
    { id: 'c-03', source: 'Gong', title: 'Call intelligence', summary: 'Buyers ask for implementation speed and reliability proof.', timestamp: '58m ago' }
  ];

  chatThreads: ChatThread[] = [
    {
      id: 'thread-new',
      title: 'New chat',
      preview: '',
      updatedAt: 'now',
      messages: []
    },
    {
      id: 'thread-greeting',
      title: 'Greeting',
      preview: 'Hello! How can I help you today?',
      updatedAt: '9m ago',
      messages: [
        {
          id: 'm-hello-user',
          role: 'user',
          name: 'You',
          content: 'Hello',
          timestamp: '9m ago'
        },
        {
          id: 'm-hello-ai',
          role: 'assistant',
          name: 'Sentinent',
          content: 'Hello! How can I help you today?',
          timestamp: '9m ago'
        }
      ]
    },
    {
      id: 'thread-build',
      title: 'Build an app based on my idea',
      preview: 'I can break your idea into milestones and delivery risks.',
      updatedAt: '1d ago',
      messages: [
        {
          id: 'm-build-ai',
          role: 'assistant',
          name: 'Sentinent',
          content: 'Share your idea and constraints. I can break it into milestones, effort, and rollout risk.',
          timestamp: '1d ago'
        }
      ]
    }
  ];

  activeChatThreadId = 'thread-new';

  timelineEvents: TimelineEvent[] = [
    {
      id: 't-01',
      title: 'Board packet prepared',
      detail: 'Weekly confidence and risk summary generated.',
      time: '2h ago',
      tone: 'info'
    },
    {
      id: 't-02',
      title: 'Decision approved',
      detail: 'Self-serve enterprise scope moved to implementation.',
      time: '5h ago',
      tone: 'success'
    },
    {
      id: 't-03',
      title: 'Bias alert detected',
      detail: 'Recency bias was flagged in retention scoring model.',
      time: '1d ago',
      tone: 'warning'
    }
  ];

  kanbanColumns: KanbanColumn[] = [
    {
      id: 'backlog',
      title: 'Backlog',
      wipLimit: 8,
      items: [
        { id: 'k-01', title: 'Decision rationale template', tag: 'Ops', priority: 'Low', assignee: 'AL' },
        { id: 'k-02', title: 'SOC2 evidence map', tag: 'Security', priority: 'Medium', assignee: 'TK' }
      ]
    },
    {
      id: 'in-review',
      title: 'In Review',
      wipLimit: 5,
      items: [
        { id: 'k-03', title: 'Enterprise API limit model', tag: 'Platform', priority: 'High', assignee: 'RG' },
        { id: 'k-04', title: 'Decision quality rubric', tag: 'PM', priority: 'Medium', assignee: 'SC' }
      ]
    },
    {
      id: 'decided',
      title: 'Decided',
      wipLimit: 6,
      items: [{ id: 'k-05', title: 'Board brief automation', tag: 'Exec', priority: 'High', assignee: 'AL' }]
    },
    {
      id: 'archived',
      title: 'Archived',
      wipLimit: 99,
      items: [{ id: 'k-06', title: 'Legacy scoring model v1', tag: 'ML', priority: 'Low', assignee: 'MA' }]
    }
  ];

  draggedCard: { cardId: string; fromColumnId: string } | null = null;

  organizationSettings: ToggleSetting[] = [
    { title: 'Auto-tag incoming signals', description: 'Cluster inbound signals into decision themes.', enabled: true },
    { title: 'Require confidence threshold', description: 'Block approvals below confidence threshold.', enabled: true },
    { title: 'Weekly executive digest', description: 'Send board-ready digest every Friday.', enabled: true }
  ];

  integrations: IntegrationSetting[] = [
    { name: 'Slack', status: 'Connected', events: '1,204 events/day', enabled: true },
    { name: 'Intercom', status: 'Connected', events: '632 events/day', enabled: true },
    { name: 'Gong', status: 'Disconnected', events: 'Not syncing', enabled: false },
    { name: 'Jira', status: 'Connected', events: '489 events/day', enabled: true }
  ];

  newDecision = {
    title: '',
    problem: '',
    evidence: '',
    options: [''],
    owner: '',
    impact: '',
    tradeoff: '',
    confidence: 70
  };

  notifications: Toast[] = [];

  private lastFocusedElement: HTMLElement | null = null;
  private toastTimerById = new Map<number, number>();
  private toastCounter = 0;
  private featureResearchPollHandle: number | null = null;

  get activeDecision(): Decision {
    return this.decisionQueue.find(item => item.id === this.selectedDecisionId) ?? this.decisionQueue[0];
  }

  get inboxUnreadCount(): number {
    return this.decisionQueue.filter(item => item.status === 'review').length;
  }

  get hasDisconnectedIntegrations(): boolean {
    return this.integrations.some(item => item.status === 'Disconnected');
  }

  get modalIsValid(): boolean {
    return (
      this.newDecision.title.trim().length > 0
      && this.newDecision.problem.trim().length > 0
      && this.newDecision.evidence.trim().length > 0
      && this.newDecision.owner.trim().length > 0
      && this.newDecision.impact.trim().length > 0
      && this.newDecision.options.some(opt => opt.trim().length > 0)
    );
  }

  get activeChatThread(): ChatThread {
    return this.chatThreads.find(thread => thread.id === this.activeChatThreadId) ?? this.chatThreads[0];
  }

  get filteredChatThreads(): ChatThread[] {
    const query = this.chatThreadSearch.trim().toLowerCase();
    if (!query) {
      return this.chatThreads;
    }

    return this.chatThreads.filter(thread => {
      return (
        thread.title.toLowerCase().includes(query)
        || thread.preview.toLowerCase().includes(query)
      );
    });
  }

  get chatMessages(): ChatMessage[] {
    return this.activeChatThread.messages;
  }

  set chatMessages(messages: ChatMessage[]) {
    this.activeChatThread.messages = messages;
  }

  get chatIsEmpty(): boolean {
    return this.chatMessages.length === 0;
  }

  get chatGreetingPeriod(): string {
    const hour = new Date().getHours();
    if (hour < 12) {
      return 'morning';
    }
    if (hour < 18) {
      return 'afternoon';
    }
    return 'evening';
  }

  get activeWorkspaceName(): string {
    return this.workspaceOptions.find(item => item.id === this.selectedWorkspaceId)?.name ?? this.workspaceOptions[0].name;
  }

  get featureResearchThemes(): FeatureResearchTheme[] {
    const raw = this.featureResearchArtifacts?.themes;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw as FeatureResearchTheme[];
    if (Array.isArray(raw.items)) return raw.items as FeatureResearchTheme[];
    return [];
  }

  get featureResearchEvidence(): FeatureResearchEvidence[] {
    const raw = this.featureResearchArtifacts?.evidence;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw as FeatureResearchEvidence[];
    return [];
  }

  get featureResearchBrief(): any {
    return this.featureResearchArtifacts?.brief ?? null;
  }

  ngOnInit(): void {
    if (window.location.pathname === '/agent') {
      this.currentView = 'agent';
    }

    const savedTheme = localStorage.getItem('sentinent-theme');
    if (savedTheme) {
      this.isDarkMode = savedTheme === 'dark';
    } else {
      this.isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    const savedTone = localStorage.getItem('sentinent-tone');
    if (savedTone === 'graphite' || savedTone === 'signal') {
      this.toneMode = savedTone;
    }
    this.applyThemeClass();
    void this.loadFeatureResearchConfig();
  }

  ngOnDestroy(): void {
    this.toastTimerById.forEach(timer => window.clearTimeout(timer));
    this.toastTimerById.clear();
    this.stopFeatureResearchPolling();
    document.body.style.overflow = '';
  }

  toggleSidebar(): void {
    this.isWorkspaceMenuOpen = false;
    if (window.matchMedia('(max-width: 1024px)').matches) {
      this.isSidebarOpen = !this.isSidebarOpen;
      document.body.style.overflow = this.isSidebarOpen ? 'hidden' : '';
      return;
    }

    this.isSidebarHiddenDesktop = !this.isSidebarHiddenDesktop;
    document.body.style.overflow = '';
  }

  setView(view: ViewKey): void {
    this.currentView = view;
    this.isWorkspaceMenuOpen = false;
    if (this.isSidebarOpen) {
      this.isSidebarOpen = false;
      document.body.style.overflow = '';
    }
    if (view !== 'inbox') {
      this.selectedDecisionId = this.decisionQueue[0]?.id ?? this.selectedDecisionId;
    }
  }

  toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;
    localStorage.setItem('sentinent-theme', this.isDarkMode ? 'dark' : 'light');
    this.applyThemeClass();
  }

  toggleWorkspaceMenu(): void {
    this.isWorkspaceMenuOpen = !this.isWorkspaceMenuOpen;
  }

  selectWorkspace(workspaceID: string): void {
    const workspace = this.workspaceOptions.find(item => item.id === workspaceID);
    if (!workspace) {
      return;
    }
    this.selectedWorkspaceId = workspaceID;
    this.isWorkspaceMenuOpen = false;
    this.showNotification(`Workspace switched to ${workspace.name}.`, 'info');
  }

  toggleTone(): void {
    this.toneMode = this.toneMode === 'graphite' ? 'signal' : 'graphite';
    localStorage.setItem('sentinent-tone', this.toneMode);
    this.applyThemeClass();
    this.showNotification(`Tone switched to ${this.toneMode}.`, 'info');
  }

  async loadFeatureResearchConfig(): Promise<void> {
    try {
      const response = await fetch('/api/agent/config');
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      this.featureResearchDemoMode = Boolean(data?.demo_mode);
    } catch {
      this.featureResearchDemoMode = false;
    }
  }

  async startFeatureResearchRun(): Promise<void> {
    const feature = this.featureResearchForm.feature.trim();
    const category = this.featureResearchForm.category.trim();
    if (!feature || !category || this.featureResearchIsSubmitting) {
      return;
    }

    this.featureResearchIsSubmitting = true;
    try {
      const competitors = this.featureResearchForm.competitors
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);

      const response = await fetch('/api/agent/feature-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature,
          category,
          persona: this.featureResearchForm.persona.trim() || undefined,
          competitors,
          time_window_days: Number(this.featureResearchForm.time_window_days) || 180
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to start feature research run');
      }

      this.featureResearchRunId = String(data?.runId || '');
      this.featureResearchRun = null;
      this.featureResearchArtifacts = {};
      this.featureResearchTab = 'themes';
      this.featureResearchDemoMode = Boolean(data?.demo_mode ?? this.featureResearchDemoMode);
      this.startFeatureResearchPolling();
      this.showNotification('Feature research run started.', 'success');
    } catch (error) {
      this.showNotification(error instanceof Error ? error.message : 'Failed to start run', 'error');
    } finally {
      this.featureResearchIsSubmitting = false;
    }
  }

  setFeatureResearchTab(tab: 'themes' | 'evidence' | 'brief'): void {
    this.featureResearchTab = tab;
  }

  private startFeatureResearchPolling(): void {
    this.stopFeatureResearchPolling();
    if (!this.featureResearchRunId) {
      return;
    }

    void this.pollFeatureResearchRun();
    this.featureResearchPollHandle = window.setInterval(() => {
      void this.pollFeatureResearchRun();
    }, 2000);
  }

  private stopFeatureResearchPolling(): void {
    if (this.featureResearchPollHandle !== null) {
      window.clearInterval(this.featureResearchPollHandle);
      this.featureResearchPollHandle = null;
    }
  }

  async pollFeatureResearchRun(): Promise<void> {
    if (!this.featureResearchRunId) return;

    try {
      const runResp = await fetch(`/api/agent/runs/${this.featureResearchRunId}`);
      if (runResp.ok) {
        this.featureResearchRun = await runResp.json();
      }

      const artifactResp = await fetch(`/api/agent/runs/${this.featureResearchRunId}/artifacts`);
      if (artifactResp.ok) {
        this.featureResearchArtifacts = await artifactResp.json();
      }

      if (this.featureResearchRun?.status === 'completed' || this.featureResearchRun?.status === 'failed') {
        this.stopFeatureResearchPolling();
      }
    } catch {
      if (this.featureResearchRun) {
        this.featureResearchRun.error = 'Unable to poll run state';
      }
    }
  }

  onSearch(query: string): void {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      this.searchResults = [];
      return;
    }

    const decisionMatches = this.decisionQueue
      .filter(item => item.title.toLowerCase().includes(normalized) || item.description.toLowerCase().includes(normalized))
      .slice(0, 4)
      .map<SearchResult>(item => ({
        id: `sr-d-${item.id}`,
        type: 'Decision',
        title: item.title,
        subtitle: `${item.owner} - ${item.confidence}% confidence`,
        targetView: 'inbox',
        targetId: item.id
      }));

    const signalMatches = this.signalStream
      .filter(item => item.title.toLowerCase().includes(normalized) || item.summary.toLowerCase().includes(normalized))
      .slice(0, 3)
      .map<SearchResult>(item => ({
        id: `sr-s-${item.id}`,
        type: 'Signal',
        title: item.title,
        subtitle: `${item.source} - ${item.timestamp}`,
        targetView: 'inbox'
      }));

    const viewMatches = this.viewOptions
      .filter(item => item.label.toLowerCase().includes(normalized))
      .slice(0, 2)
      .map<SearchResult>(item => ({
        id: `sr-v-${item.key}`,
        type: 'View',
        title: item.label,
        subtitle: 'Navigate',
        targetView: item.key
      }));

    this.searchResults = [...decisionMatches, ...signalMatches, ...viewMatches].slice(0, 8);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchResults = [];
  }

  useSearchResult(result: SearchResult): void {
    this.setView(result.targetView);
    if (result.targetView === 'inbox' && result.targetId) {
      this.selectedDecisionId = result.targetId;
    }
    this.clearSearch();
  }

  addContext(): void {
    const title = this.contextDraft.title.trim();
    const summary = this.contextDraft.summary.trim();

    if (!title && !summary) {
      this.showNotification('Add a title or summary before attaching context.', 'error');
      return;
    }

    this.contextItems.unshift({
      id: this.createId('ctx'),
      source: this.contextDraft.source,
      title: title || `${this.contextDraft.source} signal`,
      summary: summary || 'Signal attached for decision context.',
      timestamp: 'just now'
    });

    this.contextDraft.title = '';
    this.contextDraft.summary = '';
    this.showNotification('Context attached.', 'success');
  }

  removeContext(index: number): void {
    this.contextItems.splice(index, 1);
  }

  startNewChatThread(): void {
    const existingDraft = this.chatThreads.find(thread => thread.id === 'thread-new');
    if (existingDraft) {
      existingDraft.messages = [];
      existingDraft.preview = '';
      existingDraft.updatedAt = 'now';
      this.activeChatThreadId = existingDraft.id;
      return;
    }

    this.chatThreads.unshift({
      id: 'thread-new',
      title: 'New chat',
      preview: '',
      updatedAt: 'now',
      messages: []
    });
    this.activeChatThreadId = 'thread-new';
  }

  openChatThread(threadId: string): void {
    this.activeChatThreadId = threadId;
  }

  onChatKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void this.sendChat();
    }
  }

  autoResizeTextarea(event: Event): void {
    const element = event.target as HTMLTextAreaElement;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 128)}px`;
  }

  async sendChat(): Promise<void> {
    const prompt = this.chatInput.trim();
    if (!prompt || this.chatIsLoading) {
      return;
    }

    const activeThread = this.activeChatThread;
    this.chatMessages.push({
      id: this.createId('msg-user'),
      role: 'user',
      name: 'You',
      content: prompt,
      timestamp: 'just now'
    });
    activeThread.preview = prompt;
    activeThread.updatedAt = 'now';

    if (activeThread.title === 'New chat') {
      activeThread.title = this.createThreadTitle(prompt);
    }

    this.promoteChatThread(activeThread.id);
    this.chatInput = '';
    this.chatIsLoading = true;

    await new Promise(resolve => window.setTimeout(resolve, 420));

    this.chatMessages.push({
      id: this.createId('msg-ai'),
      role: 'assistant',
      name: 'Sentinent',
      content: this.composeAssistantReply(prompt),
      timestamp: 'now',
      citations: this.contextItems.length ? ['[1]', '[2]'] : undefined
    });

    activeThread.preview = this.chatMessages[this.chatMessages.length - 1]?.content ?? prompt;
    activeThread.updatedAt = 'now';
    this.chatIsLoading = false;
  }

  useSuggestion(suggestion: string): void {
    this.chatInput = suggestion;
    void this.sendChat();
  }

  clearChat(): void {
    this.chatMessages = [];
    this.activeChatThread.preview = '';
    this.activeChatThread.updatedAt = 'now';
    if (this.activeChatThread.id === 'thread-new') {
      this.activeChatThread.title = 'New chat';
    }
    this.showNotification('Chat cleared.', 'info');
  }

  exportChat(): void {
    const payload = this.chatMessages
      .map(item => `${item.name} (${item.timestamp})\n${item.content}`)
      .join('\n\n');

    const blob = new Blob([payload], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `sentinent-chat-${new Date().toISOString().slice(0, 10)}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    this.showNotification('Chat exported.', 'success');
  }

  selectDecision(decisionId: string): void {
    this.selectedDecisionId = decisionId;
  }

  getKpiValue(card: KpiCard): string {
    if (card.id === 'active') {
      return `${this.decisionQueue.length}`;
    }
    if (card.id === 'confidence') {
      const sum = this.decisionQueue.reduce((acc, item) => acc + item.confidence, 0);
      const avg = this.decisionQueue.length ? Math.round(sum / this.decisionQueue.length) : 0;
      return `${avg}%`;
    }
    if (card.id === 'time') {
      return '24h';
    }
    return '148/day';
  }

  kpiDirectionIcon(direction: KpiCard['direction']): string {
    if (direction === 'up') return 'UP';
    if (direction === 'down') return 'DOWN';
    return '.';
  }

  riskClass(risk: RiskLevel): string {
    if (risk === 'high') return 'risk-high';
    if (risk === 'medium') return 'risk-medium';
    return 'risk-low';
  }

  statusLabel(status: DecisionStatus): string {
    if (status === 'review') return 'In Review';
    if (status === 'approved') return 'Approved';
    if (status === 'archived') return 'Archived';
    return 'Draft';
  }

  statusClass(status: DecisionStatus): string {
    if (status === 'approved') return 'status-approved';
    if (status === 'review') return 'status-review';
    if (status === 'archived') return 'status-archived';
    return 'status-draft';
  }

  openNewDecisionModal(): void {
    this.lastFocusedElement = document.activeElement as HTMLElement;
    this.showNewDecisionModal = true;
    document.body.style.overflow = 'hidden';

    this.newDecision = {
      title: '',
      problem: '',
      evidence: '',
      options: [''],
      owner: '',
      impact: '',
      tradeoff: '',
      confidence: 70
    };

    window.setTimeout(() => {
      this.newDecisionTitleInput?.nativeElement.focus();
    }, 0);
  }

  closeNewDecisionModal(): void {
    this.showNewDecisionModal = false;
    document.body.style.overflow = this.isSidebarOpen ? 'hidden' : '';
    if (this.lastFocusedElement) {
      this.lastFocusedElement.focus();
    }
  }

  onNewDecisionModalKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') {
      return;
    }

    const modal = this.newDecisionModal?.nativeElement;
    if (!modal) return;

    const focusable = Array.from(
      modal.querySelectorAll<HTMLElement>(
        'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
      )
    ).filter(node => !node.hasAttribute('disabled'));

    if (!focusable.length) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  addNewOption(): void {
    this.newDecision.options.push('');
  }

  removeNewOption(index: number): void {
    if (this.newDecision.options.length === 1) {
      this.newDecision.options[0] = '';
      return;
    }
    this.newDecision.options.splice(index, 1);
  }

  saveNewDecision(): void {
    if (!this.modalIsValid) {
      this.showNotification('Complete required fields before creating the decision.', 'error');
      return;
    }

    const newItem: Decision = {
      id: this.createId('dec'),
      title: this.newDecision.title.trim(),
      description: this.newDecision.problem.trim(),
      owner: this.newDecision.owner.trim(),
      confidence: this.newDecision.confidence,
      impact: this.newDecision.impact.trim(),
      status: 'draft',
      risk: this.newDecision.confidence < 60 ? 'high' : this.newDecision.confidence < 80 ? 'medium' : 'low',
      problem: this.newDecision.problem.trim(),
      evidence: this.newDecision.evidence.trim(),
      tradeoff: this.newDecision.tradeoff.trim(),
      options: this.newDecision.options
        .map(option => option.trim())
        .filter(option => option.length > 0)
        .map(option => ({ title: option, detail: 'Newly added option from decision form.' }))
    };

    this.decisionQueue.unshift(newItem);
    this.selectedDecisionId = newItem.id;

    const backlog = this.kanbanColumns.find(col => col.id === 'backlog');
    backlog?.items.unshift({
      id: this.createId('kb'),
      title: newItem.title,
      tag: 'Decision',
      priority: newItem.risk === 'high' ? 'High' : newItem.risk === 'medium' ? 'Medium' : 'Low',
      assignee: this.initialsFor(newItem.owner)
    });

    this.showNotification('Decision created.', 'success');
    this.closeNewDecisionModal();
    this.setView('inbox');
  }

  onDragStart(event: DragEvent, columnId: string, cardId: string): void {
    this.draggedCard = { cardId, fromColumnId: columnId };
    event.dataTransfer?.setData('text/plain', cardId);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onDrop(event: DragEvent, targetColumnId: string): void {
    event.preventDefault();
    if (!this.draggedCard) return;

    const sourceColumn = this.kanbanColumns.find(col => col.id === this.draggedCard?.fromColumnId);
    const targetColumn = this.kanbanColumns.find(col => col.id === targetColumnId);

    if (!sourceColumn || !targetColumn) {
      this.draggedCard = null;
      return;
    }

    const cardIndex = sourceColumn.items.findIndex(item => item.id === this.draggedCard?.cardId);
    if (cardIndex < 0) {
      this.draggedCard = null;
      return;
    }

    const [card] = sourceColumn.items.splice(cardIndex, 1);
    targetColumn.items.push(card);
    this.draggedCard = null;
    this.showNotification(`Moved "${card.title}" to ${targetColumn.title}.`, 'info');
  }

  toggleOrgSetting(index: number): void {
    this.organizationSettings[index].enabled = !this.organizationSettings[index].enabled;
  }

  toggleIntegration(index: number): void {
    const item = this.integrations[index];
    item.enabled = !item.enabled;
    item.status = item.enabled ? 'Connected' : 'Disconnected';
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboard(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();

    if ((event.metaKey || event.ctrlKey) && key === 'k') {
      event.preventDefault();
      this.focusGlobalSearch();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && key === '1') {
      event.preventDefault();
      this.setView('chat');
      return;
    }

    if ((event.metaKey || event.ctrlKey) && key === '2') {
      event.preventDefault();
      this.setView('inbox');
      return;
    }

    if ((event.metaKey || event.ctrlKey) && key === '3') {
      event.preventDefault();
      this.setView('agent');
      return;
    }

    if ((event.metaKey || event.ctrlKey) && key === 'n' && this.currentView === 'chat') {
      event.preventDefault();
      this.startNewChatThread();
      return;
    }

    if (event.key === '?' && !this.isTypingContext(event.target)) {
      event.preventDefault();
      this.showShortcutsModal = true;
      return;
    }

    if (event.key === 'Escape') {
      if (this.isWorkspaceMenuOpen) {
        this.isWorkspaceMenuOpen = false;
      } else if (this.showNewDecisionModal) {
        this.closeNewDecisionModal();
      } else if (this.showShortcutsModal) {
        this.showShortcutsModal = false;
      } else if (this.isSidebarOpen) {
        this.toggleSidebar();
      } else if (this.searchQuery) {
        this.clearSearch();
      }
    }
  }

  @HostListener('document:click', ['$event'])
  handleDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }

    if (!target.closest('.workspace-wrap')) {
      this.isWorkspaceMenuOpen = false;
    }
  }

  dismissNotification(id: number): void {
    this.notifications = this.notifications.filter(item => item.id !== id);
    const timer = this.toastTimerById.get(id);
    if (timer) {
      window.clearTimeout(timer);
      this.toastTimerById.delete(id);
    }
  }

  trackById(_index: number, item: { id: string }): string {
    return item.id;
  }

  private composeAssistantReply(prompt: string): string {
    const lower = prompt.toLowerCase();

    if (lower.includes('churn')) {
      return 'Top churn driver is API throttling (38% of at-risk mentions). Recommended decision: ship adaptive enterprise rate limits this sprint, then sequence SSO reliability improvements next.';
    }

    if (lower.includes('draft') || lower.includes('decision')) {
      return 'Draft recommendation: prioritize enterprise API limits first. Expected impact is reduced churn exposure with medium implementation complexity. I can format this into a decision card for review.';
    }

    return 'Recommendation: act on the highest-confidence, highest-impact queue item. Current best candidate is "Launch self-serve enterprise tier" with 91% confidence and measurable ARR upside.';
  }

  private promoteChatThread(threadId: string): void {
    const currentIndex = this.chatThreads.findIndex(item => item.id === threadId);
    if (currentIndex <= 0) {
      return;
    }

    const [thread] = this.chatThreads.splice(currentIndex, 1);
    this.chatThreads.unshift(thread);
  }

  private createThreadTitle(prompt: string): string {
    const compact = prompt.replace(/\s+/g, ' ').trim();
    if (compact.length <= 34) {
      return compact;
    }
    return `${compact.slice(0, 31)}...`;
  }

  private focusGlobalSearch(): void {
    this.globalSearchInput?.nativeElement.focus();
    this.globalSearchInput?.nativeElement.select();
  }

  private applyThemeClass(): void {
    document.documentElement.classList.toggle('dark', this.isDarkMode);
    document.documentElement.setAttribute('data-sentinent-tone', this.toneMode);
  }

  private showNotification(message: string, type: ToastType): void {
    const id = ++this.toastCounter;
    this.notifications.unshift({ id, message, type });

    const timer = window.setTimeout(() => {
      this.dismissNotification(id);
    }, 3600);

    this.toastTimerById.set(id, timer);
  }

  private initialsFor(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .map(part => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  private createId(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private isTypingContext(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }
}

