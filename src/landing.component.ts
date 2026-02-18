import { Component, AfterViewInit, OnDestroy } from '@angular/core';
import emailjs from '@emailjs/browser';

@Component({
  selector: 'app-landing',
  standalone: true,
  templateUrl: './landing.component.html',
  styleUrls: []
})
export class LandingComponent implements AfterViewInit, OnDestroy {
  botResponses: Record<string, string> = {
    "Capture a decision from this Slack thread": "Decision object created: **Delay Feature X rollout**.\n\n**Signals detected:**\n- Retention trend down 9% week-over-week.\n- 17 customer complaints tied to onboarding friction.\n\n**Assumption captured:**\n- Feature X will improve retention for SMB users.\n\n**Success criteria:**\n- SMB week-4 retention recovers to >= 42% within 30 days.\n\nDo you want to move this to owner review?",
    "What changed this week that matters?": "Weekly synthesis complete.\n\n**Top changes:**\n1. Onboarding friction mentions increased 12% among SMB accounts.\n2. API throttling complaints appeared in 3 enterprise expansion deals.\n3. PR review wait time increased from 9h to 16h.\n\n**Recommendation:** trigger investigation for onboarding and elevate API reliability decision.",
    "Check assumptions from the pricing decision": "Assumption review complete for **Pricing Increase - Q1**.\n\n**Tracked assumption:** conversion rate impact will be <= 2%.\n**Observed outcome:** conversion dropped **8%** after rollout.\n\nStatus: **Assumption invalidated**.\n\nRecommended action: re-open decision and run rollback simulation."
  };

  demoQueries = [
    "Capture a decision from this Slack thread",
    "What changed this week that matters?",
    "Check assumptions from the pricing decision"
  ];
  currentDemoIndex = 0;
  isDemoRunning = false;
  isMobileMenuOpen = false;

  toggleTheme() {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem(
      'theme',
      document.documentElement.classList.contains('dark') ? 'dark' : 'light'
    );
  }

  toggleMobileMenu() {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
    document.body.style.overflow = this.isMobileMenuOpen ? 'hidden' : '';
  }

  openCmd() {
    document.getElementById('cmdOverlay')?.classList.add('active');
    document.getElementById('cmdModal')?.classList.add('active');
    setTimeout(() => (document.getElementById('cmdInput') as HTMLInputElement | null)?.focus(), 100);
  }

  closeCmd() {
    document.getElementById('cmdOverlay')?.classList.remove('active');
    document.getElementById('cmdModal')?.classList.remove('active');
  }

  openDemoModal() {
    document.getElementById('demoOverlay')?.classList.add('active');
    document.getElementById('demoModal')?.classList.add('active');
  }

  closeDemoModal() {
    document.getElementById('demoOverlay')?.classList.remove('active');
    document.getElementById('demoModal')?.classList.remove('active');
  }

  async submitDemoForm(event?: Event) {
    if (event) event.preventDefault();
    const form = (event?.target as HTMLFormElement | null) ?? null;
    const btn = document.querySelector('#demoModal button[type="submit"]') as HTMLButtonElement | null;
    if (!btn || !form) return;
    const originalText = btn.innerText;
    btn.innerText = 'Submitting...';
    btn.disabled = true;

    try {
      const formData = new FormData(form);
      const payload = {
        firstName: String(formData.get('firstName') || ''),
        lastName: String(formData.get('lastName') || ''),
        workEmail: String(formData.get('workEmail') || ''),
        companyName: String(formData.get('companyName') || ''),
        message: String(formData.get('message') || ''),
        time: new Date().toLocaleString()
      };

      // EmailJS Configuration
      const serviceID = 'service_kjyjp9a'; // Provided by user
      const templateID = 'template_uzoyxt6';
      const publicKey = 'zyHYYic3Iz3HmMDXc';

      await emailjs.send(serviceID, templateID, payload, publicKey);

      btn.innerText = 'We will be in touch shortly!';
      form.reset();
      setTimeout(() => {
        this.closeDemoModal();
        btn.innerText = originalText;
        btn.disabled = false;
      }, 2000);
    } catch (error) {
      console.error('EmailJS Error:', error);
      btn.innerText = 'Try again';
      btn.disabled = false;
      setTimeout(() => {
        btn.innerText = originalText;
      }, 2000);
    }
  }

  resetCompiler() {
    const fn = (window as any).resetCompiler;
    if (typeof fn === 'function') fn();
  }

  toggleCompilerPhysics() {
    const fn = (window as any).toggleCompilerPhysics;
    if (typeof fn === 'function') fn();
  }

