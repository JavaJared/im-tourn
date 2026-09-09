import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getAllBrackets, createBracketPool } from '../../services/bracketService';
import {
  getCustomStructureForPool,
  getPublicCustomBrackets,
} from '../../services/customBracketService';
import { generateSeededBracket, structureFromState } from '../../lib/standardBracket';

const CreatePoolPage = ({ onNavigate }) => {
  const [brackets, setBrackets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBracket, setSelectedBracket] = useState(null);
  const [poolName, setPoolName] = useState('');
  const [poolDescription, setPoolDescription] = useState('');
  const [lockDate, setLockDate] = useState('');
  const [creating, setCreating] = useState(false);

  // Scoring customization
  const [roundPoints, setRoundPoints] = useState([1, 2, 4, 8, 16, 32, 64]); // Points per round (up to 7 rounds for 128 entries)

  // Sleeper picks settings
  const [enableSleepers, setEnableSleepers] = useState(false);
  const [sleeper1Points, setSleeper1Points] = useState(5); // First round loser makes round 3
  const [sleeper2Points, setSleeper2Points] = useState(8); // Second round loser makes round 4

  const { currentUser } = useAuth();

  useEffect(() => {
    loadBrackets();
  }, []);

  const loadBrackets = async () => {
    try {
      const [defaults, customs] = await Promise.all([
        getAllBrackets(),
        getPublicCustomBrackets(), // published/locked/complete customs
      ]);
      setBrackets([...defaults, ...customs]);
    } catch (error) {
      console.error('Error loading brackets:', error);
    }
    setLoading(false);
  };

  const updateRoundPoints = (index, value) => {
    const newPoints = [...roundPoints];
    newPoints[index] = parseInt(value) || 0;
    setRoundPoints(newPoints);
  };

  const handleCreate = async () => {
    if (!selectedBracket || !poolName.trim()) {
      alert('Please select a bracket and enter a pool name');
      return;
    }

    setCreating(true);
    try {
      // UNIFIED PATH: every pool carries the engine structure, regardless of
      // how the bracket was created. Custom brackets already live in engine
      // shape; standard (seeded) brackets are generated into it on the spot.
      let structure;
      if (selectedBracket.isCustom) {
        structure = await getCustomStructureForPool(selectedBracket.id);
      } else {
        const entries =
          typeof selectedBracket.entries === 'string'
            ? JSON.parse(selectedBracket.entries)
            : selectedBracket.entries;
        structure = structureFromState(generateSeededBracket(entries));
      }

      const result = await createBracketPool({
        name: poolName.trim(),
        description: poolDescription.trim(),
        hostId: currentUser.uid,
        hostDisplayName: currentUser.displayName || 'Anonymous',
        bracketId: selectedBracket.id,
        bracketTitle: selectedBracket.title,
        bracketCategory: selectedBracket.category || 'Custom',
        bracketType: 'custom', // engine-shaped structure -> unified pool UI
        bracketMatchups: structure, // {rounds, boxes, nameMap, seedMap?, roundCount}
        lockDate: lockDate ? new Date(lockDate) : null,
        roundPoints: roundPoints.slice(0, structure.roundCount),
        // Sleeper picks settings (participant-id picks; scored in pool detail)
        enableSleepers,
        sleeper1Points: enableSleepers ? sleeper1Points : 0,
        sleeper2Points: enableSleepers ? sleeper2Points : 0,
      });

      onNavigate(`pool-${result.id}`);
    } catch (error) {
      console.error('Error creating pool:', error);
      alert('Failed to create pool. Please try again.');
    }
    setCreating(false);
  };

  if (loading) {
    return (
      <div className="home-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading brackets...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="home-container">
      <div className="page-header">
        <h1>Create Bracket Pool</h1>
        <p>Set up a prediction pool for your friends</p>
      </div>

      <div className="create-pool-form">
        <div className="form-group">
          <label>Pool Name</label>
          <input
            type="text"
            placeholder="e.g., March Madness 2024"
            value={poolName}
            onChange={(e) => setPoolName(e.target.value)}
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label>Description (optional)</label>
          <textarea
            placeholder="Add rules, prizes, or any other info for participants..."
            value={poolDescription}
            onChange={(e) => setPoolDescription(e.target.value)}
            className="form-textarea"
            rows={3}
          />
        </div>

        <div className="form-group">
          <label>Lock Date (optional)</label>
          <input
            type="datetime-local"
            value={lockDate}
            onChange={(e) => setLockDate(e.target.value)}
            className="form-input"
          />
          <p className="form-hint">Predictions will be locked at this time</p>
        </div>

        <div className="form-group">
          <label>Select a Bracket</label>
          <div className="bracket-select-grid">
            {brackets.map((bracket) => (
              <div
                key={bracket.id}
                className={`bracket-select-card ${selectedBracket?.id === bracket.id ? 'selected' : ''}`}
                onClick={() => setSelectedBracket(bracket)}
              >
                <span className="bracket-category">{bracket.category}</span>
                <h4>{bracket.title}</h4>
                <p>{bracket.size} entries</p>
              </div>
            ))}
          </div>
        </div>

        {selectedBracket && (
          <div className="form-group">
            <label>Points Per Round</label>
            <p className="form-hint">Set how many points a correct pick is worth in each round</p>
            <div className="round-points-grid">
              {Array.from(
                {
                  length: selectedBracket.isCustom
                    ? selectedBracket.roundCount
                    : Math.log2(selectedBracket.size),
                },
                (_, i) => (
                  <div key={i} className="round-points-item">
                    <span className="round-label">Round {i + 1}</span>
                    <input
                      type="number"
                      min="0"
                      value={roundPoints[i] || 0}
                      onChange={(e) => updateRoundPoints(i, e.target.value)}
                      className="round-points-input"
                    />
                    <span className="points-label">pts</span>
                  </div>
                ),
              )}
            </div>
          </div>
        )}

        <div className="form-group">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={enableSleepers}
              onChange={(e) => setEnableSleepers(e.target.checked)}
              className="toggle-checkbox"
            />
            <span className="toggle-switch"></span>
            <span className="toggle-text">Enable Sleeper Picks</span>
          </label>
          <p className="form-hint">Allow participants to select "sleeper" picks for bonus points</p>
        </div>

        {enableSleepers && (
          <div className="sleeper-settings">
            <div className="sleeper-setting">
              <div className="sleeper-info">
                <strong>Sleeper Pick 1</strong>
                <p>A Round 1 loser who makes it to Round 3+</p>
              </div>
              <div className="sleeper-points-input">
                <input
                  type="number"
                  min="0"
                  value={sleeper1Points}
                  onChange={(e) => setSleeper1Points(parseInt(e.target.value) || 0)}
                  className="round-points-input"
                />
                <span className="points-label">pts</span>
              </div>
            </div>
            <div className="sleeper-setting">
              <div className="sleeper-info">
                <strong>Sleeper Pick 2</strong>
                <p>A Round 2 loser who makes it to Round 4+</p>
              </div>
              <div className="sleeper-points-input">
                <input
                  type="number"
                  min="0"
                  value={sleeper2Points}
                  onChange={(e) => setSleeper2Points(parseInt(e.target.value) || 0)}
                  className="round-points-input"
                />
                <span className="points-label">pts</span>
              </div>
            </div>
          </div>
        )}

        <div className="form-actions">
          <button className="back-btn" onClick={() => onNavigate('pools')}>
            Cancel
          </button>
          <button
            className="nav-btn"
            onClick={handleCreate}
            disabled={creating || !selectedBracket || !poolName.trim()}
          >
            {creating ? 'Creating...' : 'Create Pool'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreatePoolPage;
