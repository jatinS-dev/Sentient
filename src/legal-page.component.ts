import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

type LegalSection = {
  heading: string;
  paragraphs: string[];
};

type LegalContent = {
  title: string;
  subtitle: string;
  lastUpdated: string;
  sections: LegalSection[];
};

@Component({
  selector: 'app-legal-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div style="min-height:100vh;background:#f5f5f3;color:#111;padding:32px 20px;font-family:system-ui,sans-serif;">
      <div style="max-width:860px;margin:0 auto;">
        <a routerLink="/sentient"
          style="display:inline-block;margin-bottom:24px;color:#111;text-decoration:none;border:1px solid #d6d6d1;padding:8px 12px;border-radius:999px;">
          Back to Sentient
        </a>
        <h1 style="font-size:40px;line-height:1.1;margin:0 0 10px;">{{ content.title }}</h1>
        <p style="font-size:16px;line-height:1.6;color:#444;margin:0 0 20px;">
          {{ content.subtitle }}
        </p>
        <p style="font-size:13px;line-height:1.4;color:#666;margin:0 0 24px;">
          Last updated: {{ content.lastUpdated }}
        </p>
        <div style="border:1px solid #dcdcd7;border-radius:16px;padding:20px;background:#fff;">
          <section *ngFor="let section of content.sections; let i = index"
            [style.margin-bottom]="i === content.sections.length - 1 ? '0' : '20px'">
            <h2 style="font-size:20px;line-height:1.2;margin:0 0 10px;">{{ section.heading }}</h2>
            <p *ngFor="let paragraph of section.paragraphs; let j = index"
              [style.margin]="j === section.paragraphs.length - 1 ? '0' : '0 0 10px'"
              style="line-height:1.65;color:#444;">
              {{ paragraph }}
            </p>
          </section>
        </div>
      </div>
    </div>
  `
})
export class LegalPageComponent {
  content: LegalContent = LEGAL_CONTENT.privacy;

  constructor(route: ActivatedRoute) {
    const title = String(route.snapshot.data['title'] || 'Privacy').toLowerCase();
    this.content = LEGAL_CONTENT[title] ?? LEGAL_CONTENT.privacy;
  }
}

const LEGAL_CONTENT: Record<string, LegalContent> = {
  privacy: {
    title: 'Privacy',
    subtitle: 'How Sentient collects, uses, and protects information.',
    lastUpdated: 'February 26, 2026',
    sections: [
      {
        heading: 'Overview',
        paragraphs: [
          'Sentient provides a demo website and related product experiences for evaluating our AI context platform. This Privacy page explains what information we collect, how we use it, and the choices available to you when you interact with the Sentient website or request a demo.',
          'By using the Sentient site, you agree to the practices described on this page. If you do not agree, please do not use the site or submit personal information through the demo request forms.'
        ]
      },
      {
        heading: 'Information We Collect',
        paragraphs: [
          'We collect information you provide directly, such as your email address and any other details you choose to submit when booking a demo or contacting us.',
          'We may also collect basic technical information automatically, such as browser type, device information, approximate location derived from IP address, referring page, and timestamps, to operate and improve the site.'
        ]
      },
      {
        heading: 'How We Use Information',
        paragraphs: [
          'We use submitted information to respond to demo requests, communicate with prospective customers, provide product information, and follow up on inquiries.',
          'We may also use information for analytics, fraud prevention, service reliability, and to improve the website experience and our product messaging.'
        ]
      },
      {
        heading: 'Sharing of Information',
        paragraphs: [
          'We do not sell personal information. We may share information with service providers that help us operate the site and communications workflows, such as hosting, analytics, and email delivery providers.',
          'We may disclose information when required by law, to protect rights or safety, or in connection with a merger, financing, acquisition, or sale of assets.'
        ]
      },
      {
        heading: 'Data Retention',
        paragraphs: [
          'We retain information for as long as reasonably necessary to respond to your request, maintain records of business communications, comply with legal obligations, resolve disputes, and enforce agreements.',
          'Retention periods vary depending on the type of information and the purpose for which it was collected.'
        ]
      },
      {
        heading: 'Your Choices',
        paragraphs: [
          'You may request access, correction, or deletion of your personal information by contacting us at founders@sentientpm.com. We may need to verify your identity before fulfilling certain requests.',
          'You can also choose not to submit information through the site, though some features such as demo booking may not function without it.'
        ]
      },
      {
        heading: 'Security',
        paragraphs: [
          'We use reasonable administrative, technical, and organizational safeguards to protect information against unauthorized access, loss, misuse, or alteration.',
          'No internet transmission or storage system is fully secure, and we cannot guarantee absolute security.'
        ]
      },
      {
        heading: 'Contact',
        paragraphs: [
          'If you have privacy questions or requests, contact us at founders@sentientpm.com.'
        ]
      }
    ]
  },
  terms: {
    title: 'Terms',
    subtitle: 'Rules and conditions for using the Sentient website and demo experiences.',
    lastUpdated: 'February 26, 2026',
    sections: [
      {
        heading: 'Acceptance of Terms',
        paragraphs: [
          'These Terms govern your access to and use of the Sentient website, demo pages, and related materials. By using the site, you agree to these Terms.',
          'If you are using the site on behalf of an organization, you represent that you have authority to bind that organization to these Terms.'
        ]
      },
      {
        heading: 'Permitted Use',
        paragraphs: [
          'You may use the site for lawful business evaluation purposes, including learning about Sentient and requesting a demo.',
          'You agree not to misuse the site, interfere with its operation, attempt unauthorized access, reverse engineer protected functionality, or use the site to transmit harmful or unlawful content.'
        ]
      },
      {
        heading: 'Demo and Product Information',
        paragraphs: [
          'The website may include previews, mockups, prototypes, and forward-looking descriptions of product capabilities. These are provided for informational purposes and may change without notice.',
          'Nothing on the site creates a binding commitment to deliver any particular feature, integration, performance level, or timeline unless expressly agreed in a signed written agreement.'
        ]
      },
      {
        heading: 'Intellectual Property',
        paragraphs: [
          'The Sentient name, logos, website design, content, and related materials are owned by Sentient or its licensors and are protected by applicable intellectual property laws.',
          'Except for limited rights to use the site in accordance with these Terms, no rights or licenses are granted to you by implication or otherwise.'
        ]
      },
      {
        heading: 'Third-Party Services',
        paragraphs: [
          'The site may rely on or link to third-party services for hosting, analytics, communication, and form processing. Sentient is not responsible for the content or policies of third-party services beyond our direct control.',
          'Your use of third-party services may be subject to separate terms and privacy policies.'
        ]
      },
      {
        heading: 'Disclaimers',
        paragraphs: [
          'The site is provided on an "as is" and "as available" basis to the maximum extent permitted by law. Sentient disclaims all warranties, express or implied, including implied warranties of merchantability, fitness for a particular purpose, and non-infringement.',
          'We do not warrant that the site will be uninterrupted, error-free, secure, or free from harmful components.'
        ]
      },
      {
        heading: 'Limitation of Liability',
        paragraphs: [
          'To the maximum extent permitted by law, Sentient will not be liable for any indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, revenues, data, or business opportunities arising from your use of the site.',
          'Sentient total liability relating to the site will not exceed one hundred U.S. dollars (USD $100).'
        ]
      },
      {
        heading: 'Changes and Contact',
        paragraphs: [
          'We may update these Terms from time to time by posting a revised version on this page. Continued use of the site after changes become effective constitutes acceptance of the updated Terms.',
          'Questions about these Terms may be sent to founders@sentientpm.com.'
        ]
      }
    ]
  },
  security: {
    title: 'Security',
    subtitle: 'High-level overview of security practices for the Sentient website and demo workflow.',
    lastUpdated: 'February 26, 2026',
    sections: [
      {
        heading: 'Security Approach',
        paragraphs: [
          'Sentient is designed with a defense-in-depth mindset. We implement layered technical and operational controls to reduce risk and protect information processed through our website and demo workflows.',
          'This page provides a high-level summary and is not a full security audit report or a guarantee against all threats.'
        ]
      },
      {
        heading: 'Access Controls',
        paragraphs: [
          'We limit access to systems and data based on role and business need. Administrative access is restricted and reviewed as part of our internal security practices.',
          'Where supported, we use strong authentication and credential management practices for services used to operate the website and communication flows.'
        ]
      },
      {
        heading: 'Data Protection',
        paragraphs: [
          'We use industry-standard transport encryption for data transmitted between your browser and our services. Data stored by our service providers is protected using controls appropriate to the service and environment.',
          'We minimize collection of personal information on demo forms to what is necessary for communication and follow-up.'
        ]
      },
      {
        heading: 'Monitoring and Response',
        paragraphs: [
          'We monitor website operation and service health to identify failures, misuse, and suspicious activity patterns. We investigate issues and take corrective action as appropriate.',
          'If a security incident materially affects personal information, we will take steps consistent with applicable law and our incident response processes.'
        ]
      },
      {
        heading: 'Third-Party Providers',
        paragraphs: [
          'We rely on third-party infrastructure and communication providers to power portions of the website and form submission workflows. We evaluate providers based on functionality and security posture appropriate to our stage and use case.',
          'Provider-specific controls may vary, and your interactions may be subject to those providers operational constraints and service availability.'
        ]
      },
      {
        heading: 'Responsible Disclosure',
        paragraphs: [
          'If you believe you have identified a security issue affecting the Sentient website, please contact founders@sentientpm.com with details so we can investigate.',
          'Please avoid actions that could impact availability, access data without authorization, or disrupt other users.'
        ]
      }
    ]
  }
};