  handleChatSubmit(input: HTMLInputElement) {
    const text = input.value.trim();
    if (!text) return;
    this.addMessage(text, 'user');
    input.value = '';
    this.processBotResponse(text);
  }

  sendQuickPrompt(text: string) {
    if (this.isDemoRunning) return;
    this.addMessage(text, 'user');
    this.processBotResponse(text);
  }

  addMessage(text: string, sender: 'user' | 'bot') {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    const div = document.createElement('div');
    div.className = 'flex gap-4 chat-message';

    if (sender === 'user') {
      div.innerHTML = `
        <div class="ml-auto flex gap-4 flex-row-reverse max-w-[100%]">
            <div class="w-8 h-8 rounded-full bg-[var(--subtle)] border border-[var(--border)] flex items-center justify-center flex-shrink-0 font-mono text-xs font-bold">YOU</div>
            <div class="space-y-1">
                <div class="bg-[var(--fg)] text-[var(--bg)] px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed">
                    ${text}
                </div>
            </div>
        </div>
      `;
    } else {
      div.innerHTML = `
        <div class="w-8 h-8 rounded-lg bg-[var(--fg)] flex items-center justify-center flex-shrink-0">
             <svg width="14" height="14" viewBox="0 0 32 32" fill="var(--bg)">
                <rect x="4" y="6" width="20" height="8" rx="1.5" />
                <rect x="8" y="18" width="20" height="8" rx="1.5" />
            </svg>
        </div>
        <div class="space-y-2 max-w-[100%]">
            <div class="text-xs font-mono text-[var(--muted)] uppercase">Sentinent</div>
            <div class="text-[var(--fg)] leading-relaxed typing-cursor" id="typingText-${Date.now()}"></div>
        </div>
      `;
    }

    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return div;
  }

