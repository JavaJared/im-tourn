import { useEffect } from 'react';
import { pageMetadata } from '../lib/pageMetadata';
export default function PageMetadata({ view }) {
  useEffect(() => {
    const page = pageMetadata(view); document.title = page.title;
    const meta = (key, value, attr = 'name') => {
      let element = document.head.querySelector(`meta[${attr}="${key}"]`);
      if (!element) { element = document.createElement('meta'); element.setAttribute(attr, key); document.head.appendChild(element); }
      element.content = value;
    };
    meta('description', page.description); meta('robots', page.robots);
    meta('og:title', page.title, 'property'); meta('og:description', page.description, 'property'); meta('og:url', page.canonical, 'property');
    document.head.querySelector('link[rel="canonical"]').href = page.canonical;
  }, [view]);
  return null;
}
