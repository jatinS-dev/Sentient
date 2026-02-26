import { Routes } from '@angular/router';
import { LandingComponent } from './landing.component';
import { AppUiComponent } from './app-ui.component';
import { IntegrationHubComponent } from './integration-hub.component';
import { SlackIntegrationComponent } from './slack-integration.component';
import { DecisionOperatorComponent } from './decision-operator.component';
import { SentientLandingComponent } from './sentient-landing.component';
import { LegalPageComponent } from './legal-page.component';

import { SignInComponent } from './sign-in.component';
import { ClerkAuthGuardService } from 'ngx-clerk';

export const routes: Routes = [
  { path: '', component: LandingComponent },
  { path: 'sentient', component: SentientLandingComponent },
  { path: 'sentient/privacy', component: LegalPageComponent, data: { title: 'Privacy' } },
  { path: 'sentient/terms', component: LegalPageComponent, data: { title: 'Terms' } },
  { path: 'sentient/security', component: LegalPageComponent, data: { title: 'Security' } },
  { path: 'sign-in', component: SignInComponent },
  {
    path: 'app/integration/slack',
    component: SlackIntegrationComponent,
    canActivate: [ClerkAuthGuardService]
  },
  {
    path: 'app/integration',
    component: IntegrationHubComponent,
    canActivate: [ClerkAuthGuardService]
  },
  {
    path: 'app/decision-operator',
    component: DecisionOperatorComponent,
    canActivate: [ClerkAuthGuardService]
  },
  {
    path: 'app',
    component: AppUiComponent,
    canActivate: [ClerkAuthGuardService]
  },
  {
    path: 'agent',
    component: AppUiComponent,
    canActivate: [ClerkAuthGuardService]
  },
  { path: '**', redirectTo: '' }
];
