import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ClerkSignInComponent } from 'ngx-clerk';

@Component({
    selector: 'app-sign-in',
    standalone: true,
    imports: [CommonModule, ClerkSignInComponent],
    template: `
    <div class="auth-container">
      <clerk-sign-in></clerk-sign-in>
    </div>
  `,
    styles: [`
    .auth-container {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      background: var(--app-bg, #050505);
      /* Ensure it looks good in dark mode */
    }
  `]
})
export class SignInComponent { }
