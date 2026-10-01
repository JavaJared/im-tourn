// Transfer only after an explicit sign-in action and only when no account
// submission/draft exists. Never upload picks automatically.
export function adoptGuestBracketDraft(guestKey, accountKey, hasSaved) {
  try {
    if(sessionStorage.getItem('bracket-guest-import')!==guestKey)return false;
    sessionStorage.removeItem('bracket-guest-import');
    if(hasSaved || localStorage.getItem(accountKey))return false;
    const guest=localStorage.getItem(guestKey);
    if(!guest)return false;
    localStorage.setItem(accountKey,guest);
    return true;
  }catch{return false;}
}
