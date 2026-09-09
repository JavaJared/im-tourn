import { locate, resolveParticipant, matchWinner } from './customBracket';
export async function exportBracketPdf(state, nameMap, title = 'My bracket') {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF(), loc = locate(state);
  let y = 20;
  const line = (text, bold = false) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(bold ? 14 : 10);
    const rows = pdf.splitTextToSize(text, 175);
    for (const row of rows) { if (y > 278) { pdf.addPage(); y = 20; } pdf.text(row, 18, y); y += bold ? 8 : 6; }
  };
  line(title, true);
  state.rounds.forEach((ids, r) => {
    line(`Round ${r + 1}`, true);
    ids.forEach(id => {
      const a = resolveParticipant(state, loc, id, 'A'), b = resolveParticipant(state, loc, id, 'B'), w = matchWinner(state, loc, id);
      line(`${nameMap[a] || 'Bye / TBD'} vs ${nameMap[b] || 'Bye / TBD'} — Pick: ${nameMap[w] || 'Not picked'}`);
    });
    y += 5;
  });
  pdf.save('my-bracket.pdf');
}
