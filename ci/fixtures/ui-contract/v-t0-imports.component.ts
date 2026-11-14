import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ItemsService } from '../core/items.service';

/**
 * Fixture: a ui-contract.js "classify" öntesztjének alap-komponense
 * (ci/verify-ux-designer-config.sh). A változatok (v-*.ts) ehhez képest egy-egy
 * jellemző változástípust mutatnak be, a várt szinttel a fájlnévben.
 */
@Component({
  selector: 'app-item-list',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './item-list.component.html',
  styleUrl: './item-list.component.scss'
})
export class ItemListComponent {
  private readonly itemsService = inject(ItemsService);

  @Input() title = 'Elemek';
  @Output() readonly selected = new EventEmitter<string>();

  items: string[] = [];
  errorMessage: string | null = null;
  private readonly pattern = /[{}'"]/g;

  get isEmpty(): boolean {
    return this.items.length === 0;
  }

  async load(): Promise<void> {
    try {
      this.items = await this.itemsService.list();
    } catch {
      this.errorMessage = `Hiba: ${'{'} a lista nem tölthető be`;
    }
  }

  select(id: string): void {
    this.selected.emit(id);
  }

  // Regresszió: a generikus visszatérési típusban lévő `{` nem metódustörzs.
  async firstItem(): Promise<{ id: string } | null> {
    return this.items.length ? { id: this.items[0] } : null;
  }
}
