import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
export default function FeedbackInbox() {
  const [items, setItems] = useState([]), [error, setError] = useState('');
  useEffect(() => onSnapshot(query(collection(db, 'feedback'), orderBy('createdAt', 'desc'), limit(50)), snap => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))), e => setError(e.message)), []);
  return <section className="admin-section"><h2>Recent feedback</h2>{error && <p role="alert">{error}</p>}{!error && !items.length && <p>No feedback yet.</p>}{items.map(item => <article key={item.id}><h3>{item.subject}</h3><p>{item.type} · {item.createdAt?.toDate?.().toLocaleString() || 'Just now'}</p><p style={{ whiteSpace: 'pre-wrap' }}>{item.description}</p>{item.email && <p>Reply address: {item.email}</p>}</article>)}</section>;
}
