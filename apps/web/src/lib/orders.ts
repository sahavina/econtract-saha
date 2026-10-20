import { deliveredValue, orderFulfillment, type OrderFulfillment, orderTotals, toScaled } from '@saha/shared';
import type { ContractListItem } from '@/lib/types';

export const FULFILLMENT_BADGE: Record<OrderFulfillment, string> = {
  NONE: 'bg-muted text-muted-foreground',
  PARTIAL: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  DONE: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
};

/** Tình trạng giao và % giá trị đã giao của một đơn trong danh sách. */
export function orderProgress(o: Pick<ContractListItem, 'items' | 'value'>) {
  const items = o.items.map((i) => ({ name: '', ...i }));
  const total = items.length ? orderTotals(items).subtotal : o.value;
  const done = deliveredValue(items);
  const t = toScaled(total, 2);
  const percent = t > BigInt(0) ? Number((toScaled(done, 2) * BigInt(100)) / t) : 0;
  return { fulfillment: orderFulfillment(items), percent, delivered: done };
}
