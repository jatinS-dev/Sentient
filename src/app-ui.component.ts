import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ClerkUserButtonComponent } from 'ngx-clerk';

@Component({
  selector: 'app-ui',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, ClerkUserButtonComponent],
  templateUrl: './app-ui.component.html',
  styleUrls: ['./app-ui.component.css']
})
export class AppUiComponent implements OnInit, OnDestroy {
  // Theme
  isDarkMode = false;

  // Command Palette
  showCommandPalette = false;
  commandQuery = '';
  commandResults: { icon: string; label: string; action: () => void }[] = [];
  selectedCommandIndex = 0;

  // Decision Archive
  archivedDecisions: any[] = [];
  showArchiveModal = false;

  // Loading state
  isLoading = true;
  isSidebarOpen = false;
  currentView: 'chat' | 'inbox' | 'kanban' | 'sprints' | 'automations' | 'integrations' | 'reports' | 'settings' = 'inbox';
  chatInput = '';
  chatIsLoading = false;
  chatError = '';
  llmBaseUrl = 'http://localhost:11434';
  llmModel = 'llama3.1:8b';
  systemPrompt =
    'You are Sentinent, an AI decision assistant. Use the provided context to answer clearly and cite relevant sources when possible.';

  // Modal state
  showNewDecisionModal = false;
  newDecision = {
    title: '',
    problem: '',
    evidence: '',
    options: [''],
    tradeoff: '',
    owner: '',
    confidence: 75,
    impact: ''
  };

  // Search state
  searchQuery = '';
  searchResults: { type: string; title: string; subtitle: string }[] = [];

  // Notifications
  notifications: { message: string; type: 'success' | 'error' | 'info' }[] = [];

  // Drag and drop state
  draggedCard: any = null;
  draggedFromColumn = '';
  dragOverColumn = '';

  kpis = [
    { label: 'Active Decisions', value: '37', change: '+12 this month' },
    { label: 'Signals Processed', value: '14,892', change: '+42% vs last month' },
    { label: 'Revenue at Risk', value: '$4.2M', change: 'Down $1.8M since Jan' },
    { label: 'Decision Accuracy', value: '94%', change: 'Top decile in SaaS' }
  ];

  decisionQueue = [
    {
      title: 'Launch Self-Serve Enterprise Tier',
      status: 'Approved',
      owner: 'S. Chen',
      confidence: 91,
      impact: '+$8.5M ARR',
      risk: 'Eng headcount +4, 6-week build'
    },
    {
      title: 'Migrate Analytics to Real-Time Pipeline',
      status: 'Approved',
      owner: 'R. Gupta',
      confidence: 88,
      impact: '+$3.2M ARR',
      risk: 'Infra cost +$200k/qtr'
    },
    {
      title: 'Expand to EU with GDPR-First Architecture',
      status: 'In Review',
      owner: 'A. Lewis',
      confidence: 79,
      impact: '+$6.1M ARR',
      risk: 'Legal review 4 weeks'
    },
    {
      title: 'AI-Powered Churn Prediction Model v2',
      status: 'Proposed',
      owner: 'M. Alvarez',
      confidence: 82,
      impact: '-$2.1M saved churn',
      risk: 'Data privacy audit needed'
    },
    {
      title: 'Partner API & Marketplace Launch',
      status: 'In Review',
      owner: 'T. Kumar',
      confidence: 74,
      impact: '+$4.8M ecosystem rev',
      risk: 'DevRel hire + 90-day ramp'
    }
  ];

  decisionDetail = {
    title: 'Launch Self-Serve Enterprise Tier',
    status: 'Approved',
    problem: 'Mid-market prospects (500–2000 employees) abandon at pricing page. 68% request self-serve checkout but current flow requires sales call.',
    evidence: '847 abandoned pricing sessions, 23 lost deals citing friction, Gong sentiment analysis confirms "too slow to buy".',
    tradeoff: 'Engineering capacity: 4 FTEs for 6 weeks. Delays mobile roadmap by one sprint.',
    owner: 'S. Chen',
    confidence: 91,
    impact: '+$8.5M ARR'
  };

