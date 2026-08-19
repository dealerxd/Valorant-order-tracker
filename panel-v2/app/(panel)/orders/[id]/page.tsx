import { notFound, redirect } from 'next/navigation';
import { OrderDrawer } from '@/components/OrderDrawer';
import { loadCredentials, loadMatches, loadPanel } from '@/lib/orders';

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

  // Giris bilgileri liste sorgusuna girmiyor; yalnizca burada, tek siparis
  // icin cekiliyor. RLS yetkisi olmayana bos donuyor.
  const credentials = await loadCredentials(order.id);
  // Calisan yalnizca kendi isinin bilgisini girebilir -- RLS de ayni sarti
  // uyguluyor, buradaki kontrol sadece butonu gizlemek icin.
  const canEditCredentials =
    data.isAdmin || order.boosterId === data.me.id || data.me.role === 'ortak';

  return <OrderDrawer order={order} isAdmin={data.isAdmin} credentials={credentials} canEditCredentials={canEditCredentials} standalone />;
}
