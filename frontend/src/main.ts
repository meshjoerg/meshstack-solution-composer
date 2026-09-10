import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { ConnectionConfigComponent } from './app/connection-config.component';

bootstrapApplication(AppComponent)
  .then(() => bootstrapApplication(ConnectionConfigComponent))
  .catch(err => console.error(err));
