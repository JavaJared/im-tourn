import ViewLink from './ViewLink';

export default function UserLink({ userId, name, onNavigate, className = '' }) {
  if (!name) return null;
  if (!userId || !onNavigate) return <span className={className}>{name}</span>;
  return <ViewLink view={`profile-${userId}`} onNavigate={onNavigate} className={`user-link ${className}`.trim()}>{name}</ViewLink>;
}
