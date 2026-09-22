import usePublicUsername from '../../lib/usePublicUsername';
import { validUserId } from '../../services/publicUsernames';
import { createContext, useContext } from 'react';

export const ProfileNavigationContext = createContext(null);

// Keep native links (including new tabs), without activating the enclosing card.
export default function UserLink({ userId, onNavigate, className = '' }) {
  const contextNavigate = useContext(ProfileNavigationContext);
  const navigate = onNavigate || contextNavigate;
  const name = usePublicUsername(userId);
  if (!validUserId(userId)) return <span className={className}>{name}</span>;
  const view = `profile-${userId}`;
  return <a href={`/?view=${encodeURIComponent(view)}`} className={`user-link ${className}`.trim()}
    onClick={event => {
      event.stopPropagation();
      if (!navigate || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(view);
    }}>{name}</a>;
}