  decisionOptions = [
    { title: 'Option A: Full self-serve with usage-based billing', detail: 'Highest revenue capture. Requires Stripe metering integration. 6-week build.' },
    { title: 'Option B: Hybrid — self-serve start, sales-assist upgrade', detail: 'Lower risk. Keeps AE touchpoint for upsell. 3-week build.' },
    { title: 'Option C: Waitlist mode with auto-qualification', detail: 'Lowest engineering cost. Tests demand first. 1-week build.' }
  ];

  signalStream = [
    { source: 'Intercom', summary: '34 enterprise tickets this week: SSO + API rate limits top themes', time: '4m ago' },
    { source: 'Gong', summary: 'Win rate up 18% when AI demo is shown — strongest differentiator', time: '12m ago' },
    { source: 'Slack', summary: 'VP Sales flagged: Acme Corp ($1.2M deal) asking for SOC2 report', time: '28m ago' },
    { source: 'Salesforce', summary: 'Pipeline jumped $3.4M this week — 6 new enterprise opportunities', time: '1h ago' },
    { source: 'GitHub', summary: 'API v2 shipped: 3x throughput, zero breaking changes', time: '2h ago' },
    { source: 'Stripe', summary: 'MRR crossed $890K — 14% MoM growth accelerating', time: '3h ago' }
  ];

  insightCards = [
    {
      title: 'Decision Accuracy',
      value: '94%',
      note: 'Up 11 pts since last quarter',
      badge: 'Top Performer'
    },
    {
      title: 'Bias Detection',
      value: '2 Flagged',
      note: 'Recency bias in pricing decisions',
      badge: 'Auto-corrected'
    }
  ];

  chatMessages = [
    {
      role: 'assistant',
      name: 'Sentinent Core',
      content: 'Good morning. I processed 1,247 signals overnight across Intercom, Gong, Slack, and Salesforce. Here\'s what matters:',
      time: '9:01 AM'
    },
    {
      role: 'assistant',
      name: 'Sentinent Core',
      content: '🔴 **Revenue Risk**: Acme Corp ($1.2M ARR) has 3 unresolved P1 tickets. Churn probability jumped to 34%. Auto-drafted an escalation decision.\n\n🟢 **Growth Signal**: Win rate is up 18% when the AI decision engine is demoed. Recommending we add it to all enterprise sales flows.\n\n📊 **Pipeline**: $3.4M in new enterprise opportunities this week. Self-serve tier conversion rate is the bottleneck.',
      time: '9:01 AM'
    },
    {
      role: 'user',
      name: 'You',
      content: 'What\'s the #1 decision we should make this week based on revenue impact?',
      time: '9:03 AM'
    },
    {
      role: 'assistant',
      name: 'Sentinent Core',
      content: 'Based on cross-referencing 14,892 signals, the highest-impact decision is **Launch Self-Serve Enterprise Tier**.\n\n**Evidence**: 847 abandoned pricing sessions, 23 lost deals citing checkout friction, and $8.5M projected ARR impact. Confidence: 91%.\n\nI\'ve drafted the decision with 3 options and tradeoff analysis. The team can review in the Decision Inbox.',
      time: '9:04 AM'
    },
    {
      role: 'user',
      name: 'You',
      content: 'Show me all churn signals for the past 30 days.',
      time: '9:06 AM'
    },
    {
      role: 'assistant',
      name: 'Sentinent Core',
      content: 'Churn analysis (30 days):\n\n• **14 accounts** flagged with elevated risk (up from 8 last month)\n• **Top drivers**: API rate limits (38%), dashboard performance (29%), missing SSO (18%)\n• **Revenue at risk**: $4.2M ARR\n• **Trend**: Risk is declining — down $1.8M since we shipped the batch export queue\n\nThe AI model predicts that resolving the API rate limit issue alone would reduce churn risk by ~$2.1M.',
      time: '9:07 AM'
    }
  ];

  chatSuggestions = [
    'What\'s our projected ARR impact this quarter?',
    'Compare our win rate vs last quarter.',
    'Draft a decision for the biggest revenue risk.',
    'What signals should I act on today?'
  ];

