document.addEventListener('DOMContentLoaded', () => {
  const selectDirBtn = document.getElementById('select-dir-btn');
  const sendBtn = document.getElementById('send-btn');
  const repoPathEl = document.getElementById('repo-path');
  const fileTreeEl = document.getElementById('file-tree');
  const queryInput = document.getElementById('query-input');
  const previewBase = document.getElementById('preview-base');
  const previewQuery = document.getElementById('preview-query');
  const previewStats = document.getElementById('preview-stats');
  const selectionCountEl = document.getElementById('selection-count');
  const refreshTreeBtn = document.getElementById('refresh-tree-btn');
  const selectSiblingsBtn = document.getElementById('select-siblings-btn');
  const clearSelectionBtn = document.getElementById('clear-selection-btn');
  const clearTreeBtn = document.getElementById('clear-tree-btn');
  const treeScopeControl = document.getElementById('tree-scope-control');

  let currentRoot = null;
  let selectedFiles = new Set();
  let fileTreeData = null;
  let currentTreeMode = 'full'; // 'full' | 'scoped' | 'none'
  let showAllToggle = false;
  let cachedBaseContext = '';
  let debounceTimer = null;
  let statsTimer = null;

  const gutterResizer = document.getElementById('gutter-resizer');
  const splitControl = document.getElementById('split-control');
  const showAllChk = document.getElementById('show-all-chk');

  if (showAllChk) {
    showAllChk.addEventListener('change', async (e) => {
      showAllToggle = e.target.checked;
      if (currentRoot) {
        await loadFileTree(currentRoot, true); // reload tree, preserving selection
      }
    });
  }

  function updateActiveSplitPreset(ratio) {
    if (!splitControl) return;
    let matched = false;
    splitControl.querySelectorAll('.segment').forEach((btn) => {
      const targetRatio = parseFloat(btn.getAttribute('data-ratio') || '0.5');
      if (Math.abs(targetRatio - ratio) < 0.03) {
        btn.classList.add('active');
        matched = true;
      } else {
        btn.classList.remove('active');
      }
    });
    if (!matched) {
      splitControl.querySelectorAll('.segment').forEach((btn) => btn.classList.remove('active'));
    }
  }

  // Interactive Draggable Splitter Gutter
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
            const newRatio = await invoke('drag_split_delta', { deltaPx: delta });
            updateActiveSplitPreset(newRatio);
          } catch (err) {
            console.error('Error during drag split:', err);
          }
        });
      }
    }

    gutterResizer.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        gutterResizer.setPointerCapture(e.pointerId);
      } catch (_) {}
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
      if (deltaX !== 0) {
        scheduleDrag(deltaX);
      }
    });

    function endDrag(e) {
      if (!isDragging) return;
      isDragging = false;
      try {
        gutterResizer.releasePointerCapture(e.pointerId);
      } catch (_) {}
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      gutterResizer.classList.remove('dragging');
    }

    gutterResizer.addEventListener('pointerup', endDrag);
    gutterResizer.addEventListener('pointercancel', endDrag);
  }

  // Split View Controls
  if (splitControl) {
    splitControl.querySelectorAll('.segment').forEach((btn) => {
      btn.addEventListener('click', async () => {
        splitControl.querySelectorAll('.segment').forEach((s) => s.classList.remove('active'));
        btn.classList.add('active');
        const ratio = parseFloat(btn.getAttribute('data-ratio') || '0.5');
        try {
          await invoke('set_split_ratio', { ratio });
        } catch (e) {
          console.error('Error setting split ratio:', e);
        }
      });
    });
  }

  // Tree Scope Selector (Segmented buttons)
  if (treeScopeControl) {
    treeScopeControl.querySelectorAll('.segment').forEach((btn) => {
      btn.addEventListener('click', () => {
        treeScopeControl.querySelectorAll('.segment').forEach((s) => s.classList.remove('active'));
        btn.classList.add('active');
        currentTreeMode = btn.getAttribute('data-mode') || 'full';
        scheduleUpdateBaseContext();
      });
    });
  }

  // Pick Directory
  selectDirBtn.addEventListener('click', async () => {
    try {
      const path = await invoke('select_directory');
      if (path) {
        currentRoot = path;
        repoPathEl.textContent = `Repo: ${path}`;
        await loadFileTree(path);
      }
    } catch (e) {
      console.error(e);
      if (e !== 'No directory selected') {
        alert(`Error selecting directory: ${e}`);
      }
    }
  });

  // Refresh Tree
  if (refreshTreeBtn) {
    refreshTreeBtn.addEventListener('click', async () => {
      if (!currentRoot) return;
      refreshTreeBtn.style.transform = 'rotate(180deg)';
      refreshTreeBtn.style.transition = 'transform 0.3s ease';
      try {
        await loadFileTree(currentRoot, true);
      } finally {
        setTimeout(() => {
          refreshTreeBtn.style.transform = '';
          refreshTreeBtn.style.transition = '';
        }, 300);
      }
    });
  }

  // Clear Selection
  clearSelectionBtn.addEventListener('click', () => {
    selectedFiles.clear();
    fileTreeEl.querySelectorAll('input[type="checkbox"]').forEach((chk) => {
      chk.checked = false;
    });
    updateSelectionBadge();
    scheduleUpdateBaseContext();
  });

  // Clear / Unload Tree (Close repository)
  if (clearTreeBtn) {
    clearTreeBtn.addEventListener('click', () => {
      currentRoot = null;
      selectedFiles.clear();
      fileTreeData = null;
      repoPathEl.textContent = 'No repository selected';
      fileTreeEl.innerHTML = '';
      cachedBaseContext = '';
      previewBase.textContent = 'Select a directory to inspect repository structure...';
      updateSelectionBadge();
      updateStats();
    });
  }

  // Select Siblings
  selectSiblingsBtn.addEventListener('click', async () => {
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

  function updateSelectionBadge() {
    selectionCountEl.textContent = selectedFiles.size;
  }

  async function loadFileTree(path, preserveSelection = false) {
    try {
      if (!preserveSelection) {
        fileTreeEl.innerHTML = '<div style="color: #888; padding: 0.5rem;">Scanning files...</div>';
        selectedFiles.clear();
      }
      updateSelectionBadge();

      const tree = await invoke('get_file_tree', { path, showAll: showAllToggle });
      fileTreeData = tree;

      fileTreeEl.innerHTML = '';
      renderTree(tree.children, fileTreeEl, 0);

      // Prune selected files that no longer exist
      if (preserveSelection && selectedFiles.size > 0) {
        const existingPaths = new Set();
        function collectPaths(node) {
          if (node.path) existingPaths.add(node.path);
          if (node.children) {
            node.children.forEach(collectPaths);
          }
        }
        collectPaths(tree);
        for (const file of Array.from(selectedFiles)) {
          if (!existingPaths.has(file)) {
            selectedFiles.delete(file);
          }
        }
        updateSelectionBadge();
      }

      // Immediately render preview of repository structure
      scheduleUpdateBaseContext();
    } catch (e) {
      fileTreeEl.innerHTML = `<span style="color: red">Error: ${e}</span>`;
    }
  }

  function renderTree(nodes, container, depth) {
    if (!nodes) return;

    nodes.sort((a, b) => {
      if (a.is_dir && !b.is_dir) return -1;
      if (!a.is_dir && b.is_dir) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const node of nodes) {
      const div = document.createElement('div');
      div.className = 'tree-node';
      div.style.paddingLeft = `${depth * 14}px`;

      if (node.is_dir) {
        div.innerHTML = `<span>📁 ${node.name}</span>`;
        container.appendChild(div);
        if (node.children) {
          renderTree(node.children, container, depth + 1);
        }
      } else {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `chk-${node.path}`;
        checkbox.checked = selectedFiles.has(node.path);

        checkbox.addEventListener('change', (e) => {
          if (e.target.checked) {
            selectedFiles.add(node.path);
          } else {
            selectedFiles.delete(node.path);
          }
          updateSelectionBadge();
          scheduleUpdateBaseContext();
        });

        const label = document.createElement('label');
        label.htmlFor = checkbox.id;
        label.textContent = `📄 ${node.name}`;

        div.appendChild(checkbox);
        div.appendChild(label);
        container.appendChild(div);
      }
    }
  }

  // Debounced IPC call for base context (tree + files)
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

  function updateStats() {
    const query = queryInput.value.trim();
    const totalChars = (cachedBaseContext ? cachedBaseContext.length : 0) + (query ? query.length + 20 : 0);
    const approxTokens = Math.round(totalChars / 3.8);
    previewStats.textContent = `${totalChars.toLocaleString()} chars (~${approxTokens.toLocaleString()} tokens)`;
    sendBtn.disabled = !currentRoot || (!query && selectedFiles.size === 0 && currentTreeMode === 'none');
  }

  let queryDebounceTimer = null;

  queryInput.addEventListener('input', () => {
    // Debounce all DOM updates related to the query to avoid layout thrashing
    // while the user is typing, as the preview area can be massive.
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

  // Send to Lumo
  sendBtn.addEventListener('click', async () => {
    if (!currentRoot) return;

    const query = queryInput.value.trim();
    if (!query && selectedFiles.size === 0 && currentTreeMode === 'none') {
      alert('Please enter a query or select files to send.');
      return;
    }

    try {
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending to Lumo...';

      const prompt = await invoke('build_context', {
        root: currentRoot,
        files: Array.from(selectedFiles),
        query: query,
        treeMode: currentTreeMode,
        showAll: showAllToggle,
      });

      await invoke('inject_to_lumo', { text: prompt });

      sendBtn.textContent = 'Sent! ✓';
      setTimeout(() => {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send to Lumo';
      }, 1200);
    } catch (e) {
      console.error(e);
      alert(`Error injecting to Lumo: ${e}`);
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send to Lumo';
    }
  });

  // Vertical Resizer for Top Section / Query Section
  const horizontalResizer = document.getElementById('horizontal-resizer');
  const querySection = document.getElementById('query-section');
  const mainContent = document.querySelector('.main-content');

  if (horizontalResizer && querySection && mainContent) {
    let isHDragging = false;
    let lastScreenY = 0;

    horizontalResizer.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { horizontalResizer.setPointerCapture(e.pointerId); } catch (_) {}
      isHDragging = true;
      lastScreenY = e.screenY;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'row-resize';
      horizontalResizer.classList.add('dragging');
    });

    horizontalResizer.addEventListener('pointermove', (e) => {
      if (!isHDragging) return;
      const deltaY = e.screenY - lastScreenY;
      lastScreenY = e.screenY;
      if (deltaY !== 0) {
        // We drag DOWN -> deltaY is positive -> query section gets SMALLER
        // We drag UP -> deltaY is negative -> query section gets LARGER
        const currentHeight = querySection.getBoundingClientRect().height;
        const newHeight = currentHeight - deltaY;
        
        // constrain height
        const minHeight = 100;
        const maxHeight = mainContent.getBoundingClientRect().height - 150; 
        if (newHeight >= minHeight && newHeight <= maxHeight) {
          querySection.style.height = `${newHeight}px`;
        }
      }
    });

    function endHDrag(e) {
      if (!isHDragging) return;
      isHDragging = false;
      try { horizontalResizer.releasePointerCapture(e.pointerId); } catch (_) {}
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      horizontalResizer.classList.remove('dragging');
    }

    horizontalResizer.addEventListener('pointerup', endHDrag);
    horizontalResizer.addEventListener('pointercancel', endHDrag);
  }
});
