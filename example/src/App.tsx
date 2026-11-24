import { useEffect, useState } from 'react'

interface Order {
  id: number
  customer: string
  total: number
  status: string
}

type Load<T> =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'done'; data: T }

/** Fetches JSON and keeps the outcome a person must see: loading, the error with its status, or the data. */
function useJson<T>(url: string | null): Load<T> | null {
  const [result, setResult] = useState<{ url: string; load: Load<T> } | null>(null)

  useEffect(() => {
    if (url === null) return
    let cancelled = false
    setResult({ url, load: { state: 'loading' } })
    fetch(url)
      .then(async (response) => {
        const text = await response.text()
        if (!response.ok) throw new Error(`${response.status} ${response.statusText} ${text}`.trim())
        return (text ? JSON.parse(text) : null) as T
      })
      .then((data) => {
        if (!cancelled) setResult({ url, load: { state: 'done', data } })
      })
      .catch((error: unknown) => {
        if (!cancelled) setResult({ url, load: { state: 'error', message: String(error) } })
      })
    return () => {
      cancelled = true
    }
  }, [url])

  if (url === null) return null
  return result?.url === url ? result.load : { state: 'loading' }
}

function OrderDetail({ id }: { id: number }) {
  const order = useJson<Order>(`/api/orders/${id}`)
  if (order === null || order.state === 'loading') return <p className="note">Loading order {id}…</p>
  if (order.state === 'error') return <p className="error">Could not load order {id}: {order.message}</p>
  if (order.data === null) return <p className="note">Order {id} came back empty.</p>
  return (
    <dl className="detail">
      <dt>Customer</dt>
      <dd>{order.data.customer}</dd>
      <dt>Total</dt>
      <dd>${order.data.total.toFixed(2)}</dd>
      <dt>Status</dt>
      <dd>{order.data.status}</dd>
    </dl>
  )
}

export function App() {
  const [reload, setReload] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const orders = useJson<Order[] | { data: Order[] }>(`/api/orders?reload=${reload}`)
  // The "Empty list" card answers { data: [], totalCount: 0 } instead of a bare array.
  const list = orders?.state === 'done' ? (Array.isArray(orders.data) ? orders.data : (orders.data?.data ?? [])) : []

  return (
    <main>
      <header>
        <h1>Orders</h1>
        <button type="button" onClick={() => setReload((count) => count + 1)}>
          Reload orders
        </button>
      </header>
      <p className="note">
        An invented shop for trying dev-mocks. The dev server answers <code>GET /api/orders</code> and{' '}
        <code>GET /api/orders/:id</code>. Open the ⚙️ tab on the right edge to change those answers.
      </p>
      {orders?.state === 'loading' && <p className="note">Loading orders…</p>}
      {orders?.state === 'error' && <p className="error">Could not load orders: {orders.message}</p>}
      {orders?.state === 'done' && list.length === 0 && <p className="note">No orders yet.</p>}
      {list.length > 0 && (
        <ul className="orders">
          {list.map((order) => (
            <li key={order.id}>
              <button type="button" aria-pressed={selected === order.id} onClick={() => setSelected(order.id)}>
                <span>#{order.id} {order.customer}</span>
                <span>${order.total.toFixed(2)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected !== null && <OrderDetail id={selected} />}
    </main>
  )
}
