import { useEffect, useState } from 'react';

export default function ProfileAvatar({ photoURL, username }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photoURL]);
  return <div className="profile-avatar">
    {photoURL && !failed ? <img src={photoURL} alt={`${username || 'User'}’s profile photo`} onError={() => setFailed(true)} />
      : <span aria-label="No profile photo">{username?.[0]?.toUpperCase() || '?'}</span>}
  </div>;
}
