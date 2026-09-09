import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { createPredictionPool } from '../../services/bracketService';

const CreatePredictionPoolPage = ({ onNavigate }) => {
  const [poolName, setPoolName] = useState('');
  const [poolDescription, setPoolDescription] = useState('');
  const [lockDate, setLockDate] = useState('');
  const [categories, setCategories] = useState([{ name: '', options: ['', ''], points: 1 }]);
  const [creating, setCreating] = useState(false);
  const { currentUser } = useAuth();

  const addCategory = () => {
    setCategories([...categories, { name: '', options: ['', ''], points: 1 }]);
  };

  const removeCategory = (index) => {
    if (categories.length > 1) {
      setCategories(categories.filter((_, i) => i !== index));
    }
  };

  const updateCategory = (index, field, value) => {
    const updated = [...categories];
    updated[index][field] = value;
    setCategories(updated);
  };

  const addOption = (categoryIndex) => {
    const updated = [...categories];
    updated[categoryIndex].options.push('');
    setCategories(updated);
  };

  const removeOption = (categoryIndex, optionIndex) => {
    const updated = [...categories];
    if (updated[categoryIndex].options.length > 2) {
      updated[categoryIndex].options.splice(optionIndex, 1);
      setCategories(updated);
    }
  };

  const updateOption = (categoryIndex, optionIndex, value) => {
    const updated = [...categories];
    updated[categoryIndex].options[optionIndex] = value;
    setCategories(updated);
  };

  const handleCreate = async () => {
    if (!poolName.trim()) {
      alert('Please enter a pool name');
      return;
    }

    // Validate categories
    for (let i = 0; i < categories.length; i++) {
      if (!categories[i].name.trim()) {
        alert(`Please enter a name for category ${i + 1}`);
        return;
      }
      const filledOptions = categories[i].options.filter((o) => o.trim());
      if (filledOptions.length < 2) {
        alert(`Category "${categories[i].name}" needs at least 2 options`);
        return;
      }
    }

    setCreating(true);
    try {
      // Clean up categories - remove empty options
      const cleanedCategories = categories.map((cat) => ({
        name: cat.name.trim(),
        options: cat.options.filter((o) => o.trim()),
        points: cat.points || 1,
      }));

      const result = await createPredictionPool({
        name: poolName.trim(),
        description: poolDescription.trim(),
        hostId: currentUser.uid,
        hostDisplayName: currentUser.displayName || 'Anonymous',
        categories: cleanedCategories,
        lockDate: lockDate ? new Date(lockDate) : null,
      });

      onNavigate(`prediction-pool-${result.id}`);
    } catch (error) {
      console.error('Error creating prediction pool:', error);
      alert('Failed to create pool. Please try again.');
    }
    setCreating(false);
  };

  return (
    <div className="home-container">
      <div className="page-header">
        <h1>Create Prediction Pool</h1>
        <p>Set up categories for your friends to predict</p>
      </div>

      <div className="create-pool-form prediction-pool-form">
        <div className="form-group">
          <label>Pool Name</label>
          <input
            type="text"
            placeholder="e.g., 2024 Oscars Predictions"
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
          <label>Categories</label>
          <p className="form-hint">Add the categories and options people will predict</p>

          <div className="categories-builder">
            {categories.map((category, catIndex) => (
              <div key={catIndex} className="category-card">
                <div className="category-header">
                  <input
                    type="text"
                    placeholder={`Category ${catIndex + 1} name (e.g., Best Picture)`}
                    value={category.name}
                    onChange={(e) => updateCategory(catIndex, 'name', e.target.value)}
                    className="category-name-input"
                  />
                  <div className="category-points">
                    <input
                      type="number"
                      min="1"
                      value={category.points}
                      onChange={(e) =>
                        updateCategory(catIndex, 'points', parseInt(e.target.value) || 1)
                      }
                      className="points-input"
                    />
                    <span>pts</span>
                  </div>
                  {categories.length > 1 && (
                    <button
                      className="remove-category-btn"
                      onClick={() => removeCategory(catIndex)}
                    >
                      ×
                    </button>
                  )}
                </div>

                <div className="category-options">
                  {category.options.map((option, optIndex) => (
                    <div key={optIndex} className="option-row">
                      <input
                        type="text"
                        placeholder={`Option ${optIndex + 1}`}
                        value={option}
                        onChange={(e) => updateOption(catIndex, optIndex, e.target.value)}
                        className="option-input"
                      />
                      {category.options.length > 2 && (
                        <button
                          className="remove-option-btn"
                          onClick={() => removeOption(catIndex, optIndex)}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  <button className="add-option-btn" onClick={() => addOption(catIndex)}>
                    + Add Option
                  </button>
                </div>
              </div>
            ))}

            <button className="add-category-btn" onClick={addCategory}>
              + Add Category
            </button>
          </div>
        </div>

        <div className="form-actions">
          <button className="back-btn" onClick={() => onNavigate('prediction-pools')}>
            Cancel
          </button>
          <button
            className="nav-btn"
            onClick={handleCreate}
            disabled={creating || !poolName.trim()}
          >
            {creating ? 'Creating...' : 'Create Pool'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreatePredictionPoolPage;
