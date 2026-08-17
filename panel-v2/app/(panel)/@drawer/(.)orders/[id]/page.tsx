import { notFound, redirect } from 'next/navigation';
import { OrderDrawer } from '@/components/OrderDrawer';
import { loadMatches, loadPanel } from '@/lib/orders';

export const dynamic = 'force-dynamic';

/** Intercepted route: opening an order from the list renders the drawer over
    whatever is already on screen instead of replacing it. */
export default async function InterceptedOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadPanel();
  if (!data) redirect('/login');

  const order = data.orders.find((o) => o.id === id);
  if (!order) notFound();

  if (order.tracked) order.matches = await loadMatches(order.id);

  return <OrderDrawer order={order} isAdmin={data.isAdmin} />;
}
