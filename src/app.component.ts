import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ClerkService } from 'ngx-clerk';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>'
})
export class AppComponent implements OnInit {
  constructor(private clerk: ClerkService) {
    this.clerk.__init({
      publishableKey: 'pk_test_d2VsY29tZWQteWFrLTcwLmNsZXJrLmFjY291bnRzLmRldiQ'
    });
  }

  ngOnInit() {
    if (localStorage.getItem('theme') === 'dark') {
      document.documentElement.classList.add('dark');
    }
  }
}
