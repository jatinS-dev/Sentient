import { Component, OnInit, AfterViewInit, ViewEncapsulation, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import emailjs from '@emailjs/browser';

@Component({
  selector: 'app-sentient-landing',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sentient-landing.component.html',
  styleUrls: ['./sentient-landing.component.css'],
  encapsulation: ViewEncapsulation.None,
})
export class SentientLandingComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly ctaRecipientEmail = 'founders@sentientpm.com';

  private scrollHandler: (() => void) | null = null;
  private observers: IntersectionObserver[] = [];
  isCtaSubmitting = false;
  ctaButtonLabel = 'Book a demo';
  ctaFeedback = '';

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    // Nav scroll class
    const nav = document.getElementById('sentient-nav');
    if (nav) {
      this.scrollHandler = () => nav.classList.toggle('scrolled', window.scrollY > 20);
      window.addEventListener('scroll', this.scrollHandler, { passive: true });
    }

    // Scroll reveal
    const revealObs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in'); });
    }, { threshold: 0.07, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.sentient-page .r, .sentient-page .rl, .sentient-page .rr, .sentient-page .rs')
      .forEach(el => revealObs.observe(el));
    this.observers.push(revealObs);

    // Stats counter
    const statObs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting || e.target.classList.contains('in')) return;
        e.target.classList.add('in');
        const target = +(e.target as HTMLElement).dataset['val']!;
        const pfx = (e.target as HTMLElement).dataset['pfx'] || '';
        const sfx = (e.target as HTMLElement).dataset['sfx'] || '';
        let start: number | undefined;
        const dur = 1600;
        const tick = (ts: number) => {
          if (!start) start = ts;
          const p = Math.min((ts - start) / dur, 1);
          const ease = 1 - Math.pow(1 - p, 3);
          e.target.textContent = pfx + Math.floor(ease * target) + sfx;
          if (p < 1) requestAnimationFrame(tick);
          else e.target.textContent = pfx + target + sfx;
        };
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.4 });
    document.querySelectorAll('.sentient-page .stat-n').forEach(el => statObs.observe(el));
    this.observers.push(statObs);

    // Source item entrance
    setTimeout(() => {
      document.querySelectorAll('.sentient-page .src').forEach((el, i) => {
        setTimeout(() => el.classList.add('show'), i * 110);
      });
    }, 400);

    // Hero parallax
    const card = document.querySelector('.sentient-page .hero-card-wrap') as HTMLElement | null;
    if (card) {
      const parallaxHandler = () => {
        if (window.scrollY < window.innerHeight)
          card.style.transform = `translateY(${window.scrollY * 0.1}px)`;
      };
      window.addEventListener('scroll', parallaxHandler, { passive: true });
      // Store for cleanup
      (this as any)._parallaxHandler = parallaxHandler;
    }
  }

  toggleFaq(btn: HTMLElement): void {
    const item = btn.parentElement!;
    const open = item.classList.contains('open');
    document.querySelectorAll('.sentient-page .faq-item.open').forEach(i => i.classList.remove('open'));
    if (!open) item.classList.add('open');
  }

  async submitCtaForm(event: Event): Promise<void> {
    event.preventDefault();
    if (this.isCtaSubmitting) return;

    const form = event.target as HTMLFormElement | null;
    if (!form) return;

    const formData = new FormData(form);
    const workEmail = String(formData.get('workEmail') || '').trim();
    if (!workEmail) {
      this.ctaFeedback = 'Please enter your work email.';
      return;
    }

    this.isCtaSubmitting = true;
    this.ctaButtonLabel = 'Submitting...';
    this.ctaFeedback = '';

    try {
      const payload = {
        firstName: 'Sentient',
        lastName: 'Website Lead',
        name: 'Sentient Website Lead',
        workEmail,
        email: workEmail,
        from_email: workEmail,
        user_email: workEmail,
        reply_to: workEmail,
        to_email: this.ctaRecipientEmail,
        toEmail: this.ctaRecipientEmail,
        recipient_email: this.ctaRecipientEmail,
        companyName: 'Unknown',
        message: 'CTA signup from Sentient book demo landing page',
        source: 'sentient-book-demo-cta',
        time: new Date().toLocaleString()
      };

      const serviceID = 'service_kjyjp9a';
      const templateID = 'template_uzoyxt6';
      const publicKey = 'zyHYYic3Iz3HmMDXc';

      await emailjs.send(serviceID, templateID, payload, publicKey);

      form.reset();
      this.ctaButtonLabel = 'We will be in touch shortly!';
      this.ctaFeedback = 'Submitted successfully.';
      setTimeout(() => {
        this.ctaButtonLabel = 'Book a demo';
        this.isCtaSubmitting = false;
        this.ctaFeedback = '';
      }, 2000);
      return;
    } catch (error) {
      const err = error as { status?: number; text?: string; message?: string };
      console.error('EmailJS Error:', {
        status: err?.status,
        text: err?.text,
        message: err?.message,
        raw: error
      });
      this.ctaButtonLabel = 'Try again';
      const reason = err?.text || err?.message || 'Unknown EmailJS error';
      this.ctaFeedback = `Submission failed (EmailJS): ${reason}`;
      setTimeout(() => {
        this.ctaButtonLabel = 'Book a demo';
        this.isCtaSubmitting = false;
      }, 2000);
      return;
    }
  }

  ngOnDestroy(): void {
    if (this.scrollHandler) window.removeEventListener('scroll', this.scrollHandler);
    if ((this as any)._parallaxHandler) window.removeEventListener('scroll', (this as any)._parallaxHandler);
    this.observers.forEach(o => o.disconnect());
  }
}