  processBotResponse(inputText: string) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    // Show typing indicator
    const typingDiv = document.createElement('div');
    typingDiv.className = 'flex gap-4 chat-message';
    typingDiv.innerHTML = `
        <div class="w-8 h-8 rounded-lg bg-[var(--fg)] flex items-center justify-center flex-shrink-0">
             <svg width="14" height="14" viewBox="0 0 32 32" fill="var(--bg)">
                <rect x="4" y="6" width="20" height="8" rx="1.5" />
                <rect x="8" y="18" width="20" height="8" rx="1.5" />
            </svg>
        </div>
        <div class="flex items-center gap-2 text-[var(--muted)] text-xs font-mono">
            <span class="w-2 h-2 bg-[var(--brand)] rounded-full animate-pulse"></span>
            Running autonomous agent loop...
        </div>
    `;
    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    setTimeout(() => {
      typingDiv.remove();
      const response = this.botResponses[inputText] || "No decision could be created yet. Connect Slack, Jira, and metrics so I can validate evidence and assumptions.";
      const msgDiv = this.addMessage('', 'bot');
      const textContainer = msgDiv?.querySelector('.typing-cursor') as HTMLElement;
      if (textContainer) this.typeWriter(textContainer, response);
    }, 1500);
  }

  typeWriter(element: HTMLElement, text: string, i = 0) {
    if (i < text.length) {
      if (text.charAt(i) === '\n') {
        element.innerHTML += '<br>';
      } else {
        element.innerHTML += text.charAt(i);
      }
      const chatMessages = document.getElementById('chatMessages');
      if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
      setTimeout(() => this.typeWriter(element, text, i + 1), 20);
    } else {
      element.classList.remove('typing-cursor');
      element.innerHTML = element.innerHTML.replace(/\*\*(.*?)\*\*/g, '<strong class="text-[var(--fg)]">$1</strong>');
    }
  }

  runAutomatedDemo() {
    if (this.isDemoRunning || this.currentDemoIndex >= this.demoQueries.length) return;

    this.isDemoRunning = true;
    const query = this.demoQueries[this.currentDemoIndex];

    const chatInput = document.querySelector('input[placeholder="Submit signal or trigger an agent run..."]') as HTMLInputElement;
    if (!chatInput) return;

    chatInput.value = '';
    chatInput.focus();

    let charIndex = 0;
    const typeInterval = setInterval(() => {
      if (charIndex < query.length) {
        chatInput.value += query.charAt(charIndex);
        charIndex++;
      } else {
        clearInterval(typeInterval);
        setTimeout(() => {
          this.sendQuickPrompt(query);
          this.currentDemoIndex++;
          this.isDemoRunning = false;

          setTimeout(() => {
            if (this.currentDemoIndex < this.demoQueries.length) {
              this.runAutomatedDemo();
            }
          }, 8000);
        }, 500);
      }
    }, 50);
  }

  ngAfterViewInit() {
    document.body.classList.add('landing-cursor-enabled');

    if (localStorage.getItem('theme') === 'dark') {
      document.documentElement.classList.add('dark');
    }

    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        this.openCmd();
      }
      if (e.key === 'Escape') {
        this.closeCmd();
        this.closeDemoModal();
      }
    });

    const cursorDot = document.querySelector('.cursor-dot') as HTMLElement | null;
    const cursorOutline = document.querySelector('.cursor-outline') as HTMLElement | null;
    window.addEventListener('mousemove', (e) => {
      if (!cursorDot || !cursorOutline) return;
      const posX = e.clientX, posY = e.clientY;
      cursorDot.style.left = `${posX}px`;
      cursorDot.style.top = `${posY}px`;
      cursorOutline.animate({ left: `${posX}px`, top: `${posY}px` }, { duration: 500, fill: 'forwards' });
    });

    document.querySelectorAll('a, button, .decision-object').forEach((el) => {
      el.addEventListener('mouseenter', () => document.body.classList.add('hovering'));
      el.addEventListener('mouseleave', () => document.body.classList.remove('hovering'));
    });

    class TextScramble {
      el: HTMLElement;
      chars = '!<>-_\\/[]{}=+*^?#________';
      queue: { from: string; to: string; start: number; end: number; char?: string }[] = [];
      frame = 0;
      frameRequest = 0;
      constructor(el: HTMLElement) { this.el = el; this.update = this.update.bind(this); }
      setText(newText: string) {
        const oldText = this.el.innerText;
        const length = Math.max(oldText.length, newText.length);
        this.queue = [];
        for (let i = 0; i < length; i++) {
          const from = oldText[i] || '';
          const to = newText[i] || '';
          const start = Math.floor(Math.random() * 20);
          const end = start + Math.floor(Math.random() * 20);
          this.queue.push({ from, to, start, end });
        }
        cancelAnimationFrame(this.frameRequest);
        this.frame = 0;
        this.update();
      }
      update() {
        let output = '';
        let complete = 0;
        for (let i = 0, n = this.queue.length; i < n; i++) {
          let { from, to, start, end, char } = this.queue[i];
          if (this.frame >= end) {
            complete++;
            output += to;
          } else if (this.frame >= start) {
            if (!char || Math.random() < 0.28) {
              char = this.randomChar();
              this.queue[i].char = char;
            }
            output += `<span class="text-[var(--muted)]">${char}</span>`;
          } else {
            output += from;
          }
        }
        this.el.innerHTML = output;
        if (complete !== this.queue.length) {
          this.frameRequest = requestAnimationFrame(this.update);
          this.frame++;
        }
      }
      randomChar() { return this.chars[Math.floor(Math.random() * this.chars.length)]; }
    }

    const scrambleEl = document.getElementById('scrambleText');
    if (scrambleEl) {
      const fx = new TextScramble(scrambleEl);
      setTimeout(() => fx.setText('Decision Compiler'), 500);
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          (e.target as HTMLElement).classList.add('visible');
          if (e.target.querySelector('#chatMessages') && this.currentDemoIndex === 0) {
            setTimeout(() => this.runAutomatedDemo(), 2000);
          }
          observer.unobserve(e.target);
        }
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));


const parallaxItems = Array.from(document.querySelectorAll<HTMLElement>('[data-parallax]'));
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
if (parallaxItems.length && !reducedMotionQuery.matches) {
  let ticking = false;
  const maxShift = 36;
  const updateParallax = () => {
    const viewportCenter = window.innerHeight / 2;
    parallaxItems.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const speed = Number.parseFloat(el.dataset.speed || '0.12');
      const offset = rect.top + rect.height / 2 - viewportCenter;
      const translate = Math.max(-maxShift, Math.min(maxShift, -offset * speed));
      el.style.setProperty('--parallax-offset', `${translate}px`);
    });
    ticking = false;
  };
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(updateParallax);
  };
  updateParallax();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
}

function setupCanvas(canvasId: string) {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const resize = () => {
    const parent = canvas.parentElement as HTMLElement;
    if (!parent) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = parent.clientWidth * dpr;
    canvas.height = parent.clientHeight * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    canvas.style.width = `${parent.clientWidth}px`;
    canvas.style.height = `${parent.clientHeight}px`;
  };
  resize();
  window.addEventListener('resize', resize);
  return { canvas, ctx, width: () => canvas.parentElement?.clientWidth || 0, height: () => canvas.parentElement?.clientHeight || 0 };
}