  contextItems = [
    {
      source: 'Salesforce',
      title: 'Pipeline Analysis',
      summary: 'Enterprise pipeline at $12.4M with 68% weighted close rate. 6 new opps this week.',
      time: '5m ago'
    },
    {
      source: 'Intercom',
      title: 'Support Trend Analysis',
      summary: '34 enterprise tickets: SSO issues (38%), API limits (29%), dashboard latency (18%).',
      time: '18m ago'
    },
    {
      source: 'Gong',
      title: 'Win/Loss Intelligence',
      summary: 'AI decision engine cited as differentiator in 72% of closed-won deals this month.',
      time: '45m ago'
    },
    {
      source: 'Stripe',
      title: 'Revenue Metrics',
      summary: 'MRR $890K (+14% MoM). Net revenue retention: 128%. LTV/CAC ratio: 4.8x.',
      time: '1h ago'
    }
  ];

  kanbanColumns = [
    {
      title: 'Backlog',
      items: [
        { title: 'SOC2 Compliance Dashboard', tag: 'Security', priority: 'High', assignee: 'T. Kumar' },
        { title: 'Partner API Documentation', tag: 'Platform', priority: 'Med', assignee: 'J. Park' },
        { title: 'Multi-Region Failover', tag: 'Infra', priority: 'High', assignee: 'R. Singh' }
      ]
    },
    {
      title: 'In Progress',
      items: [
        { title: 'Self-Serve Enterprise Checkout', tag: 'Revenue', priority: 'P0', assignee: 'S. Chen' },
        { title: 'Real-Time Analytics Pipeline', tag: 'Performance', priority: 'High', assignee: 'R. Gupta' },
        { title: 'AI Churn Prediction v2', tag: 'ML', priority: 'High', assignee: 'M. Alvarez' }
      ]
    },
    {
      title: 'Review',
      items: [
        { title: 'GDPR Data Residency Module', tag: 'Compliance', priority: 'High', assignee: 'A. Lewis' },
        { title: 'Batch Export Queue', tag: 'API', priority: 'Med', assignee: 'A. Lewis' }
      ]
    },
    {
      title: 'Shipped',
      items: [
        { title: 'API v2 (3x Throughput)', tag: 'Platform', priority: 'P0', assignee: 'R. Singh' },
        { title: 'Signal Ingestion Pipeline', tag: 'Data', priority: 'High', assignee: 'M. Alvarez' },
        { title: 'Enterprise SSO (SAML + OIDC)', tag: 'Security', priority: 'P0', assignee: 'T. Kumar' }
      ]
    }
  ];

  sprintOverview = {
    name: 'Sprint 24 — Revenue Acceleration',
    goal: 'Ship self-serve enterprise tier and real-time analytics',
    velocity: '68 pts',
    health: 'On Track'
  };

  sprintBacklog = [
    { title: 'Self-serve checkout flow', points: 13, owner: 'S. Chen', status: 'In Progress' },
    { title: 'Stripe metering integration', points: 8, owner: 'S. Chen', status: 'In Progress' },
    { title: 'Real-time analytics pipeline', points: 13, owner: 'R. Gupta', status: 'In Progress' },
    { title: 'GDPR data residency module', points: 8, owner: 'A. Lewis', status: 'Review' },
    { title: 'Churn prediction model v2', points: 13, owner: 'M. Alvarez', status: 'In Progress' },
    { title: 'API rate limit upgrade', points: 5, owner: 'R. Singh', status: 'Done' },
    { title: 'SOC2 evidence collection', points: 3, owner: 'T. Kumar', status: 'Backlog' }
  ];

  automationRules = [
    { title: 'Revenue risk → auto-escalate', trigger: 'Account ARR > $500K & churn risk > 20%', action: 'Alert VP Sales + draft retention decision', status: 'On' },
    { title: 'Win pattern detected → replicate', trigger: 'Win rate > 80% with specific demo flow', action: 'Update playbook + notify all AEs', status: 'On' },
    { title: 'P0 bug → war room', trigger: 'Severity = P0 & enterprise affected', action: 'Create war room, page on-call, notify CSM', status: 'On' },
    { title: 'Pipeline milestone → forecast update', trigger: 'Weighted pipeline changes > $500K', action: 'Update board forecast, notify CFO', status: 'On' },
    { title: 'Competitor mentioned → intel brief', trigger: 'Competitor name in Gong call', action: 'Generate competitive intel summary', status: 'Paused' }
  ];

