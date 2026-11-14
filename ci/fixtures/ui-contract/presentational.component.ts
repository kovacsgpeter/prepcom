import { Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * Fixture: új, service-függés nélküli (prezentációs) komponens — a ui-contract.js
 * "classify" öntesztjében új fájlként T1-be kell esnie.
 */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  template: `
    <section class="empty-state">
      <h2>{{ heading }}</h2>
      <button type="button" (click)="action.emit()">{{ actionLabel }}</button>
    </section>
  `
})
export class EmptyStateComponent {
  @Input() heading = '';
  @Input() actionLabel = '';
  @Output() readonly action = new EventEmitter<void>();
}
