import { useMemo } from 'react';
import BracketBoard from './BracketBoard';
import { convertLegacyMatchups, structureFromState } from '../lib/standardBracket';
import { locate, resolveParticipant } from '../lib/customBracket';

// Adapt only the presentation. Picks still go through the legacy winner handler
// and the saved document retains its original matchups, IDs, and entry metadata.
export default function LegacyBracketBoard({ matchups, editable = false, onPick }) {
  const { state, nameMap, seedMap, locations } = useMemo(() => {
    const converted = convertLegacyMatchups(matchups, { positionalIds: true });
    return { ...converted, seedMap: structureFromState(converted.state).seedMap, locations: locate(converted.state) };
  }, [matchups]);
  const select = (boxId, participantId) => {
    if (!editable || !onPick) return;
    const location = locations[boxId];
    if (!location) return;
    const a = resolveParticipant(state, locations, boxId, 'A');
    const b = resolveParticipant(state, locations, boxId, 'B');
    if (a == null || b == null) return;
    if (participantId === a) onPick(location.r, location.p, 1);
    else if (participantId === b) onPick(location.r, location.p, 2);
  };
  return <BracketBoard state={state} nameMap={nameMap} seedMap={seedMap} editable={editable} onPick={select} />;
}
