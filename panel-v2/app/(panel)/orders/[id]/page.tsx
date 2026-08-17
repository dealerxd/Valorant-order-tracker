import { notFound, redirect } from 'next/navigation';
import { OrderDrawer } from '@/components/OrderDrawer';
import { loadMatches, loadPanel } from '@/lib/orders';

export const dynamic = 'force-dynamic';

/** Direct load / hard refresh of /orders/[id]. Client-side navigation from
    the Orders list is caught by the intercepted route in the @drawer slot
    instead, which keeps the list rendered underneath. */
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadPanel();
  if (!data) redirect('/login');

  const order = data.orders.find((o) => o.id === id);
  if (!order) notFound();

  if (order.tracked) order.matches = await loadMatches(order.id);

  return <OrderDrawer order={order} isAdmin={data.isAdmin} standalone />;
}
