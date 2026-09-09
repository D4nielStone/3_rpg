export function createAreaInspector({ areas, getSelectedId, setSelectedId, newId, pushHistory, onChange }) {
  const list = document.querySelector('#enemy-area-list');
  const inspector = document.querySelector('#enemy-area-inspector');

  function selected() {
    return areas.find((area) => area.id === getSelectedId()) ?? null;
  }

  function updateForm() {
    const area = selected();
    inspector.hidden = !area;
    if (!area) return;
    document.querySelector('#enemy-area-id').value = area.id;
    document.querySelectorAll('[data-area-vector="center"] input').forEach((input) => {
      input.value = Number(area.center[Number(input.dataset.areaIndex)]).toFixed(2);
    });
    document.querySelectorAll('[data-area-field]').forEach((input) => {
      input.value = area[input.dataset.areaField];
    });
  }

  function render() {
    list.replaceChildren(...areas.map((area) => {
      const button = document.createElement('button');
      button.className = `entity-item scene-tree-area${area.id === getSelectedId() ? ' entity-item-selected' : ''}`;
      button.type = 'button';
      button.innerHTML = `<span class="asset-icon">A</span><span>${area.id}</span>`;
      button.addEventListener('click', () => {
        setSelectedId(area.id);
        updateForm();
        render();
        onChange?.();
      });
      return button;
    }));
    updateForm();
  }

  function bind() {
    document.querySelector('#create-enemy-area-button').addEventListener('click', () => {
      pushHistory();
      const area = { id: newId('enemy-area'), center: [0, 0, 0], width: 25, depth: 25, maxEnemies: 5, enemyType: 'rat', areaLevel: 1, spawnIntervalMs: 3000 };
      areas.push(area);
      setSelectedId(area.id);
      render();
      onChange?.('Área inimiga criada');
    });
    document.querySelector('#delete-enemy-area-button').addEventListener('click', () => {
      const area = selected();
      if (!area) return;
      pushHistory();
      areas.splice(areas.indexOf(area), 1);
      setSelectedId(null);
      render();
      onChange?.('Área inimiga excluída');
    });
    document.querySelector('#enemy-area-id').addEventListener('change', (event) => {
      const area = selected();
      if (!area) return;
      pushHistory();
      area.id = event.target.value.trim() || newId('enemy-area');
      render();
      onChange?.();
    });
    document.querySelectorAll('[data-area-field]').forEach((input) => input.addEventListener('change', () => {
      const area = selected();
      if (!area) return;
      pushHistory();
      const field = input.dataset.areaField;
      const value = field === 'enemyType' ? input.value.trim() || 'rat' : Number(input.value);
      area[field] = field === 'enemyType' ? value : (Number.isFinite(value) ? value : 0);
      onChange?.();
      updateForm();
    }));
    const center = document.querySelector('[data-area-vector="center"]');
    center.replaceChildren(...['x', 'y', 'z'].map((axis, index) => {
      const label = document.createElement('label');
      label.textContent = axis.toUpperCase();
      const input = document.createElement('input');
      input.type = 'number';
      input.step = '0.1';
      input.dataset.areaIndex = String(index);
      input.addEventListener('change', () => {
        const area = selected();
        if (!area) return;
        pushHistory();
        area.center[index] = Number(input.value) || 0;
        onChange?.();
        updateForm();
      });
      label.append(input);
      return label;
    }));
  }

  return { bind, render, updateForm };
}