  integrations = [
    { name: 'Salesforce', status: 'Connected', detail: '1,247 opportunities synced' },
    { name: 'Slack', status: 'Connected', detail: '18 workspaces, 342 channels' },
    { name: 'Intercom', status: 'Connected', detail: '12,489 conversations indexed' },
    { name: 'Gong', status: 'Connected', detail: '2,847 calls analyzed' },
    { name: 'GitHub', status: 'Connected', detail: '14 repos, 892 PRs tracked' },
    { name: 'Jira', status: 'Connected', detail: '6 projects, 1,247 issues synced' },
    { name: 'Stripe', status: 'Connected', detail: 'Revenue metrics live' },
    { name: 'Notion', status: 'Connected', detail: 'Product docs + wikis' },
    { name: 'Microsoft Teams', status: 'Disconnected', detail: 'Connect for real-time alerts' },
    { name: 'Zoom', status: 'Disconnected', detail: 'Import call transcripts' }
  ];

  reports = [
    { title: 'Decision Accuracy', value: '94%', change: '+11 pts QoQ' },
    { title: 'Time to Decision', value: '1.8 days', change: '-67% vs manual process' },
    { title: 'Revenue Influenced', value: '$24.8M', change: 'Decisions leading to revenue' },
    { title: 'Signals → Actions', value: '89%', change: 'Signal-to-decision conversion' }
  ];

  settings = [
    { title: 'AI Decision Engine', description: 'Auto-draft decisions from cross-signal analysis', enabled: true },
    { title: 'Revenue Impact Scoring', description: 'AI-powered revenue attribution on every decision', enabled: true },
    { title: 'Churn Prediction Alerts', description: 'Proactive alerts when accounts cross risk thresholds', enabled: true },
    { title: 'Competitive Intelligence', description: 'Auto-generate briefs from sales call mentions', enabled: true },
    { title: 'Board Report Auto-Generation', description: 'Weekly executive summary for leadership', enabled: false }
  ];

  toggleSidebar() {
    this.isSidebarOpen = !this.isSidebarOpen;
    document.body.style.overflow = this.isSidebarOpen ? 'hidden' : '';
  }


  addContext(channelEl: HTMLSelectElement, titleEl: HTMLInputElement, noteEl: HTMLTextAreaElement) {
    const source = channelEl.value.trim();
    const title = titleEl.value.trim();
    const summary = noteEl.value.trim();
    if (!source || (!title && !summary)) return;
    this.contextItems.unshift({
      source,
      title: title || `${source} context`,
      summary: summary || 'Context added.',
      time: 'just now'
    });
    titleEl.value = '';
    noteEl.value = '';
    channelEl.selectedIndex = 0;
  }

  removeContext(index: number) {
    this.contextItems.splice(index, 1);
  }

