document.addEventListener('DOMContentLoaded', () => {
  const selectDirBtn = document.getElementById('select-dir-btn');
  const sendBtn = document.getElementById('send-btn');
  const repoPathEl = document.getElementById('repo-path');
  const fileTreeEl = document.getElementById('file-tree');
  const queryInput = document.getElementById('query-input');
  
  const previewBase = document.getElementById('preview-base');
  const previewQuery = document.getElementById('preview-query');
  const previewTokensBadge = document.getElementById('preview-tokens-badge');
  
  const selectionCountHeader = document.getElementById('selection-count-header');
  
  // Footer stats
  const footerFiles = document.getElementById('footer-files');
  const footerTokens = document.getElementById('footer-tokens');
  const footerBudget = document.getElementById('footer-budget');
  const footerPct = document.getElementById('footer-pct');
  const footerProgress = document.getElementById('footer-progress');
  
  // Menus and popovers
  const settingsBtn = document.getElementById('settings-btn');
  const settingsPopover = document.getElementById('settings-popover');
  const filesMenuBtn = document.getElementById('files-menu-btn');
  const filesDropdown = document.getElementById('files-dropdown');
  
  // Actions
  const refreshTreeBtn = document.getElementById('refresh-tree-btn');
  const selectAllBtn = document.getElementById('select-all-btn');
  const clearSelectionBtn = document.getElementById('clear-selection-btn');
  const selectSiblingsBtn = document.getElementById('select-siblings-btn');
  const showAllChk = document.getElementById('show-all-chk');

  // Settings Controls
  const treeScopeControl = document.getElementById('tree-scope-control');
  const treeLimitControl = document.getElementById('tree-limit-control');
  const promptLimitControl = document.getElementById('prompt-limit-control');
  
  const pillTreeLimit = document.getElementById('pill-tree-limit');
  const pillPromptLimit = document.getElementById('pill-prompt-limit');

  let currentRoot = null;
  let selectedFiles = new Set();
  let fileTreeData = null;
  let currentTreeMode = 'full'; // 'full' | 'scoped' | 'none'
  let currentTreeLimit = 2500; 
  let currentPromptLimit = 60000; 
  let showAllToggle = false;
  let cachedBaseContext = '';
  let debounceTimer = null;
  let allFilePaths = []; // Track all files for "Select all"

  // Dropdown toggles
  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsPopover.classList.toggle('open');
    filesDropdown.classList.remove('open');
    // Position it under the button
    const rect = settingsBtn.getBoundingClientRect();
    settingsPopover.style.top = `${rect.bottom + 8}px`;
    settingsPopover.style.right = `${window.innerWidth - rect.right}px`;
  });

  filesMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    filesDropdown.classList.toggle('open');
    settingsPopover.classList.remove('open');
  });

  document.addEventListener('click', (e) => {
    if (!settingsPopover.contains(e.target) && e.target !== settingsBtn) {
      settingsPopover.classList.remove('open');
    }
    if (!filesDropdown.contains(e.target) && e.target !== filesMenuBtn) {
      filesDropdown.classList.remove('open');
    }
  });

  // Settings Logic
  if (treeScopeControl) {
    treeScopeControl.querySelectorAll('.segment').forEach((btn) => {
      btn.addEventListener('click', () => {
        treeScopeControl.querySelectorAll('.segment').forEach((s) => s.classList.remove('active'));
        btn.classList.add('active');
        currentTreeMode = btn.getAttribute('data-mode') || 'full';
        
        const pillScope = document.getElementById('pill-scope');
        if (pillScope) pillScope.textContent = btn.textContent;
        updateStats();
        scheduleUpdateBaseContext();
      });
    });
  }

  if (treeLimitControl) {
    treeLimitControl.querySelectorAll('.segment').forEach((btn) => {
      btn.addEventListener('click', () => {
        treeLimitControl.querySelectorAll('.segment').forEach((s) => s.classList.remove('active'));
        btn.classList.add('active');
        currentTreeLimit = parseInt(btn.getAttribute('data-limit') || '2500', 10);
        pillTreeLimit.textContent = btn.textContent;
        updateStats();
        scheduleUpdateBaseContext();
      });
    });
  }

  if (promptLimitControl) {
    promptLimitControl.querySelectorAll('.segment').forEach((btn) => {
      btn.addEventListener('click', () => {
        promptLimitControl.querySelectorAll('.segment').forEach((s) => s.classList.remove('active'));
        btn.classList.add('active');
        currentPromptLimit = parseInt(btn.getAttribute('data-chars') || '60000', 10);
        pillPromptLimit.textContent = btn.textContent;
        updateStats();
        scheduleUpdateBaseContext();
      });
    });
  }

  if (showAllChk) {
    showAllChk.addEventListener('change', async (e) => {
      showAllToggle = e.target.checked;
      if (currentRoot) {
        await loadFileTree(currentRoot, true);
      }
    });
  }

  // Pick Directory
  selectDirBtn.addEventListener('click', async () => {
    try {
      const path = await invoke('select_directory');
      if (path) {
        currentRoot = path;
        repoPathEl.textContent = `${path}`;
        await loadFileTree(path);
      }
    } catch (e) {
      console.error(e);
      if (e !== 'No directory selected') {
        alert(`Error selecting directory: ${e}`);
      }
    }
  });

  // File Actions
  if (refreshTreeBtn) {
    refreshTreeBtn.addEventListener('click', async () => {
      if (!currentRoot) return;
      filesDropdown.classList.remove('open');
      await loadFileTree(currentRoot, true);
    });
  }

  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', () => {
      if (!currentRoot) return;
      filesDropdown.classList.remove('open');
      allFilePaths.forEach(p => selectedFiles.add(p));
      fileTreeEl.querySelectorAll('input[type="checkbox"]').forEach(chk => chk.checked = true);
      updateSelectionBadge();
      scheduleUpdateBaseContext();
    });
  }

  if (clearSelectionBtn) {
    clearSelectionBtn.addEventListener('click', () => {
      filesDropdown.classList.remove('open');
      selectedFiles.clear();
      fileTreeEl.querySelectorAll('input[type="checkbox"]').forEach(chk => chk.checked = false);
      updateSelectionBadge();
      scheduleUpdateBaseContext();
    });
  }

  if (selectSiblingsBtn) {
    selectSiblingsBtn.addEventListener('click', async () => {
      filesDropdown.classList.remove('open');
      if (selectedFiles.size === 0) return;
      try {
        const files = Array.from(selectedFiles);
        const siblings = await invoke('get_sibling_files', { files });
        if (Array.isArray(siblings)) {
          siblings.forEach((path) => {
            selectedFiles.add(path);
            const chk = document.getElementById(`chk-${path}`);
            if (chk) chk.checked = true;
          });
          updateSelectionBadge();
          scheduleUpdateBaseContext();
        }
      } catch (e) {
        console.error('Error fetching sibling files:', e);
      }
    });
  }

  function updateSelectionBadge() {
    const total = allFilePaths.length;
    selectionCountHeader.textContent = `${selectedFiles.size} / ${total}`;
    footerFiles.textContent = `${selectedFiles.size} files`;
  }

  async function loadFileTree(rootPath, preserveSelection = false) {
    try {
      if (!preserveSelection) {
        selectedFiles.clear();
      }
      
      fileTreeEl.innerHTML = '<div style="color: var(--text-dim); padding: 0.5rem;">Cargando archivos...</div>';
      const entries = await invoke('read_directory', { path: rootPath, showAll: showAllToggle });
      fileTreeEl.innerHTML = '';
      
      allFilePaths = [];
      collectAllFiles(entries, allFilePaths);

      updateSelectionBadge();

      if (!entries || entries.length === 0) {
        fileTreeEl.innerHTML = '<div style="color: var(--text-dim); padding: 0.5rem; font-style: italic;">Carpeta vacía</div>';
      } else {
        renderDirectoryLevel(entries, fileTreeEl, 0);
      }

      scheduleUpdateBaseContext();
    } catch (e) {
      console.error(e);
      fileTreeEl.innerHTML = `<span style="color: #ff5555; padding: 0.5rem;">Error: ${e}</span>`;
    }
  }
  
  function collectAllFiles(entries, outArray) {
    if (!entries) return;
    for (const e of entries) {
      if (!e.is_dir) {
        outArray.push(e.path);
      }
    }
  }

  function renderDirectoryLevel(entries, container, depth) {
    if (!entries) return;

    for (const entry of entries) {
      const nodeEl = document.createElement('div');
      nodeEl.className = 'tree-item';
      
      if (entry.is_dir) {
        const row = document.createElement('div');
        row.className = 'tree-dir-row';
        row.style.paddingLeft = `${depth * 14}px`;

        const arrow = document.createElement('span');
        arrow.className = 'tree-arrow';
        arrow.textContent = '▶';

        const label = document.createElement('span');
        label.className = 'tree-dir-label';
        label.textContent = `📁 ${entry.name}`;

        row.appendChild(arrow);
        row.appendChild(label);
        nodeEl.appendChild(row);

        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'tree-children';
        nodeEl.appendChild(childrenContainer);

        let loaded = false;
        row.addEventListener('click', async () => {
          const isOpen = childrenContainer.classList.contains('open');
          if (isOpen) {
            childrenContainer.classList.remove('open');
            arrow.classList.remove('open');
          } else {
            arrow.classList.add('open');
            childrenContainer.classList.add('open');
            if (!loaded) {
              childrenContainer.innerHTML = `<div style="padding-left: ${(depth + 1) * 14}px; color: var(--text-dim); font-size: 0.75rem;">Cargando...</div>`;
              try {
                const subEntries = await invoke('read_directory', { path: entry.path, showAll: showAllToggle });
                childrenContainer.innerHTML = '';
                if (!subEntries || subEntries.length === 0) {
                  childrenContainer.innerHTML = `<div style="padding-left: ${(depth + 1) * 14}px; color: var(--text-dim); font-size: 0.75rem; font-style: italic;">(vacío)</div>`;
                } else {
                  collectAllFiles(subEntries, allFilePaths); // dynamically add to all files if not pre-cached
                  renderDirectoryLevel(subEntries, childrenContainer, depth + 1);
                  updateSelectionBadge();
                }
                loaded = true;
              } catch (err) {
                childrenContainer.innerHTML = `<div style="padding-left: ${(depth + 1) * 14}px; color: #ff5555; font-size: 0.75rem;">Error: ${err}</div>`;
              }
            }
          }
        });
      } else {
        const row = document.createElement('div');
        row.className = 'tree-node';
        row.style.paddingLeft = `${depth * 14 + 14}px`;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `chk-${entry.path}`;
        checkbox.checked = selectedFiles.has(entry.path);

        checkbox.addEventListener('change', (e) => {
          if (e.target.checked) {
            selectedFiles.add(entry.path);
          } else {
            selectedFiles.delete(entry.path);
          }
          updateSelectionBadge();
          scheduleUpdateBaseContext();
        });

        const label = document.createElement('label');
        label.htmlFor = checkbox.id;
        label.textContent = `📄 ${entry.name}`;

        row.appendChild(checkbox);
        row.appendChild(label);
        nodeEl.appendChild(row);
      }

      container.appendChild(nodeEl);
    }
  }

  function scheduleUpdateBaseContext() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      updateBaseContext();
    }, 150);
  }

  async function updateBaseContext() {
    if (!currentRoot) return;
    try {
      const files = Array.from(selectedFiles);
      const baseContext = await invoke('build_context', {
        root: currentRoot,
        files: files,
        query: '',
        treeMode: currentTreeMode,
        showAll: showAllToggle,
        maxTreeEntries: currentTreeLimit,
        maxContextChars: currentPromptLimit,
      });

      cachedBaseContext = baseContext.trim();
      previewBase.textContent = cachedBaseContext || 'Select files or type a query to prepare context...';
      updateStats();
    } catch (e) {
      console.error(e);
      cachedBaseContext = `Error generating context: ${e}`;
      previewBase.textContent = cachedBaseContext;
      updateStats();
    }
  }

  function formatK(num) {
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return num.toString();
  }

  function updateStats() {
    const query = queryInput.value.trim();
    // Use bytes / 4 for tokens heuristic 
    const totalChars = (cachedBaseContext ? cachedBaseContext.length : 0) + (query ? query.length + 20 : 0);
    const approxTokens = Math.ceil(totalChars / 4); 
    
    // Budget
    let budgetTokens = 0;
    if (currentPromptLimit > 0) {
      budgetTokens = Math.ceil(currentPromptLimit / 4);
      footerBudget.textContent = `${formatK(budgetTokens)} tokens`;
    } else {
      footerBudget.textContent = `∞ tokens`;
    }

    footerTokens.textContent = `${formatK(approxTokens)} tokens`;
    previewTokensBadge.textContent = `${formatK(approxTokens)} tokens`;
    previewTokensBadge.title = `estimated tokens for selected files`;

    // Progress bar
    if (budgetTokens > 0) {
      let pct = Math.min(100, Math.round((approxTokens / budgetTokens) * 100));
      footerPct.textContent = `${pct}% usado`;
      footerProgress.style.width = `${pct}%`;
      
      footerProgress.classList.remove('warning', 'danger');
      if (pct >= 90) {
        footerProgress.classList.add('danger');
      } else if (pct >= 71) {
        footerProgress.classList.add('warning');
      }
    } else {
      footerPct.textContent = `0% usado`;
      footerProgress.style.width = `0%`;
      footerProgress.classList.remove('warning', 'danger');
    }

    sendBtn.disabled = !currentRoot || (!query && selectedFiles.size === 0 && currentTreeMode === 'none');
  }

  let queryDebounceTimer = null;
  queryInput.addEventListener('input', () => {
    clearTimeout(queryDebounceTimer);
    queryDebounceTimer = setTimeout(() => {
      const query = queryInput.value.trim();
      if (query) {
        previewQuery.textContent = `## Pregunta\n${query}`;
        previewQuery.style.display = 'block';
      } else {
        previewQuery.textContent = '';
        previewQuery.style.display = 'none';
      }
      updateStats();
    }, 300);
  });

  const handleSend = async () => {
    if (!currentRoot) return;
    const query = queryInput.value.trim();
    if (!query && selectedFiles.size === 0 && currentTreeMode === 'none') {
      alert('Please enter a query or select files to send.');
      return;
    }
    try {
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending...';

      const prompt = await invoke('build_context', {
        root: currentRoot,
        files: Array.from(selectedFiles),
        query: query,
        treeMode: currentTreeMode,
        showAll: showAllToggle,
        maxTreeEntries: currentTreeLimit,
        maxContextChars: currentPromptLimit,
      });

      await invoke('inject_to_lumo', { text: prompt });

      sendBtn.textContent = 'Sent! ✓';
      setTimeout(() => {
        sendBtn.disabled = false;
        sendBtn.textContent = '➤ Lumo';
      }, 1200);
    } catch (e) {
      console.error(e);
      alert(`Error injecting to Lumo: ${e}`);
      sendBtn.disabled = false;
      sendBtn.textContent = '➤ Lumo';
    }
  };
  sendBtn.addEventListener('click', handleSend);

  // Gutter resizer
  const gutterResizer = document.getElementById('gutter-resizer');
  if (gutterResizer) {
    let isDragging = false;
    let lastScreenX = 0;
    let accumulatedDeltaX = 0;
    let dragRafId = null;

    function scheduleDrag(deltaX) {
      accumulatedDeltaX += deltaX;
      if (dragRafId === null) {
        dragRafId = requestAnimationFrame(async () => {
          const delta = accumulatedDeltaX;
          accumulatedDeltaX = 0;
          dragRafId = null;
          try {
            await invoke('drag_split_delta', { deltaPx: delta });
          } catch (err) {
            console.error('Error during drag split:', err);
          }
        });
      }
    }

    gutterResizer.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { gutterResizer.setPointerCapture(e.pointerId); } catch (_) {}
      isDragging = true;
      lastScreenX = e.screenX;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      gutterResizer.classList.add('dragging');
    });

    gutterResizer.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const deltaX = e.screenX - lastScreenX;
      lastScreenX = e.screenX;
      if (deltaX !== 0) scheduleDrag(deltaX);
    });

    function endDrag(e) {
      if (!isDragging) return;
      isDragging = false;
      try { gutterResizer.releasePointerCapture(e.pointerId); } catch (_) {}
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      gutterResizer.classList.remove('dragging');
    }

    gutterResizer.addEventListener('pointerup', endDrag);
    gutterResizer.addEventListener('pointercancel', endDrag);
  }

  // Vertical Resizer (Left Panel / Right Panel)
  const verticalResizer = document.getElementById('vertical-resizer');
  const leftPanel = document.getElementById('left-panel');
  if (verticalResizer && leftPanel) {
    let isVDragging = false;
    let lastScreenX = 0;

    verticalResizer.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { verticalResizer.setPointerCapture(e.pointerId); } catch (_) {}
      isVDragging = true;
      lastScreenX = e.screenX;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    });

    verticalResizer.addEventListener('pointermove', (e) => {
      if (!isVDragging) return;
      const deltaX = e.screenX - lastScreenX;
      lastScreenX = e.screenX;
      if (deltaX !== 0) {
        const currentWidth = leftPanel.getBoundingClientRect().width;
        leftPanel.style.flex = 'none';
        leftPanel.style.width = `${Math.max(150, currentWidth + deltaX)}px`;
      }
    });

    function endVDrag(e) {
      if (!isVDragging) return;
      isVDragging = false;
      try { verticalResizer.releasePointerCapture(e.pointerId); } catch (_) {}
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }

    verticalResizer.addEventListener('pointerup', endVDrag);
    verticalResizer.addEventListener('pointercancel', endVDrag);
  }
});
