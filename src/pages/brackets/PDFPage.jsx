import LegacyBracketBoard from '../../components/LegacyBracketBoard';
import { BracketFrame, bracketFrameStyles as S } from '../../components/BracketFrame';
import { useAuth } from '../../contexts/AuthContext';

const PDFPage = ({ bracket, onBack }) => {
  const { currentUser, username } = useAuth();

  const getRoundName = (roundIndex, totalRounds) => {
    const remaining = totalRounds - roundIndex;
    if (remaining === 1) return 'Finals';
    if (remaining === 2) return 'Semi-Finals';
    if (remaining === 3) return 'Quarter-Finals';
    return `Round ${roundIndex + 1}`;
  };

  const downloadPDF = async () => {
    const { jsPDF } = await import('jspdf');

    // Use larger page for 64-entry brackets
    const isLargeBracket = bracket.size >= 64;
    const pageFormat = isLargeBracket ? 'tabloid' : 'letter';

    // Create landscape PDF
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: pageFormat });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // Colors
    const orange = [255, 107, 53];
    const darkGray = [51, 51, 51];
    const mediumGray = [102, 102, 102];
    const borderGray = [180, 180, 180];
    const lightBg = [250, 250, 250];
    const winnerGreen = [212, 237, 218];
    const white = [255, 255, 255];

    // Title
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(24);
    pdf.setTextColor(...darkGray);
    pdf.text(bracket.title, pageWidth / 2, 40, { align: 'center' });

    // Subtitle
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(...mediumGray);
    pdf.text(
      `${bracket.category} • ${bracket.size} Entries • Filled by ${username ? `@${username}` : currentUser ? 'Username unavailable' : 'Guest'}`,
      pageWidth / 2,
      58,
      { align: 'center' },
    );

    // Bracket dimensions
    const numRounds = bracket.matchups.length;
    const margin = 30;
    const bracketTop = 80;
    const bracketWidth = pageWidth - margin * 2;
    const bracketHeight = pageHeight - bracketTop - 70;
    const roundWidth = bracketWidth / numRounds;
    const matchupWidth = roundWidth - 15;

    // Calculate matchup height based on number of first round matchups
    const firstRoundCount = bracket.matchups[0].length;
    const maxMatchupHeight = Math.min(36, (bracketHeight - 20) / firstRoundCount - 4);
    const matchupHeight = Math.max(24, maxMatchupHeight);
    const entryHeight = matchupHeight / 2;

    // Draw each round
    bracket.matchups.forEach((round, roundIndex) => {
      const numMatchups = round.length;
      const roundX = margin + roundIndex * roundWidth + 5;

      // Round title
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(...mediumGray);
      pdf.text(getRoundName(roundIndex, numRounds), roundX + matchupWidth / 2, bracketTop - 5, {
        align: 'center',
      });

      // Calculate total height needed for this round's matchups
      const firstRoundTotalHeight = firstRoundCount * (matchupHeight + 4);
      const thisRoundSpacing = firstRoundTotalHeight / numMatchups;

      round.forEach((match, matchIndex) => {
        // Center each matchup within its allocated space
        const slotTop = bracketTop + matchIndex * thisRoundSpacing;
        const matchY = slotTop + (thisRoundSpacing - matchupHeight) / 2;

        // Draw single outer matchup box first
        pdf.setDrawColor(...borderGray);
        pdf.setLineWidth(1);
        pdf.setFillColor(...white);
        pdf.rect(roundX, matchY, matchupWidth, matchupHeight, 'FD');

        // Fill entry backgrounds
        const isWinner1 = match.winner === 1;
        const isWinner2 = match.winner === 2;

        if (isWinner1) {
          pdf.setFillColor(...winnerGreen);
          pdf.rect(roundX + 1, matchY + 1, matchupWidth - 2, entryHeight - 1, 'F');
        }

        if (isWinner2) {
          pdf.setFillColor(...winnerGreen);
          pdf.rect(roundX + 1, matchY + entryHeight + 1, matchupWidth - 2, entryHeight - 2, 'F');
        }

        // Draw divider line between entries (shortened to stay inside box)
        pdf.setDrawColor(...borderGray);
        pdf.setLineWidth(0.5);
        pdf.line(roundX + 1, matchY + entryHeight, roundX + matchupWidth - 1, matchY + entryHeight);

        // Entry 1 content
        if (match.entry1) {
          const seedSize = Math.min(12, entryHeight - 4);
          pdf.setFillColor(...orange);
          pdf.rect(roundX + 3, matchY + (entryHeight - seedSize) / 2, seedSize, seedSize, 'F');
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(Math.min(7, seedSize - 2));
          pdf.setTextColor(...white);
          pdf.text(
            String(match.entry1.seed),
            roundX + 3 + seedSize / 2,
            matchY + entryHeight / 2 + 2,
            { align: 'center' },
          );

          pdf.setFont('helvetica', isWinner1 ? 'bold' : 'normal');
          pdf.setFontSize(Math.min(8, entryHeight - 4));
          pdf.setTextColor(...darkGray);
          pdf.text(
            match.entry1.name.substring(0, 15),
            roundX + seedSize + 8,
            matchY + entryHeight / 2 + 2,
          );
        } else {
          pdf.setFont('helvetica', 'italic');
          pdf.setFontSize(Math.min(8, entryHeight - 4));
          pdf.setTextColor(...borderGray);
          pdf.text('TBD', roundX + 8, matchY + entryHeight / 2 + 2);
        }

        // Entry 2 content
        if (match.entry2) {
          const seedSize = Math.min(12, entryHeight - 4);
          pdf.setFillColor(...orange);
          pdf.rect(
            roundX + 3,
            matchY + entryHeight + (entryHeight - seedSize) / 2,
            seedSize,
            seedSize,
            'F',
          );
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(Math.min(7, seedSize - 2));
          pdf.setTextColor(...white);
          pdf.text(
            String(match.entry2.seed),
            roundX + 3 + seedSize / 2,
            matchY + entryHeight + entryHeight / 2 + 2,
            { align: 'center' },
          );

          pdf.setFont('helvetica', isWinner2 ? 'bold' : 'normal');
          pdf.setFontSize(Math.min(8, entryHeight - 4));
          pdf.setTextColor(...darkGray);
          pdf.text(
            match.entry2.name.substring(0, 15),
            roundX + seedSize + 8,
            matchY + entryHeight + entryHeight / 2 + 2,
          );
        } else {
          pdf.setFont('helvetica', 'italic');
          pdf.setFontSize(Math.min(8, entryHeight - 4));
          pdf.setTextColor(...borderGray);
          pdf.text('TBD', roundX + 6, matchY + entryHeight + entryHeight / 2 + 2);
        }

        // Draw connector lines to next round
        if (roundIndex < numRounds - 1) {
          const matchCenterY = matchY + matchupHeight / 2;
          pdf.setDrawColor(...borderGray);
          pdf.setLineWidth(0.75);
          pdf.line(roundX + matchupWidth, matchCenterY, roundX + matchupWidth + 7, matchCenterY);
        }
      });
    });

    // Champion box at bottom
    if (bracket.champion) {
      const champY = pageHeight - 55;
      const champWidth = 180;
      const champX = (pageWidth - champWidth) / 2;

      pdf.setFillColor(255, 243, 205);
      pdf.rect(champX, champY, champWidth, 35, 'F');
      pdf.setDrawColor(...orange);
      pdf.setLineWidth(2);
      pdf.rect(champX, champY, champWidth, 35, 'S');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(...mediumGray);
      pdf.text('CHAMPION', pageWidth / 2, champY + 12, { align: 'center' });

      pdf.setFontSize(14);
      pdf.setTextColor(...darkGray);
      pdf.text(bracket.champion.name, pageWidth / 2, champY + 28, { align: 'center' });
    }

    pdf.save(`${bracket.title.replace(/\s+/g, '-')}-bracket.pdf`);
  };

  return (
    <BracketFrame onExit={onBack}>
      <header style={S.top}>
        <div style={S.brand}>
          <h1 style={{ ...S.title, margin: 0 }}>{bracket.title}</h1>
          <span style={S.sub}>Read only</span>
        </div>
        <button style={S.ghost} onClick={downloadPDF}>Download PDF</button>
      </header>
      <div style={S.scroll}><LegacyBracketBoard matchups={bracket.matchups} /></div>
      {bracket.champion && <div style={S.notice}>Champion: <strong>{bracket.champion.name}</strong></div>}
    </BracketFrame>
  );
};

export default PDFPage;