  async sendChat() {
    const prompt = this.chatInput.trim();
    if (!prompt || this.chatIsLoading) return;

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    this.chatMessages.push({
      role: 'user',
      name: 'You',
      content: prompt,
      time: now
    });
    this.chatInput = '';
    this.chatIsLoading = true;
    this.chatError = '';

    try {
      const contextBlock = this.contextItems.length
        ? '\nContext:\n' + this.contextItems
          .map((item, idx) => `${idx + 1}. [${item.source}] ${item.title} — ${item.summary}`)
          .join('\n')
        : '';

      const messages = [
        { role: 'system', content: `${this.systemPrompt}${contextBlock}` },
        ...this.chatMessages.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        }))
      ];

      const response = await fetch(`${this.llmBaseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.llmModel,
          messages,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`LLM request failed: ${response.status}`);
      }

      const data = await response.json();
      const content = data?.message?.content || data?.response || 'No response received.';

      this.chatMessages.push({
        role: 'assistant',
        name: 'Sentinent Core',
        content: content.trim(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    } catch (error) {
      this.chatError = 'Unable to reach the local LLM. Check that it is running and CORS is enabled.';
      this.chatMessages.push({
        role: 'assistant',
        name: 'Sentinent Core',
        content: 'I could not reach the local model. Please verify the LLM server is running.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
      console.error(error);
    } finally {
      this.chatIsLoading = false;
    }
  }

  // === Lifecycle ===
  ngOnInit() {
    // Simulate loading
    this.isLoading = true;
    setTimeout(() => {
      this.isLoading = false;
    }, 800);

    // Load theme
    const savedTheme = localStorage.getItem('theme');
    this.isDarkMode = savedTheme === 'dark';
    if (this.isDarkMode) {
      document.documentElement.classList.add('dark');
    }

    // Load settings and data
    this.loadSettings();
    this.loadFromLocalStorage();
  }

  // === New Decision Modal ===
  openNewDecisionModal() {
    this.showNewDecisionModal = true;
    this.newDecision = {
      title: '',
      problem: '',
      evidence: '',
      options: [''],
      tradeoff: '',
      owner: '',
      confidence: 75,
      impact: ''
    };
  }

  closeNewDecisionModal() {
    this.showNewDecisionModal = false;
  }

  addOption() {
    this.newDecision.options.push('');
  }

  removeOption(index: number) {
    if (this.newDecision.options.length > 1) {
      this.newDecision.options.splice(index, 1);
    }
  }

  saveNewDecision() {
    if (!this.newDecision.title.trim()) {
      this.showNotification('Please enter a decision title', 'error');
      return;
    }

    const decision = {
      title: this.newDecision.title,
      status: 'Proposed',
      owner: this.newDecision.owner || 'Unassigned',
      confidence: this.newDecision.confidence,
      impact: this.newDecision.impact || 'TBD',
      risk: this.newDecision.tradeoff || 'No risks identified'
    };

    this.decisionQueue.unshift(decision);
    this.updateKpis();
    this.showNotification(`Decision "${decision.title}" created successfully`, 'success');
    this.closeNewDecisionModal();
  }

  // === Decision Management ===
  approveDecision(index: number) {
    if (this.decisionQueue[index]) {
      this.decisionQueue[index].status = 'Approved';
      this.showNotification(`Decision approved: ${this.decisionQueue[index].title}`, 'success');
    }
  }

  deleteDecision(index: number) {
    const title = this.decisionQueue[index]?.title;
    this.decisionQueue.splice(index, 1);
    this.updateKpis();
    this.showNotification(`Decision "${title}" deleted`, 'info');
  }

  updateKpis() {
    this.kpis[0].value = String(this.decisionQueue.length);
  }

  // === Search ===
  onSearch(query: string) {
    this.searchQuery = query;
    if (!query.trim()) {
      this.searchResults = [];
      return;
    }

    const q = query.toLowerCase();
    const results: { type: string; title: string; subtitle: string }[] = [];

    // Search decisions
    this.decisionQueue.forEach(d => {
      if (d.title.toLowerCase().includes(q) || d.owner.toLowerCase().includes(q)) {
        results.push({ type: 'Decision', title: d.title, subtitle: `Owner: ${d.owner}` });
      }
    });

    // Search signals
    this.signalStream.forEach(s => {
      if (s.summary.toLowerCase().includes(q) || s.source.toLowerCase().includes(q)) {
        results.push({ type: 'Signal', title: s.source, subtitle: s.summary });
      }
    });

    // Search kanban
    this.kanbanColumns.forEach(col => {
      col.items.forEach(item => {
        if (item.title.toLowerCase().includes(q) || item.assignee.toLowerCase().includes(q)) {
          results.push({ type: 'Kanban', title: item.title, subtitle: `${col.title} • ${item.assignee}` });
        }
      });
    });

    this.searchResults = results.slice(0, 8);
  }

  clearSearch() {
    this.searchQuery = '';
    this.searchResults = [];
  }

  // === Notifications ===
  showNotification(message: string, type: 'success' | 'error' | 'info') {
    this.notifications.push({ message, type });
    setTimeout(() => this.dismissNotification(0), 4000);
  }

  dismissNotification(index: number) {
    this.notifications.splice(index, 1);
  }

  // === Chat Suggestions ===
  useSuggestion(text: string) {
    this.chatInput = text;
    this.sendChat();
  }

  clearChat() {
    this.chatMessages = [];
    this.showNotification('Chat history cleared', 'info');
  }

  exportChat() {
    const content = this.chatMessages.map(m => `[${m.time}] ${m.name}: ${m.content}`).join('\n\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sentinent-chat-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    this.showNotification('Chat exported successfully', 'success');
  }

  // === Kanban Drag & Drop ===
  onDragStart(event: DragEvent, card: any, columnTitle: string) {
    this.draggedCard = card;
    this.draggedFromColumn = columnTitle;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onDragOver(event: DragEvent, columnTitle: string) {
    event.preventDefault();
    this.dragOverColumn = columnTitle;
  }

  onDragLeave() {
    this.dragOverColumn = '';
  }

  onDrop(event: DragEvent, targetColumnTitle: string) {
    event.preventDefault();
    this.dragOverColumn = '';

    if (!this.draggedCard || this.draggedFromColumn === targetColumnTitle) {
      return;
    }

    // Remove from source column
    const sourceCol = this.kanbanColumns.find(c => c.title === this.draggedFromColumn);
    if (sourceCol) {
      const cardIndex = sourceCol.items.findIndex(i => i.title === this.draggedCard.title);
      if (cardIndex > -1) {
        sourceCol.items.splice(cardIndex, 1);
      }
    }

    // Add to target column
    const targetCol = this.kanbanColumns.find(c => c.title === targetColumnTitle);
    if (targetCol) {
      targetCol.items.push(this.draggedCard);
    }

    this.showNotification(`Moved "${this.draggedCard.title}" to ${targetColumnTitle}`, 'success');
    this.draggedCard = null;
    this.draggedFromColumn = '';
  }

  // === Automation Toggles ===
  toggleAutomation(index: number) {
    const rule = this.automationRules[index];
    rule.status = rule.status === 'On' ? 'Paused' : 'On';
    this.showNotification(`Automation "${rule.title}" is now ${rule.status}`, 'info');
  }

  // === Settings Persistence ===
  toggleSetting(index: number) {
    this.settings[index].enabled = !this.settings[index].enabled;
    this.saveSettings();
    this.showNotification(
      `${this.settings[index].title} ${this.settings[index].enabled ? 'enabled' : 'disabled'}`,
      'info'
    );
  }

  saveSettings() {
    localStorage.setItem('sentinent-settings', JSON.stringify(this.settings));
  }

  loadSettings() {
    const saved = localStorage.getItem('sentinent-settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          this.settings = parsed;
        }
      } catch (e) {
        console.error('Failed to load settings:', e);
      }
    }
  }

  // === Sprint Management ===
  updateSprintStatus(index: number, status: string) {
    if (this.sprintBacklog[index]) {
      this.sprintBacklog[index].status = status;
      this.showNotification(`Updated "${this.sprintBacklog[index].title}" to ${status}`, 'info');
    }
  }

  // === Integration Management ===
  toggleIntegration(index: number) {
    const integration = this.integrations[index];
    if (integration.status === 'Connected') {
      integration.status = 'Disabled';
    } else if (integration.status === 'Disabled') {
      integration.status = 'Connected';
    }
    this.showNotification(`${integration.name} is now ${integration.status}`, 'info');
  }

  // === Keyboard Shortcuts ===
  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    // Cmd/Ctrl + K = Command Palette
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault();
      this.toggleCommandPalette();
      return;
    }

    // Escape = Close modals
    if (event.key === 'Escape') {
      if (this.showCommandPalette) {
        this.closeCommandPalette();
      } else if (this.showNewDecisionModal) {
        this.closeNewDecisionModal();
      } else if (this.showArchiveModal) {
        this.showArchiveModal = false;
      } else if (this.searchQuery) {
        this.clearSearch();
      }
      return;
    }

    // Command palette navigation
    if (this.showCommandPalette) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.selectedCommandIndex = Math.min(this.selectedCommandIndex + 1, this.commandResults.length - 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.selectedCommandIndex = Math.max(this.selectedCommandIndex - 1, 0);
      } else if (event.key === 'Enter' && this.commandResults.length > 0) {
        event.preventDefault();
        this.executeCommand(this.selectedCommandIndex);
      }
    }

    // / = Focus search
    if (event.key === '/' && !this.isInputFocused()) {
      event.preventDefault();
      const searchInput = document.querySelector('.app-search input') as HTMLInputElement;
      if (searchInput) searchInput.focus();
    }
  }

  isInputFocused(): boolean {
    const active = document.activeElement;
    return active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA';
  }

  // === Command Palette ===
  toggleCommandPalette() {
    this.showCommandPalette = !this.showCommandPalette;
    if (this.showCommandPalette) {
      this.commandQuery = '';
      this.updateCommandResults();
      this.selectedCommandIndex = 0;
      setTimeout(() => {
        const input = document.querySelector('.app-cmd-input') as HTMLInputElement;
        if (input) input.focus();
      }, 50);
    }
  }

  closeCommandPalette() {
    this.showCommandPalette = false;
    this.commandQuery = '';
    this.commandResults = [];
  }

  updateCommandResults() {
    const q = this.commandQuery.toLowerCase();
    const allCommands = [
      { icon: '📥', label: 'Go to Inbox', action: () => this.setView('inbox') },
      { icon: '💬', label: 'Go to Chat', action: () => this.setView('chat') },
      { icon: '📋', label: 'Go to Kanban', action: () => this.setView('kanban') },
      { icon: '🏃', label: 'Go to Sprints', action: () => this.setView('sprints') },
      { icon: '⚡', label: 'Go to Automations', action: () => this.setView('automations') },
      { icon: '🔗', label: 'Go to Integrations', action: () => this.setView('integrations') },
      { icon: '📊', label: 'Go to Reports', action: () => this.setView('reports') },
      { icon: '⚙️', label: 'Go to Settings', action: () => this.setView('settings') },
      { icon: '➕', label: 'New Decision', action: () => this.openNewDecisionModal() },
      { icon: '🌙', label: 'Toggle Dark Mode', action: () => this.toggleTheme() },
      { icon: '📦', label: 'View Archive', action: () => this.openArchiveModal() },
      { icon: '📤', label: 'Export Decisions to CSV', action: () => this.exportDecisionsCSV() },
      { icon: '🗑️', label: 'Clear Chat History', action: () => this.clearChat() },
    ];

    this.commandResults = q
      ? allCommands.filter(c => c.label.toLowerCase().includes(q))
      : allCommands;
    this.selectedCommandIndex = 0;
  }

  executeCommand(index: number) {
    if (this.commandResults[index]) {
      this.commandResults[index].action();
      this.closeCommandPalette();
    }
  }

  // === Theme Persistence ===
  toggleTheme() {
    this.isDarkMode = !this.isDarkMode;
    if (this.isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
    this.showNotification(`Switched to ${this.isDarkMode ? 'dark' : 'light'} mode`, 'info');
  }

  // === Decision Archive ===
  openArchiveModal() {
    this.showArchiveModal = true;
  }

  archiveDecision(index: number) {
    const decision = this.decisionQueue[index];
    if (decision) {
      this.archivedDecisions.push({ ...decision, archivedAt: new Date().toISOString() });
      this.decisionQueue.splice(index, 1);
      this.updateKpis();
      this.saveToLocalStorage();
      this.showNotification(`"${decision.title}" archived`, 'info');
    }
  }

  restoreDecision(index: number) {
    const decision = this.archivedDecisions[index];
    if (decision) {
      delete decision.archivedAt;
      this.decisionQueue.push(decision);
      this.archivedDecisions.splice(index, 1);
      this.updateKpis();
      this.saveToLocalStorage();
      this.showNotification(`"${decision.title}" restored`, 'success');
    }
  }

  // === Export ===
  exportDecisionsCSV() {
    const headers = ['Title', 'Status', 'Owner', 'Confidence', 'Impact', 'Risk'];
    const rows = this.decisionQueue.map(d => [
      d.title, d.status, d.owner, d.confidence, d.impact, d.risk
    ].map(v => `"${v}"`).join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `decisions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.showNotification('Decisions exported to CSV', 'success');
  }

  // === Local Storage Persistence ===
  saveToLocalStorage() {
    localStorage.setItem('sentinent-decisions', JSON.stringify(this.decisionQueue));
    localStorage.setItem('sentinent-archive', JSON.stringify(this.archivedDecisions));
  }

  loadFromLocalStorage() {
    try {
      const decisions = localStorage.getItem('sentinent-decisions');
      const archive = localStorage.getItem('sentinent-archive');
      if (decisions) this.decisionQueue = JSON.parse(decisions);
      if (archive) this.archivedDecisions = JSON.parse(archive);
    } catch (e) {
      console.error('Failed to load from localStorage:', e);
    }
  }

  // === View Transition Helper ===
  setView(view: 'chat' | 'inbox' | 'kanban' | 'sprints' | 'automations' | 'integrations' | 'reports' | 'settings') {
    this.currentView = view;
    this.isSidebarOpen = false;
    document.body.style.overflow = '';
  }

  // === Cleanup ===
  ngOnDestroy() {
    // Cleanup if needed
  }
}
