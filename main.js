document.addEventListener("DOMContentLoaded", () => {
  const thumbItems = Array.from(document.querySelectorAll(".thumb-item"));

  const mainImage = document.getElementById("mainImage");
  const viewerTitle = document.getElementById("viewerTitle");
  const viewerMeta = document.getElementById("viewerMeta");
  const viewerProgress = document.getElementById("viewerProgress");
  const tagPrimary = document.getElementById("tagPrimary");
  const tagSecondary = document.getElementById("tagSecondary");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const notesTextarea = document.getElementById("figureNotes");

  const viewToggleButtons = document.querySelectorAll(".view-toggle-btn");
  const categoryListEl = document.getElementById("categoryList");

  // 新增：整体布局 & sidebar 拖拽
  const appShell = document.querySelector(".app-shell");
  const sidebar = document.querySelector(".sidebar");
  const sidebarResizer = document.getElementById("sidebarResizer");

  // 新增：缩放 & 放大镜
  const zoomInBtn = document.getElementById("zoomInBtn");
  const zoomOutBtn = document.getElementById("zoomOutBtn");
  const zoomResetBtn = document.getElementById("zoomResetBtn");
  const imageFrame = document.getElementById("imageFrame");
  const magnifierLens = document.getElementById("magnifierLens");

  // 新增：交互模式按钮
  const modeButtons = document.querySelectorAll(".mode-btn");

  // 模式：click | zoom | drag
  let interactionMode = "click";
  

  let currentIndex = -1;
  let currentView = "venue";   // "venue" | "topic"
  let activeCategory = "All";  // 顶层：venue 或 topic
  let activePaper = "All";     // 第二层：paper key（只在 venue 视图有用）

  const collapsedVenues = new Set(); // 哪些 venue 是折叠状态

  /* === localStorage: notes 持久化 === */
  const STORAGE_KEY = "ye_figure_notes_v1";

  function loadNotesStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return new Map();
      const obj = JSON.parse(raw);
      const map = new Map();
      Object.entries(obj).forEach(([k, v]) => {
        map.set(k, v);
      });
      return map;
    } catch (e) {
      console.warn("Failed to load notes from storage", e);
      return new Map();
    }
  }

  function saveNotesStore() {
    try {
      const obj = Object.fromEntries(notesStore.entries());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {
      console.warn("Failed to save notes to storage", e);
    }
  }

  const notesStore = loadNotesStore();

  function getKeyForIndex(index) {
    const item = thumbItems[index];
    if (!item) return String(index);
    const id = item.getAttribute("data-id");
    return id || String(index);
  }

  function getVisibleItems() {
    return thumbItems.filter((item) => item.style.display !== "none");
  }

  /* ========== 图像缩放 & 放大镜 ========= */

  let currentZoom = 1;
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 4;
  const ZOOM_STEP = 0.25;
  const LENS_SCALE = 2; // 放大镜倍率

  function applyZoom() {
    if (!mainImage) return;
    mainImage.style.transform = `scale(${currentZoom})`;
    mainImage.style.transformOrigin = "center center";
    updateMagnifierBackground();
  }

  function updateZoom(delta) {
    let next = currentZoom + delta;
    next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
    currentZoom = next;
    applyZoom();
  }

  zoomInBtn?.addEventListener("click", () => updateZoom(ZOOM_STEP));
  zoomOutBtn?.addEventListener("click", () => updateZoom(-ZOOM_STEP));
  zoomResetBtn?.addEventListener("click", () => {
    currentZoom = 1;
    applyZoom();
  });

  // 图片加载完成后重新应用缩放 & 放大镜背景
  mainImage.addEventListener("load", () => {
    applyZoom();
  });

  function updateMagnifierBackground() {
    if (!mainImage.src || !magnifierLens) return;
    const imgRect = mainImage.getBoundingClientRect();
    const bgWidth = imgRect.width * LENS_SCALE * currentZoom;
    const bgHeight = imgRect.height * LENS_SCALE * currentZoom;
    magnifierLens.style.backgroundImage = `url(${mainImage.src})`;
    magnifierLens.style.backgroundSize = `${bgWidth}px ${bgHeight}px`;
  }

  function moveLens(e) {
    if (!mainImage.src) return;
    const frameRect = imageFrame.getBoundingClientRect();
    const imgRect = mainImage.getBoundingClientRect();
    const lensRect = magnifierLens.getBoundingClientRect();

    let x = e.clientX - frameRect.left;
    let y = e.clientY - frameRect.top;

    const lensHalfW = lensRect.width / 2;
    const lensHalfH = lensRect.height / 2;

    // 限制 lens 在 frame 内部
    x = Math.max(lensHalfW, Math.min(frameRect.width - lensHalfW, x));
    y = Math.max(lensHalfH, Math.min(frameRect.height - lensHalfH, y));

    magnifierLens.style.left = `${x - lensHalfW}px`;
    magnifierLens.style.top = `${y - lensHalfH}px`;

    // 计算相对于图片的位置比例
    const relX = (x - (imgRect.left - frameRect.left)) / imgRect.width;
    const relY = (y - (imgRect.top - frameRect.top)) / imgRect.height;

    const bgW = imgRect.width * LENS_SCALE * currentZoom;
    const bgH = imgRect.height * LENS_SCALE * currentZoom;

    const bgX = -relX * (bgW - lensRect.width);
    const bgY = -relY * (bgH - lensRect.height);

    magnifierLens.style.backgroundPosition = `${bgX}px ${bgY}px`;
  }

  if (imageFrame && magnifierLens) {
    imageFrame.addEventListener("mouseenter", () => {
      if (!mainImage.src) return;
      if (interactionMode !== "zoom") {
        magnifierLens.style.display = "none";
        return;
      }
      magnifierLens.style.display = "block";
      updateMagnifierBackground();
    });

    imageFrame.addEventListener("mouseleave", () => {
      magnifierLens.style.display = "none";
      // 退出区域时顺便结束拖拽
      isPanning = false;
      imageFrame.classList.remove("panning");
    });

    imageFrame.addEventListener("mousemove", (e) => {
      if (interactionMode === "zoom") {
        moveLens(e);
      }
      // drag 模式的移动逻辑在全局 mousemove 里处理
    });
  }
    /* ========== Drag 模式：按住左键拖拽平移 ========= */
    let isPanning = false;
    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let startScrollTop = 0;
  
    if (imageFrame) {
      imageFrame.addEventListener("mousedown", (e) => {
        if (interactionMode !== "drag") return;
        if (e.button !== 0) return; // 只响应左键
  
        isPanning = true;
        imageFrame.classList.add("panning");
        startX = e.clientX;
        startY = e.clientY;
        startScrollLeft = imageFrame.scrollLeft;
        startScrollTop = imageFrame.scrollTop;
        e.preventDefault();
      });
    }
  
    document.addEventListener("mousemove", (e) => {
      if (!isPanning || interactionMode !== "drag") return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      imageFrame.scrollLeft = startScrollLeft - dx;
      imageFrame.scrollTop = startScrollTop - dy;
    });
  
    document.addEventListener("mouseup", () => {
      if (!isPanning) return;
      isPanning = false;
      imageFrame.classList.remove("panning");
    });

    function setInteractionMode(mode) {
      interactionMode = mode;
  
      // 更新按钮 active 状态
      modeButtons.forEach((btn) => {
        btn.classList.toggle("active", btn.getAttribute("data-mode") === mode);
      });
  
      // 更新图像区域的 mode class
      if (!imageFrame) return;
      imageFrame.classList.remove("mode-click", "mode-zoom", "mode-drag");
      imageFrame.classList.add(`mode-${mode}`);
  
      // 切换模式时关掉放大镜
      magnifierLens.style.display = "none";
      isPanning = false;
      imageFrame.classList.remove("panning");
    }
  
    // 模式按钮点击绑定
    modeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.getAttribute("data-mode");
        if (!mode) return;
        setInteractionMode(mode);
      });
    });
  
    // 初始化：默认 click 模式
    setInteractionMode("click");
  
  


  /* ========== Sidebar 拖拽调整宽度 ========= */

  let isResizingSidebar = false;

  sidebarResizer?.addEventListener("mousedown", (e) => {
    isResizingSidebar = true;
    document.body.style.cursor = "col-resize";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isResizingSidebar || !appShell || !sidebar) return;
    const shellRect = appShell.getBoundingClientRect();
    const minWidth = 260;
    const maxWidth = shellRect.width - 260;
    let newWidth = e.clientX - shellRect.left;
    newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
    sidebar.style.width = `${newWidth}px`;
  });

  document.addEventListener("mouseup", () => {
    if (isResizingSidebar) {
      isResizingSidebar = false;
      document.body.style.cursor = "";
    }
  });

  /* ========== 过滤 & 目录逻辑 ========= */

  function applyFilter() {
    thumbItems.forEach((item) => {
      const venue = item.getAttribute("data-venue") || "";
      const topic = item.getAttribute("data-topic") || "";
      const paper = item.getAttribute("data-paper") || "";

      let matchTop;
      if (currentView === "venue") {
        matchTop = activeCategory === "All" || venue === activeCategory;
      } else {
        matchTop = activeCategory === "All" || topic === activeCategory;
      }

      let matchPaper = true;
      if (currentView === "venue" && activePaper !== "All") {
        matchPaper = paper === activePaper;
      }

      const match = matchTop && matchPaper;
      item.style.display = match ? "" : "none";
    });

    const visible = getVisibleItems();

    if (visible.length === 0) {
      mainImage.src = "";
      viewerTitle.textContent = "No figures in this category";
      viewerMeta.textContent = "";
      tagPrimary.textContent = "—";
      tagSecondary.textContent = "—";
      viewerProgress.textContent = "0 / 0";
      notesTextarea.value = "";
      currentIndex = -1;
      return;
    }

    if (
      currentIndex < 0 ||
      !visible.includes(thumbItems[currentIndex])
    ) {
      const firstVisible = visible[0];
      const newIndex = thumbItems.indexOf(firstVisible);
      updateViewer(newIndex, false);
    } else {
      updateViewer(currentIndex, false);
    }
  }

  function updateViewer(index, scrollIntoView = true) {
    if (index < 0 || index >= thumbItems.length) return;
    const item = thumbItems[index];
    if (item.style.display === "none") return;

    thumbItems.forEach((it, i) => {
      it.classList.toggle("active", i === index);
    });

    const fullSrc = item.getAttribute("data-full");
    const title = item.getAttribute("data-title") || "Figure";
    const meta = item.getAttribute("data-meta") || "";
    const primary = item.getAttribute("data-tag-primary") || "Figure";
    const secondary =
      item.getAttribute("data-tag-secondary") || "—";

    // 切换图片时重置缩放
    currentZoom = 1;

    mainImage.src = fullSrc;
    mainImage.alt = title;
    viewerTitle.textContent = title;
    viewerMeta.textContent = meta;
    tagPrimary.textContent = primary;
    tagSecondary.textContent = secondary;

    const visible = getVisibleItems();
    const rank = visible.indexOf(item) + 1;
    viewerProgress.textContent = visible.length
      ? `${rank} / ${visible.length}`
      : "0 / 0";

    currentIndex = index;

    const key = getKeyForIndex(index);
    notesTextarea.value = notesStore.get(key) || "";

    if (scrollIntoView) {
      item.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    }
  }

  thumbItems.forEach((item, index) => {
    item.addEventListener("click", () => {
      updateViewer(index, false);
    });
  });

  function findNextVisible(startIndex, direction) {
    if (thumbItems.length === 0) return -1;
    let index = startIndex;
    for (let i = 0; i < thumbItems.length; i++) {
      index = (index + direction + thumbItems.length) % thumbItems.length;
      if (thumbItems[index].style.display !== "none") {
        return index;
      }
    }
    return startIndex;
  }

  function goPrev() {
    if (currentIndex === -1) return;
    const nextIndex = findNextVisible(currentIndex, -1);
    updateViewer(nextIndex);
  }

  function goNext() {
    if (currentIndex === -1) return;
    const nextIndex = findNextVisible(currentIndex, 1);
    updateViewer(nextIndex);
  }

  prevBtn.addEventListener("click", goPrev);
  nextBtn.addEventListener("click", goNext);

  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      goPrev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      goNext();
    }
  });

  notesTextarea.addEventListener("input", () => {
    if (currentIndex < 0) return;
    const key = getKeyForIndex(currentIndex);
    notesStore.set(key, notesTextarea.value);
    saveNotesStore();
  });

  function refreshCategoryActiveStates() {
    categoryListEl
      .querySelectorAll(".category-item")
      .forEach((btn) => {
        const val = btn.getAttribute("data-value");
        const isActive =
          (activeCategory === "All" && val === "All") ||
          (activeCategory !== "All" && val === activeCategory);
        btn.classList.toggle("active", isActive);
      });

    categoryListEl
      .querySelectorAll(".paper-item")
      .forEach((btn) => {
        const v = btn.getAttribute("data-venue");
        const p = btn.getAttribute("data-paper");
        const isActive =
          currentView === "venue" &&
          v === activeCategory &&
          p === activePaper;
        btn.classList.toggle("active", isActive);
      });
  }

  function buildCategories() {
    categoryListEl.innerHTML = "";

    if (currentView === "topic") {
      const topicCount = new Map();

      thumbItems.forEach((item) => {
        const topic = item.getAttribute("data-topic");
        if (!topic) return;
        topicCount.set(topic, (topicCount.get(topic) || 0) + 1);
      });

      const total = thumbItems.length;
      const allBtn = document.createElement("button");
      allBtn.className = "category-item";
      allBtn.setAttribute("data-value", "All");
      allBtn.innerHTML = `
        <span>All topics</span>
        <span class="category-item-count">${total}</span>
      `;
      categoryListEl.appendChild(allBtn);

      const names = Array.from(topicCount.keys()).sort();
      names.forEach((name) => {
        const btn = document.createElement("button");
        btn.className = "category-item";
        btn.setAttribute("data-value", name);
        btn.innerHTML = `
          <span>${name}</span>
          <span class="category-item-count">${topicCount.get(name)}</span>
        `;
        categoryListEl.appendChild(btn);
      });

      refreshCategoryActiveStates();
      return;
    }

    // venue 视图：venue + paper 两级 + 折叠
    const venueMap = new Map();
    thumbItems.forEach((item) => {
      const venue = item.getAttribute("data-venue") || "Unknown";
      const paperKey = item.getAttribute("data-paper") || "__noPaper__";
      const paperTitle =
        item.getAttribute("data-paper-title") || "Untitled figure set";

      if (!venueMap.has(venue)) {
        venueMap.set(venue, {
          count: 0,
          papers: new Map(),
        });
      }
      const venueEntry = venueMap.get(venue);
      venueEntry.count++;

      if (!venueEntry.papers.has(paperKey)) {
        venueEntry.papers.set(paperKey, {
          title: paperTitle,
          count: 0,
        });
      }
      venueEntry.papers.get(paperKey).count++;
    });

    const total = thumbItems.length;
    const allBtn = document.createElement("button");
    allBtn.className = "category-item";
    allBtn.setAttribute("data-value", "All");
    allBtn.innerHTML = `
      <span>All venues</span>
      <span class="category-item-count">${total}</span>
    `;
    categoryListEl.appendChild(allBtn);

    const sortedVenues = Array.from(venueMap.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );

    sortedVenues.forEach(([venueName, entry]) => {
      const group = document.createElement("div");
      group.className = "category-venue-group";

      const isCollapsed = collapsedVenues.has(venueName);

      const venueBtn = document.createElement("button");
      venueBtn.className = "category-item";
      venueBtn.setAttribute("data-value", venueName);
      venueBtn.setAttribute("data-collapsed", isCollapsed ? "true" : "false");
      venueBtn.innerHTML = `
        <span class="category-main-label">
          <span class="category-chevron">▾</span>
          <span class="category-text">${venueName}</span>
        </span>
        <span class="category-item-count">${entry.count}</span>
      `;
      group.appendChild(venueBtn);

      const paperListEl = document.createElement("div");
      paperListEl.className = "paper-list";
      if (isCollapsed) {
        paperListEl.style.display = "none";
      }

      const sortedPapers = Array.from(entry.papers.entries()).sort(
        (a, b) => a[1].title.localeCompare(b[1].title)
      );

      sortedPapers.forEach(([paperKey, paperInfo]) => {
        const paperBtn = document.createElement("button");
        paperBtn.type = "button";
        paperBtn.className = "paper-item";
        paperBtn.setAttribute("data-venue", venueName);
        paperBtn.setAttribute("data-paper", paperKey);
        paperBtn.innerHTML = `
          <span>${paperInfo.title}</span>
          <span class="paper-item-count">${paperInfo.count}</span>
        `;
        paperListEl.appendChild(paperBtn);
      });

      group.appendChild(paperListEl);
      categoryListEl.appendChild(group);
    });

    refreshCategoryActiveStates();
  }

  categoryListEl.addEventListener("click", (e) => {
    const chevron = e.target.closest(".category-chevron");
    const paperBtn = e.target.closest(".paper-item");
    const categoryBtn = e.target.closest(".category-item");

    if (chevron) {
      const venueBtn = chevron.closest(".category-item");
      if (!venueBtn) return;
      const v = venueBtn.getAttribute("data-value");
      if (!v || v === "All") return;

      if (collapsedVenues.has(v)) {
        collapsedVenues.delete(v);
      } else {
        collapsedVenues.add(v);
      }
      buildCategories();
      return;
    }

    if (paperBtn) {
      const v = paperBtn.getAttribute("data-venue") || "All";
      const p = paperBtn.getAttribute("data-paper") || "All";
      activeCategory = v;
      activePaper = p;

      refreshCategoryActiveStates();
      applyFilter();
      return;
    }

    if (categoryBtn) {
      const value = categoryBtn.getAttribute("data-value");
      if (!value) return;

      activeCategory = value;
      activePaper = "All";

      refreshCategoryActiveStates();
      applyFilter();
    }
  });

  viewToggleButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.getAttribute("data-view");
      if (!view || view === currentView) return;

      currentView = view;
      activeCategory = "All";
      activePaper = "All";

      viewToggleButtons.forEach((b) =>
        b.classList.toggle(
          "active",
          b.getAttribute("data-view") === view
        )
      );

      buildCategories();
      applyFilter();
    });
  });

  // 初始化
  buildCategories();
  applyFilter();

  const visible = getVisibleItems();
  if (visible.length > 0) {
    const firstVisible = visible[0];
    const idx = thumbItems.indexOf(firstVisible);
    updateViewer(idx, false);
  } else {
    viewerProgress.textContent = "0 / 0";
  }
});
