import { Routes } from '@angular/router';
import { LandingComponent } from './landing.component';
import { AppUiComponent } from './app-ui.component';

import { SignInComponent } from './sign-in.component';
import { ClerkAuthGuardService } from 'ngx-clerk';

export const routes: Routes = [
  { path: '', component: LandingComponent },
  { path: 'sign-in', component: SignInComponent },
  {
    path: 'app',
    component: AppUiComponent,
    canActivate: [ClerkAuthGuardService]
  },
  { path: '**', redirectTo: '' }
];