function drawObjectDiagram() {
  const setup = setupCanvas('objectCanvas');
  if (!setup) return;
  const { ctx, width, height } = setup;
  let frame = 0;
  function draw() {
    const w = width(), h = height();
    ctx.clearRect(0, 0, w, h);
    const fg = getComputedStyle(document.documentElement).getPropertyValue('--fg').trim();
    const border = getComputedStyle(document.documentElement).getPropertyValue('--border').trim();
    const subtle = getComputedStyle(document.documentElement).getPropertyValue('--subtle').trim();
    const boxW = Math.min(280, w - 40);
    const boxH = 200;
    const x = (w - boxW) / 2, y = (h - boxH) / 2;
    ctx.fillStyle = subtle;
    ctx.fillRect(x + 4, y + 4, boxW, boxH);
    ctx.strokeStyle = Math.floor(frame / 30) % 2 === 0 ? fg : border;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, boxW, boxH);
    ctx.fillStyle = fg;
    ctx.fillRect(x, y, boxW, 30);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('DECISION OBJECT', x + 10, y + 20);
    const sections = ['Problem', 'Options [A][B][C]', 'Evidence Map', 'Tradeoff Ack'];
    ctx.fillStyle = fg;
    ctx.font = '12px "Space Grotesk", sans-serif';
    sections.forEach((sec, i) => {
      const sy = y + 50 + i * 35;
      ctx.fillStyle = subtle;
      ctx.fillRect(x + 10, sy, boxW - 20, 25);
      ctx.fillStyle = fg;
      ctx.fillText(sec, x + 15, sy + 17);
      if (i < sections.length - 1) {
        ctx.strokeStyle = border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + boxW / 2, sy + 25);
        ctx.lineTo(x + boxW / 2, sy + 35);
        ctx.stroke();
      }
    });
    frame++;
    requestAnimationFrame(draw);
  }
  draw();
}

function drawTradeoffDiagram() {
  const setup = setupCanvas('tradeoffCanvas');
  if (!setup) return;
  const { ctx, width, height } = setup;
  let time = 0;
  function draw() {
    const w = width(), h = height();
    ctx.clearRect(0, 0, w, h);
    const fg = getComputedStyle(document.documentElement).getPropertyValue('--fg').trim();
    const border = getComputedStyle(document.documentElement).getPropertyValue('--border').trim();
    const cx = w / 2, cy = h / 2;
    const size = Math.min(100, w / 4, h / 4);
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy - size - 20);
    ctx.lineTo(cx, cy + size + 20);
    ctx.moveTo(cx - size - 20, cy);
    ctx.lineTo(cx + size + 20, cy);
    ctx.stroke();
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(cx - size, cy - size);
    ctx.lineTo(cx + size, cy + size);
    ctx.moveTo(cx + size, cy - size);
    ctx.lineTo(cx - size, cy + size);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = fg;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('HIGH IMPACT', cx, cy - size - 10);
    ctx.fillText('LOW COST', cx + size + 35, cy);
    ctx.fillText('HIGH COST', cx - size - 35, cy);
    ctx.fillText('LOW IMPACT', cx, cy + size + 10);
    const options = [
      { x: cx - 40, y: cy - 60, label: 'A', phase: 0 },
      { x: cx + 60, y: cy - 20, label: 'B', phase: 2 },
      { x: cx - 20, y: cy + 40, label: 'C', phase: 4 }
    ];
    options.forEach(opt => {
      const pulse = Math.sin((time + opt.phase) * 0.05) * 3;
      ctx.beginPath();
      ctx.arc(opt.x, opt.y, 6 + pulse, 0, Math.PI * 2);
      ctx.fillStyle = fg;
      ctx.fill();
      ctx.fillText(opt.label, opt.x, opt.y - 15);
    });
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.sin(time * 0.02) * 0.1);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 2;
    ctx.strokeRect(-8, -4, 16, 12);
    ctx.beginPath();
    ctx.arc(0, -4, 6, Math.PI, 0);
    ctx.stroke();
    ctx.restore();
    time++;
    requestAnimationFrame(draw);
  }
  draw();
}

