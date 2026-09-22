import { useRef, useState } from 'react';
import { useDialog } from '../../lib/useDialog';
import { callServer } from '../../services/server';
import UsernameForm from '../../components/account/UsernameForm';
import ProfileAvatar from './ProfileAvatar';
import { prepareProfilePhoto } from './profilePhoto';

export default function ProfileEditor({ profile, username, updateUsername, onSaved, onClose }) {
  const [bio, setBio] = useState(profile.bio || '');
  const [photo, setPhoto] = useState(undefined), [preview, setPreview] = useState(profile.photoURL);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const pending = useRef(false);
  const close = () => { if (!pending.current) onClose(); };
  const ref = useDialog(true, close);
  async function choose(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || pending.current) return;
    pending.current = true; setBusy(true); setError(''); setMessage('');
    try { const result = await prepareProfilePhoto(file); setPhoto(result.photo); setPreview(result.preview); }
    catch (reason) { setError(reason.message); }
    finally { pending.current = false; setBusy(false); }
  }
  async function save(event) {
    event.preventDefault(); if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const result = await callServer('updateProfileDetails', { bio, ...(photo !== undefined ? { photo } : {}) });
      onSaved(result); setPhoto(undefined); setBio(result.bio); setMessage('Profile saved.');
    } catch (reason) { setError(reason.message || 'Could not save your profile. Please retry.'); }
    finally { pending.current = false; setBusy(false); }
  }
  async function saveUsername(value) {
    if (pending.current) throw new Error('Wait for the current save to finish.');
    pending.current = true; setBusy(true);
    try { return await updateUsername(value); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div className="modal-overlay" onClick={close}>
    <section ref={ref} role="dialog" aria-modal="true" aria-labelledby="profile-edit-title" className="friend-dialog profile-editor" onClick={event => event.stopPropagation()}>
      <div className="profile-editor-heading"><h2 id="profile-edit-title">Edit profile</h2><button className="back-btn" onClick={close} disabled={busy}>Done</button></div>
      <form onSubmit={save}>
        <ProfileAvatar photoURL={preview} username={username} />
        <label htmlFor="profile-photo">Profile photo</label>
        <input id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={choose} disabled={busy} aria-describedby="profile-photo-help" />
        <small id="profile-photo-help">JPG, PNG, or WebP, up to 10 MB. Photos are cropped to a square.</small>
        {preview && <button className="back-btn" type="button" disabled={busy} onClick={() => { setPhoto(null); setPreview(null); setMessage(''); }}>Remove photo</button>}
        <label htmlFor="profile-bio">Bio</label>
        <textarea id="profile-bio" className="form-input" rows={4} maxLength={300} value={bio} onChange={event => { setBio(event.target.value); setMessage(''); }} disabled={busy} aria-describedby="profile-bio-count" />
        <small id="profile-bio-count">{bio.length}/300</small>
        <button type="submit" className="nav-btn" disabled={busy}>{busy ? 'Saving…' : 'Save photo and bio'}</button>
      </form>
      {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
      <UsernameForm username={username} onSave={saveUsername} />
    </section>
  </div>;
}
