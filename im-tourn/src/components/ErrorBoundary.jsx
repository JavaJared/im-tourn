import React from 'react';
export default class ErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error('Page failed:', error); }
  render() {
    return this.state.failed ? <main className="home-container" role="alert"><h1>This page couldn’t load</h1><p>Your saved brackets are still available. Try refreshing the page.</p><button className="nav-btn" onClick={() => window.location.reload()}>Refresh</button><a href="/">Go home</a></main> : this.props.children;
  }
}
