import { useState } from 'react';
import ActionDialog from './ActionDialog';
import DownloadBracketImage from './DownloadBracketImage';
import { bracketFrameStyles as S } from './BracketFrame';
export default function BracketDownloads({ title, getState, getBlankState }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" style={S.ghost} onClick={() => setOpen(true)}>Download</button>
    {open && <ActionDialog title="Download bracket" onClose={() => setOpen(false)}>
      {getState && <section><h3>My picks</h3><div className="download-options">{['png','pdf'].map(format => <DownloadBracketImage key={format} title={title} format={format} label={format.toUpperCase()} getState={getState}/>)}</div></section>}
      {getBlankState && <section><h3>Blank bracket</h3><div className="download-options">{['png','pdf'].map(format => <DownloadBracketImage key={format} title={`${title} - blank`} format={format} label={format.toUpperCase()} getState={getBlankState}/>)}</div></section>}
    </ActionDialog>}
  </>;
}