function drawOutcomeDiagram() {
  const setup = setupCanvas('outcomeCanvas');
  if (!setup) return;
  const { ctx, width, height } = setup;
  let time = 0;
  function draw() {
    const w = width(), h = height();
    ctx.clearRect(0, 0, w, h);
    const fg = getComputedStyle(document.documentElement).getPropertyValue('--fg').trim();
    const border = getComputedStyle(document.documentElement).getPropertyValue('--border').trim();
    const red = '#ef4444';
    const y = h / 2;
    const padding = 60;
    const startX = padding;
    const endX = w - padding;
    ctx.strokeStyle = border;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
    ctx.stroke();
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(startX, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('DECISION', startX, y - 15);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 1;
    const arrowY = y - 20;
    ctx.beginPath();
    ctx.moveTo(startX + 20, arrowY);
    ctx.lineTo(endX - 20, arrowY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(endX - 25, arrowY - 3);
    ctx.lineTo(endX - 20, arrowY);
    ctx.lineTo(endX - 25, arrowY + 3);
    ctx.stroke();
    const pulse = (Math.sin(time * 0.05) + 1) / 2;
    ctx.fillStyle = red;
    ctx.globalAlpha = 0.3 + pulse * 0.7;
    ctx.beginPath();
    ctx.arc(endX, y, 10 + pulse * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = red;
    ctx.beginPath();
    ctx.arc(endX, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textBaseline = 'bottom';
    ctx.fillText('OUTCOME', endX, y - 15);
    ctx.textBaseline = 'top';
    ctx.fillText('-12% vs expected', endX, y + 15);
    ctx.strokeStyle = red;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(endX - 10, y + 25);
    ctx.quadraticCurveTo((startX + endX) / 2, y + 100, startX + 10, y + 25);
    ctx.stroke();
    ctx.setLineDash([]);
    const midX = (startX + endX) / 2;
    ctx.beginPath();
    ctx.moveTo(midX - 5, y + 95);
    ctx.lineTo(midX, y + 100);
    ctx.lineTo(midX + 5, y + 95);
    ctx.stroke();
    ctx.fillStyle = red;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('TRUTH SIGNAL', midX, y + 105);
    time++;
    requestAnimationFrame(draw);
  }
  draw();
}

function drawQualityDiagram() {
  const setup = setupCanvas('qualityCanvas');
  if (!setup) return;
  const { ctx, width, height } = setup;
  let rotation = 0;
  function draw() {
    const w = width(), h = height();
    ctx.clearRect(0, 0, w, h);
    const fg = getComputedStyle(document.documentElement).getPropertyValue('--fg').trim();
    const border = getComputedStyle(document.documentElement).getPropertyValue('--border').trim();
    const cx = w / 2, cy = h / 2;
    const radius = Math.min(80, w / 3, h / 3);
    const axes = ['Evidence', 'Diversity', 'Clarity', 'Assumptions', 'Outcome'];
    const values = [0.8, 0.4, 0.9, 0.3, 0.7];
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath();
      const r = (radius / 4) * i;
      for (let j = 0; j < 5; j++) {
        const angle = (Math.PI * 2 / 5) * j - Math.PI / 2;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.strokeStyle = border;
    for (let j = 0; j < 5; j++) {
      const angle = (Math.PI * 2 / 5) * j - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      ctx.stroke();
      ctx.fillStyle = fg;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const labelR = radius + 20;
      const lx = cx + Math.cos(angle) * labelR;
      const ly = cy + Math.sin(angle) * labelR;
      ctx.fillText(axes[j], lx, ly);
    }
    ctx.fillStyle = fg;
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    for (let j = 0; j < 5; j++) {
      const angle = (Math.PI * 2 / 5) * j - Math.PI / 2 + rotation;
      const r = radius * values[j];
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = fg;
    ctx.lineWidth = 2;
    ctx.stroke();
    for (let j = 0; j < 5; j++) {
      const angle = (Math.PI * 2 / 5) * j - Math.PI / 2 + rotation;
      const r = radius * values[j];
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    rotation += 0.005;
    requestAnimationFrame(draw);
  }
  draw();
}

const diagramObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      const target = e.target as HTMLElement;
      if (target.querySelector('#objectCanvas')) drawObjectDiagram();
      if (target.querySelector('#tradeoffCanvas')) drawTradeoffDiagram();
      if (target.querySelector('#outcomeCanvas')) drawOutcomeDiagram();
      if (target.querySelector('#qualityCanvas')) drawQualityDiagram();
      diagramObserver.unobserve(target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.canvas-container').forEach(el => diagramObserver.observe(el));

const compilerCanvas = document.getElementById('compilerCanvas') as HTMLCanvasElement | null;
const compilerCtx = compilerCanvas?.getContext('2d');
if (!compilerCanvas || !compilerCtx) return;
let compilerWidth: number, compilerHeight: number;
let compilerPhysicsEnabled = true;

function resizeCompiler() {
  const container = document.getElementById('compilerContainer') as HTMLElement | null;
  if (!container) return;
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (!width || !height) return;
  const dpr = window.devicePixelRatio || 1;
  compilerWidth = compilerCanvas.width = width * dpr;
  compilerHeight = compilerCanvas.height = height * dpr;
  compilerCanvas.style.width = `${width}px`;
  compilerCanvas.style.height = `${height}px`;
  compilerCtx.setTransform(1, 0, 0, 1, 0, 0);
  compilerCtx.scale(dpr, dpr);
  layoutStages();
}

window.addEventListener('resize', resizeCompiler);
const compilerContainer = document.getElementById('compilerContainer') as HTMLElement | null;
if (compilerContainer) {
  const resizeObserver = new ResizeObserver(() => resizeCompiler());
  resizeObserver.observe(compilerContainer);
}
if ((document as any).fonts?.ready) {
  (document as any).fonts.ready.then(() => resizeCompiler());
}

type StageType = 'input' | 'process' | 'output';
type Stage = {
  id: string;
  label: string;
  xRatio: number;
  yRatio: number;
  color: string;
  type: StageType;
  processing: number;
  x: number;
  y: number;
};

type Source = {
  id: string;
  label: string;
  stage: number;
  yOffset: number;
  x: number;
  y: number;
};

const stages: Stage[] = [
  { id: 'ingest', label: 'Signal Ingestion', xRatio: 0.15, yRatio: 0.4, color: '#3b82f6', type: 'input', processing: 0, x: 0, y: 0 },
  { id: 'norm', label: 'Normalization\nLLM #1', xRatio: 0.28, yRatio: 0.4, color: '#8b5cf6', type: 'process', processing: 0, x: 0, y: 0 },
  { id: 'problem', label: 'Problem Hypothesis\nLLM #2', xRatio: 0.41, yRatio: 0.4, color: '#a855f7', type: 'process', processing: 0, x: 0, y: 0 },
  { id: 'options', label: 'Option Generation\nLLM #3', xRatio: 0.54, yRatio: 0.4, color: '#c084fc', type: 'process', processing: 0, x: 0, y: 0 },
  { id: 'tradeoff', label: 'Tradeoff Engine\nLLM #4', xRatio: 0.67, yRatio: 0.4, color: '#d946ef', type: 'process', processing: 0, x: 0, y: 0 },
  { id: 'simulate', label: 'Outcome Simulation\nLLM #5', xRatio: 0.80, yRatio: 0.4, color: '#e879f9', type: 'process', processing: 0, x: 0, y: 0 },
  { id: 'decision', label: 'Decision Object', xRatio: 0.93, yRatio: 0.4, color: 'var(--fg)', type: 'output', processing: 0, x: 0, y: 0 }
];

const sources: Source[] = [
  { id: 'slack', label: 'Slack', stage: 0, yOffset: -80, x: 0, y: 0 },
  { id: 'jira', label: 'Jira', stage: 0, yOffset: -40, x: 0, y: 0 },
  { id: 'zendesk', label: 'Zendesk', stage: 0, yOffset: 0, x: 0, y: 0 },
  { id: 'email', label: 'Email', stage: 0, yOffset: 40, x: 0, y: 0 },
  { id: 'docs', label: 'Docs', stage: 0, yOffset: 80, x: 0, y: 0 }
];

let containerRect = (document.getElementById('compilerContainer') as HTMLElement).getBoundingClientRect();

function layoutStages() {
  const container = document.getElementById('compilerContainer') as HTMLElement | null;
  if (!container) return;
  containerRect = container.getBoundingClientRect();
  stages.forEach(stage => {
    stage.x = containerRect.width * stage.xRatio;
    stage.y = containerRect.height * stage.yRatio;
  });
  sources.forEach(src => {
    src.x = stages[0].x - 60;
    src.y = stages[0].y + src.yOffset;
  });
}

requestAnimationFrame(() => resizeCompiler());

class SignalParticle {
  x = 0;
  y = 0;
  stage = 0;
  progress = 0;
  speed = 0.01 + Math.random() * 0.01;
  processed = false;
  approved = false;
  constructor() {
    this.reset();
  }
  reset() {
    const source = sources[Math.floor(Math.random() * sources.length)];
    this.x = source.x;
    this.y = source.y;
    this.stage = 0;
    this.progress = 0;
    this.speed = 0.01 + Math.random() * 0.01;
    this.processed = false;
    this.approved = false;
  }
  update() {
    if (this.approved) {
      this.y += (containerRect.height * 0.8 - this.y) * 0.05;
      if (Math.abs(this.y - containerRect.height * 0.8) < 5) this.reset();
      return;
    }
    const targetStage = stages[this.stage + 1] || stages[stages.length - 1];
    if (!this.processed) {
      const dx = targetStage.x - this.x;
      const dy = targetStage.y - this.y;
      this.x += dx * this.speed;
      this.y += dy * this.speed;
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        this.stage++;
        this.processed = true;
        targetStage.processing++;
        setTimeout(() => {
          this.processed = false;
          targetStage.processing--;
          if (this.stage >= stages.length - 1) {
            this.approved = true;
            this.y += 30;
          }
        }, 1000 + Math.random() * 1000);
      }
    }
  }
  draw(ctx: CanvasRenderingContext2D) {
    const fg = getComputedStyle(document.documentElement).getPropertyValue('--fg').trim();
    if (this.stage === 0) {
      ctx.fillStyle = '#3b82f6';
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.stage < stages.length - 1) {
      const stageColor = stages[this.stage].color;
      ctx.fillStyle = stageColor;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = stageColor;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(stages[this.stage].x, stages[this.stage].y);
      ctx.stroke();
    } else {
      ctx.fillStyle = fg;
      ctx.globalAlpha = 1;
      const size = 6;
      ctx.fillRect(this.x - size, this.y - size, size * 2, size * 2);
      if (this.approved) {
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x - size - 2, this.y - size - 2, size * 2 + 4, size * 2 + 4);
      }
    }
    ctx.globalAlpha = 1;
  }
}

const particles: SignalParticle[] = [];
for (let i = 0; i < 30; i++) {
  setTimeout(() => particles.push(new SignalParticle()), i * 200);
}

class FeedbackParticle {
  x = 0;
  y = 0;
  progress = 0;
  active = false;
  reset() {
    this.x = stages[stages.length - 1].x;
    this.y = containerRect.height * 0.8;
    this.progress = 0;
    this.active = false;
  }
  start() { this.active = true; this.progress = 0; }
  update() {
    if (!this.active) {
      if (Math.random() < 0.01) this.start();
      return;
    }
    this.progress += 0.005;
    const t = this.progress;
    const startX = stages[stages.length - 1].x;
    const startY = containerRect.height * 0.8;
    const endX = stages[0].x;
    const endY = stages[0].y;
    const ctrlX = (startX + endX) / 2;
    const ctrlY = startY + 100;
    this.x = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * ctrlX + t * t * endX;
    this.y = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * ctrlY + t * t * endY;
    if (this.progress >= 1) this.reset();
  }
  draw(ctx: CanvasRenderingContext2D) {
    if (!this.active) return;
    ctx.fillStyle = '#ef4444';
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y - 4);
    ctx.lineTo(this.x + 4, this.y + 4);
    ctx.lineTo(this.x - 4, this.y + 4);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

const feedbackParticles = [new FeedbackParticle(), new FeedbackParticle(), new FeedbackParticle()];

function drawCompiler() {
  const container = document.getElementById('compilerContainer') as HTMLElement | null;
  if (container) {
    const rect = container.getBoundingClientRect();
    if (rect.width !== containerRect.width || rect.height !== containerRect.height) {
      resizeCompiler();
    }
  }
  const w = containerRect.width;
  const h = containerRect.height;
  const fg = getComputedStyle(document.documentElement).getPropertyValue('--fg').trim();
  const border = getComputedStyle(document.documentElement).getPropertyValue('--border').trim();
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();

  compilerCtx.clearRect(0, 0, w, h);

  compilerCtx.strokeStyle = border;
  compilerCtx.lineWidth = 2;
  compilerCtx.setLineDash([5, 5]);
  compilerCtx.beginPath();
  for (let i = 0; i < stages.length - 1; i++) {
    compilerCtx.moveTo(stages[i].x, stages[i].y);
    compilerCtx.lineTo(stages[i + 1].x, stages[i + 1].y);
  }
  compilerCtx.stroke();
  compilerCtx.setLineDash([]);

  sources.forEach(src => {
    compilerCtx.fillStyle = '#3b82f6';
    compilerCtx.globalAlpha = 0.2;
    compilerCtx.beginPath();
    compilerCtx.arc(src.x, src.y, 8, 0, Math.PI * 2);
    compilerCtx.fill();
    compilerCtx.globalAlpha = 1;
    compilerCtx.fillStyle = '#3b82f6';
    compilerCtx.font = '10px "JetBrains Mono", monospace';
    compilerCtx.textAlign = 'right';
    compilerCtx.fillText(src.label, src.x - 12, src.y + 3);
  });

  stages.forEach((stage, i) => {
    const isOutput = stage.type === 'output';
    const size = isOutput ? 20 : 15;
    if (stage.processing > 0) {
      compilerCtx.fillStyle = stage.color;
      compilerCtx.globalAlpha = 0.2;
      compilerCtx.beginPath();
      compilerCtx.arc(stage.x, stage.y, size + 10, 0, Math.PI * 2);
      compilerCtx.fill();
      compilerCtx.globalAlpha = 1;
    }
    compilerCtx.fillStyle = stage.type === 'output' ? fg : bg;
    compilerCtx.strokeStyle = stage.color;
    compilerCtx.lineWidth = 2;
    if (isOutput) {
      compilerCtx.fillRect(stage.x - size, stage.y - size, size * 2, size * 2);
      compilerCtx.strokeRect(stage.x - size, stage.y - size, size * 2, size * 2);
    } else {
      compilerCtx.beginPath();
      compilerCtx.arc(stage.x, stage.y, size, 0, Math.PI * 2);
      compilerCtx.fill();
      compilerCtx.stroke();
    }
    compilerCtx.fillStyle = stage.type === 'output' ? bg : fg;
    compilerCtx.font = `bold ${isOutput ? 12 : 10}px "JetBrains Mono", monospace`;
    compilerCtx.textAlign = 'center';
    compilerCtx.textBaseline = 'middle';
    compilerCtx.fillText(isOutput ? 'DO' : String(i), stage.x, stage.y);
    compilerCtx.fillStyle = fg;
    compilerCtx.font = '9px "JetBrains Mono", monospace';
    const lines = stage.label.split('\n');
    lines.forEach((line, idx) => {
      compilerCtx.fillText(line, stage.x, stage.y + size + 15 + (idx * 12));
    });
  });

  const decisionStage = stages[stages.length - 1];
  compilerCtx.fillStyle = '#22c55e';
  compilerCtx.globalAlpha = 0.1;
  compilerCtx.fillRect(decisionStage.x - 30, decisionStage.y + 40, 60, 80);
  compilerCtx.globalAlpha = 1;
  compilerCtx.strokeStyle = '#22c55e';
  compilerCtx.lineWidth = 1;
  compilerCtx.strokeRect(decisionStage.x - 30, decisionStage.y + 40, 60, 80);
  compilerCtx.fillStyle = '#22c55e';
  compilerCtx.font = '9px "JetBrains Mono", monospace';
  compilerCtx.fillText('HUMAN', decisionStage.x, decisionStage.y + 55);
  compilerCtx.fillText('APPROVAL', decisionStage.x, decisionStage.y + 67);
  compilerCtx.fillText('REQUIRED', decisionStage.x, decisionStage.y + 79);

  let signalCount = 0;
  let processingCount = 0;
  let decisionCount = 0;

  particles.forEach(p => {
    if (compilerPhysicsEnabled) p.update();
    p.draw(compilerCtx);
    if (p.stage === 0) signalCount++;
    else if (p.stage < stages.length - 1) processingCount++;
    else decisionCount++;
  });

  feedbackParticles.forEach(fp => {
    if (compilerPhysicsEnabled) fp.update();
    fp.draw(compilerCtx);
  });

  const signalEl = document.getElementById('signalCount');
  const processingEl = document.getElementById('processingCount');
  const decisionEl = document.getElementById('decisionCount');
  if (signalEl) signalEl.textContent = `${signalCount}`;
  if (processingEl) processingEl.textContent = `${processingCount}`;
  if (decisionEl) decisionEl.textContent = `${decisionCount}`;

  compilerCtx.fillStyle = '#ef4444';
  compilerCtx.font = '10px "JetBrains Mono", monospace';
  compilerCtx.textAlign = 'center';
  compilerCtx.fillText('OUTCOME BACK-PROPAGATION', w / 2, h - 20);

  requestAnimationFrame(drawCompiler);
}

(window as any).resetCompiler = () => {
  particles.forEach(p => p.reset());
  stages.forEach(s => s.processing = 0);
};

(window as any).toggleCompilerPhysics = () => {
  compilerPhysicsEnabled = !compilerPhysicsEnabled;
  const btn = document.getElementById('compilerPhysicsBtn');
  if (btn) btn.textContent = compilerPhysicsEnabled ? 'Pause' : 'Resume';
};

drawCompiler();
  }

  ngOnDestroy() {
    document.body.classList.remove('landing-cursor-enabled', 'hovering', 'dragging');
  }
}


